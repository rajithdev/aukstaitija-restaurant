import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import { CATEGORIES, DISHES } from '@/lib/seedData'
import { createCourierRequest, isValidProvider, PROVIDERS } from '@/lib/deliveryService'
import { hashPassword, verifyPassword, signSession, readSession, buildSessionCookie, buildClearCookie, publicUser } from '@/lib/auth'

let clientPromise

async function connectToMongo() {
  if (!clientPromise) {
    const client = new MongoClient(process.env.MONGO_URL)
    clientPromise = client.connect().then(c => c.db(process.env.DB_NAME || 'aukstaitija_restaurant'))
  }
  return clientPromise
}

function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-token')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

function isAdmin(request) {
  const token = request.headers.get('x-admin-token')
  return token && token === (process.env.ADMIN_PASSWORD || 'admin123')
}

// ---------- Reservation time validation -----------------------------------
// All same-day reservation logic is anchored to the restaurant's wall clock
// (Kaunas, Lithuania) so the server doesn't rely on the container's UTC time
// when deciding "what is in the past".
const RESTAURANT_TZ = process.env.RESTAURANT_TIMEZONE || 'Europe/Vilnius'
const RESERVATION_LEAD_MIN = 30
// Assumed dwell time per reservation. Used to compute overlap windows so we
// don't double-book a table that's still mid-service.
const RESERVATION_DURATION_MIN = 90
// Reservation statuses that should occupy a table for capacity purposes.
// (cancelled / no_show / completed are released back to the pool.)
const ACTIVE_RES_STATUSES = ['pending', 'confirmed', 'table_assigned', 'arrived', 'checked_in']

function getRestaurantNow() {
  const now = new Date()
  // en-CA gives ISO-style YYYY-MM-DD
  const dateStr = new Intl.DateTimeFormat('en-CA', {
    timeZone: RESTAURANT_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now)
  // en-GB gives 24-hour HH:mm
  const [hStr, mStr] = new Intl.DateTimeFormat('en-GB', {
    timeZone: RESTAURANT_TZ, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(now).split(':')
  const hour = parseInt(hStr, 10) % 24 // some locales emit "24:xx" at midnight
  const minute = parseInt(mStr, 10)
  return { dateStr, minutes: hour * 60 + minute }
}

function timeStrToMinutes(t) {
  if (!t || typeof t !== 'string') return NaN
  const [h, m] = t.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return NaN
  return h * 60 + m
}

// Returns true if the given reservation date/time slot is in the past or
// inside the lead-time buffer (default 30 min) — i.e. cannot be booked.
function isPastReservationSlot(date, time, restNow = getRestaurantNow()) {
  if (!date || !time) return true
  if (date < restNow.dateStr) return true
  if (date > restNow.dateStr) return false
  const slotMin = timeStrToMinutes(time)
  if (Number.isNaN(slotMin)) return true
  return slotMin < restNow.minutes + RESERVATION_LEAD_MIN
}

// Capacity-aware slot availability:
// returns the array of tables that could host a `guests`-party reservation at
// `time`, taking into account 90-minute service overlap with existing
// reservations on the same date.
//
//   • A table is "blocked" when it is explicitly assigned to an overlapping
//     reservation (table_id matches).
//   • Unassigned overlapping reservations greedily consume the smallest still-
//     free table that fits their party size, so a 6-top pending reservation
//     can't double-claim a 2-top.
//   • Tables with status `out_of_service` are never bookable.
//
// Returns the list of tables (capacity >= guests) that remain available.
function suitableTablesForSlot({ slotTime, guests, sameDayReservations, allTables }) {
  const slotMin = timeStrToMinutes(slotTime)
  if (Number.isNaN(slotMin)) return []
  const slotEnd = slotMin + RESERVATION_DURATION_MIN

  const overlapping = sameDayReservations.filter(r => {
    if (!ACTIVE_RES_STATUSES.includes(r.status)) return false
    const rStart = timeStrToMinutes(r.time)
    if (Number.isNaN(rStart)) return false
    const rEnd = rStart + RESERVATION_DURATION_MIN
    // standard half-open interval overlap
    return rEnd > slotMin && rStart < slotEnd
  })

  const bookable = (allTables || []).filter(t => t.status !== 'out_of_service')

  const blocked = new Set()
  // 1) pin down explicitly assigned tables
  for (const r of overlapping) {
    if (r.table_id) blocked.add(r.table_id)
  }
  // 2) greedily reserve the smallest fitting table for each unassigned
  //    overlapping reservation so we don't double-count capacity.
  const unassigned = overlapping
    .filter(r => !r.table_id)
    .sort((a, b) => (b.guests || 1) - (a.guests || 1))
  for (const r of unassigned) {
    const need = r.guests || 1
    const candidate = bookable
      .filter(t => !blocked.has(t.id) && t.capacity >= need)
      .sort((a, b) => a.capacity - b.capacity)[0]
    if (candidate) blocked.add(candidate.id)
    // If no candidate fits, the system is already over-promised — we just
    // don't add anything to `blocked` for this reservation. Remaining
    // suitable-table count is still capped by the bookable list, so this
    // doesn't create false availability.
  }

  return bookable.filter(t => !blocked.has(t.id) && t.capacity >= guests)
}

async function ensureSeeded(db) {
  const dishCount = await db.collection('dishes').countDocuments()
  if (dishCount === 0) {
    await db.collection('dishes').insertMany(DISHES.map(d => ({ ...d })))
  }
  const catCount = await db.collection('categories').countDocuments()
  if (catCount === 0) {
    await db.collection('categories').insertMany(CATEGORIES.map(c => ({ ...c })))
  }
  const tablesCount = await db.collection('tables').countDocuments()
  // Migrate old tables (without status field) by reseeding
  const needsMigration = await db.collection('tables').findOne({ status: { $exists: false } })
  if (needsMigration || tablesCount === 0) {
    await db.collection('tables').deleteMany({})
    const TABLES = [
      { id: 't1', number: 1, capacity: 2, status: 'available', section: 'Window', x: 0, y: 0 },
      { id: 't2', number: 2, capacity: 2, status: 'available', section: 'Window', x: 1, y: 0 },
      { id: 't3', number: 3, capacity: 2, status: 'available', section: 'Window', x: 2, y: 0 },
      { id: 't4', number: 4, capacity: 2, status: 'available', section: 'Window', x: 3, y: 0 },
      { id: 't5', number: 5, capacity: 4, status: 'available', section: 'Main Hall', x: 0, y: 1 },
      { id: 't6', number: 6, capacity: 4, status: 'available', section: 'Main Hall', x: 1, y: 1 },
      { id: 't7', number: 7, capacity: 4, status: 'available', section: 'Main Hall', x: 2, y: 1 },
      { id: 't8', number: 8, capacity: 4, status: 'available', section: 'Main Hall', x: 3, y: 1 },
      { id: 't9', number: 9, capacity: 8, status: 'available', section: 'Private Room', x: 0, y: 2 },
      { id: 't10', number: 10, capacity: 8, status: 'available', section: 'Private Room', x: 3, y: 2 },
    ]
    await db.collection('tables').insertMany(TABLES)
  }

  // Delivery zones — seed 3 default Kaunas zones if empty
  const zonesCount = await db.collection('delivery_zones').countDocuments()
  if (zonesCount === 0) {
    await db.collection('delivery_zones').insertMany([
      { id: uuidv4(), name: 'Centras', name_lt: 'Kauno centras', fee: 2.50, eta_minutes: 25, postal_codes: ['44280', '44281', '44282', '44283', '44290'], active: true },
      { id: uuidv4(), name: 'Žaliakalnis', name_lt: 'Žaliakalnis', fee: 3.50, eta_minutes: 35, postal_codes: ['44300', '44301', '44302', '44303'], active: true },
      { id: uuidv4(), name: 'Šilainiai', name_lt: 'Šilainiai', fee: 4.50, eta_minutes: 45, postal_codes: ['46249', '46250', '46251', '46252'], active: true },
    ])
  }
}

// Helpers for table lifecycle
async function getActiveSession(db, tableId) {
  return await db.collection('table_sessions').findOne({ table_id: tableId, session_status: 'active' })
}

async function setTableStatus(db, tableId, status) {
  await db.collection('tables').updateOne({ id: tableId }, { $set: { status } })
}

async function autoUpdateTableStatuses(db) {
  const now = new Date()
  const tables = await db.collection('tables').find({}).toArray()
  for (const t of tables) {
    if (t.status === 'out_of_service' || t.status === 'cleaning') continue
    const session = await getActiveSession(db, t.id)
    if (session) {
      if (t.status !== 'occupied') await setTableStatus(db, t.id, 'occupied')
      continue
    }
    // Check for arrived reservations first (customer is here but not seated yet)
    const arrivedReservation = await db.collection('reservations').findOne({
      table_id: t.id,
      status: 'arrived'
    })
    if (arrivedReservation) {
      if (t.status !== 'occupied') await setTableStatus(db, t.id, 'occupied')
      continue
    }
    // Look for assigned reservations (any future reservation or very recent past)
    const reservations = await db.collection('reservations').find({
      table_id: t.id,
      status: { $in: ['confirmed', 'pending', 'table_assigned'] }
    }).toArray()
    let isReserved = false
    for (const r of reservations) {
      const resDt = new Date(`${r.date}T${r.time}:00`)
      const diff = resDt.getTime() - now.getTime()
      // Mark as reserved if reservation is in the future or within past 30 min
      if (diff > -30 * 60 * 1000) {
        isReserved = true
      } else if (diff < -30 * 60 * 1000) {
        // No-show: past 30 min and not checked in
        await db.collection('reservations').updateOne(
          { id: r.id },
          { $set: { status: 'no_show', no_show_at: new Date() } }
        )
      }
    }
    const newStatus = isReserved ? 'reserved' : 'available'
    if (t.status !== newStatus) await setTableStatus(db, t.id, newStatus)
  }
}

function stripId(doc) {
  if (!doc) return doc
  const { _id, ...rest } = doc
  return rest
}

// True if an order is dine-in. Different parts of the app set different fields
// (legacy `type`, newer `order_type`, table_id), so check all three.
function isDineIn(order) {
  if (!order) return false
  return order.type === 'dine-in' || order.order_type === 'dine_in' || !!order.table_id
}

// Compact "1× Cepelinai, 2× Beer" string used in waiter notifications. Caps
// long lists with a "… +N more" tail so the notification card stays readable.
function summariseItems(items, max = 4) {
  if (!Array.isArray(items) || items.length === 0) return ''
  const head = items.slice(0, max).map(i => `${i.quantity || 1}× ${i.name}`).join(', ')
  return items.length > max ? `${head}, +${items.length - max} more` : head
}

// Public, URL-friendly reservation code (RSV-XXXXXX). Uses a 32-char
// alphabet that drops confusable glyphs (I/O/0/1) so users can read codes
// off a confirmation email without hitting OCR pain. Collisions are
// extremely unlikely (~1B keyspace) but we still guard against them at
// insertion time with a small retry loop.
const RSV_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
function generateReservationCode() {
  let code = ''
  for (let i = 0; i < 6; i++) code += RSV_ALPHABET[Math.floor(Math.random() * RSV_ALPHABET.length)]
  return `RSV-${code}`
}
async function generateUniqueReservationCode(db) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReservationCode()
    const exists = await db.collection('reservations').findOne({ reservation_code: code })
    if (!exists) return code
  }
  // Fallback — embed timestamp segment for guaranteed uniqueness
  return `RSV-${Date.now().toString(36).slice(-6).toUpperCase()}`
}

// Backfill reservation_code on legacy rows. Reservations created before this
// feature existed only have `confirmation` (RES######). We mint a new RSV-
// code on first read so the tracking URL always works, regardless of when the
// reservation was made.
async function ensureReservationCode(db, reservation) {
  if (!reservation || reservation.reservation_code) return reservation
  const code = await generateUniqueReservationCode(db)
  await db.collection('reservations').updateOne(
    { id: reservation.id },
    { $set: { reservation_code: code } }
  )
  return { ...reservation, reservation_code: code }
}

// Customer-safe view of a reservation. Strips owner PII (full email/phone)
// and the user_id, but keeps the data the tracking page needs to render the
// timeline and the table-reveal block. Used by the public tracker endpoints.
function publicReservationView(reservation, table) {
  if (!reservation) return null
  const tableRevealed = ['table_assigned', 'arrived', 'checked_in'].includes(reservation.status)
  return {
    id: reservation.id,
    reservation_code: reservation.reservation_code,
    confirmation: reservation.confirmation,
    name: reservation.name,
    date: reservation.date,
    time: reservation.time,
    guests: reservation.guests,
    seating_preference: reservation.seating_preference,
    occasion: reservation.occasion,
    special_requests: reservation.special_requests,
    notes: reservation.notes,
    status: reservation.status,
    table_id: tableRevealed ? reservation.table_id : null,
    table_number: tableRevealed && table ? table.number : null,
    table_section: tableRevealed && table ? table.section : null,
    confirmed_at: reservation.confirmed_at || null,
    table_assigned_at: reservation.table_assigned_at || null,
    arrived_at: reservation.arrived_at || null,
    checked_in_at: reservation.checked_in_at || null,
    completed_at: reservation.completed_at || null,
    cancelled_at: reservation.cancelled_at || null,
    no_show_at: reservation.no_show_at || null,
    created_at: reservation.created_at,
    has_user: !!reservation.user_id,
  }
}


// ---------------- Notification helpers ----------------
// In-app notifications go into the `notifications` collection and are read by
// the customer profile UI. Email/SMS are *queued* (collections only, no
// provider integration yet) so we can wire them up later without changing the
// table-assignment flow.
async function createNotification(db, { user_id, reservation_id, type, title, message, meta }) {
  if (!user_id) return null // Guest reservation — nothing to deliver in-app
  const doc = {
    id: uuidv4(),
    user_id,
    reservation_id: reservation_id || null,
    type,
    title,
    message,
    meta: meta || {},
    read: false,
    created_at: new Date(),
  }
  await db.collection('notifications').insertOne(doc)
  return doc
}

async function enqueueEmail(db, { to, subject, body, meta, type }) {
  if (!to) return null
  const doc = {
    id: uuidv4(),
    to,
    subject: subject || '',
    body: body || '',
    type: type || 'generic',
    meta: meta || {},
    status: 'pending', // pending | sent | failed (no provider yet)
    attempts: 0,
    created_at: new Date(),
    sent_at: null,
  }
  await db.collection('email_queue').insertOne(doc)
  return doc
}

async function enqueueSMS(db, { to, body, meta, type }) {
  if (!to) return null
  const doc = {
    id: uuidv4(),
    to,
    body: body || '',
    type: type || 'generic',
    meta: meta || {},
    status: 'pending',
    attempts: 0,
    created_at: new Date(),
    sent_at: null,
  }
  await db.collection('sms_queue').insertOne(doc)
  return doc
}

// Fired when a manager assigns a table. Sends an in-app notification and
// pushes one entry into each delivery queue so the email/SMS workers can pick
// it up later. Safe for guest reservations — falls back to phone/email only.
async function notifyTableAssigned(db, reservation, table) {
  const tableLabel = `T${table.number}`
  const section = table.section || 'Main hall'
  const title = 'Your table is ready'
  const message = `Table ${tableLabel} has been reserved for you at ${reservation.time}. Section: ${section}.`
  const meta = {
    table_number: table.number,
    table_id: table.id,
    section,
    time: reservation.time,
    date: reservation.date,
    guests: reservation.guests,
    confirmation: reservation.confirmation,
  }

  // 1) In-app (only for registered users)
  if (reservation.user_id) {
    await createNotification(db, {
      user_id: reservation.user_id,
      reservation_id: reservation.id,
      type: 'reservation_table_assigned',
      title,
      message,
      meta,
    })
  }

  // 2) Email queue (always queued if we have an email)
  if (reservation.email) {
    await enqueueEmail(db, {
      to: reservation.email,
      subject: `${title} — Table ${tableLabel} at Aukštaitija`,
      body: `Hi ${reservation.name || 'there'},\n\n${message}\nGuests: ${reservation.guests}.\n\nWe'll see you soon.\n— Aukštaitija`,
      type: 'reservation_table_assigned',
      meta,
    })
  }

  // 3) SMS queue (always queued if we have a phone)
  if (reservation.phone) {
    await enqueueSMS(db, {
      to: reservation.phone,
      body: `Aukštaitija: Table ${tableLabel} reserved for you at ${reservation.time} (${section}). See you soon!`,
      type: 'reservation_table_assigned',
      meta,
    })
  }
}


async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()
    await ensureSeeded(db)

    // Resolve the current customer from the HTTP-only session cookie. Returns
    // null for guests or when the JWT is invalid. Cached on the request scope.
    let _userCache
    const currentUser = async () => {
      if (_userCache !== undefined) return _userCache
      const session = await readSession(request)
      if (!session?.uid) { _userCache = null; return null }
      const user = await db.collection('users').findOne({ id: session.uid })
      _userCache = user || null
      return _userCache
    }

    // Health
    if ((route === '/' || route === '/root') && method === 'GET') {
      return handleCORS(NextResponse.json({ message: 'Aukstaitija API', status: 'ok' }))
    }

    // ---------------- Categories ----------------
    if (route === '/categories' && method === 'GET') {
      const cats = await db.collection('categories').find({}).sort({ order: 1 }).toArray()
      return handleCORS(NextResponse.json(cats.map(stripId)))
    }

    // ---------------- Dishes ----------------
    if (route === '/dishes' && method === 'GET') {
      const url = new URL(request.url)
      const search = url.searchParams.get('search') || ''
      const category = url.searchParams.get('category') || ''
      const dietary = url.searchParams.get('dietary') || ''
      const sort = url.searchParams.get('sort') || ''

      const query = {}
      if (search) {
        query.$or = [
          { name: { $regex: search, $options: 'i' } },
          { name_lt: { $regex: search, $options: 'i' } },
          { description: { $regex: search, $options: 'i' } },
        ]
      }
      if (category && category !== 'all') query.category = category
      if (dietary && dietary !== 'all') query.dietary_tags = dietary

      let sortObj = { bestseller: -1 }
      if (sort === 'price_asc') sortObj = { price: 1 }
      else if (sort === 'price_desc') sortObj = { price: -1 }
      else if (sort === 'popular') sortObj = { bestseller: -1 }

      const dishes = await db.collection('dishes').find(query).sort(sortObj).toArray()
      return handleCORS(NextResponse.json(dishes.map(stripId)))
    }

    // GET /dishes/:id
    if (path[0] === 'dishes' && path.length === 2 && method === 'GET') {
      const dish = await db.collection('dishes').findOne({ id: path[1] })
      if (!dish) return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      return handleCORS(NextResponse.json(stripId(dish)))
    }

    // POST /dishes (admin)
    if (route === '/dishes' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      const newDish = {
        id: body.id || uuidv4(),
        name: body.name || 'New Dish',
        name_lt: body.name_lt || body.name || 'Naujas patiekalas',
        description: body.description || '',
        description_lt: body.description_lt || body.description || '',
        price: parseFloat(body.price) || 0,
        category: body.category || 'mains',
        dietary_tags: body.dietary_tags || [],
        spice_level: parseInt(body.spice_level) || 0,
        available: body.available !== false,
        prep_time: parseInt(body.prep_time) || 15,
        bestseller: !!body.bestseller,
        image_url: body.image_url || '',
        ingredients: body.ingredients || [],
        allergens: body.allergens || [],
        nutrition: body.nutrition || { calories: 0, protein: 0, carbs: 0, fat: 0 },
      }
      await db.collection('dishes').insertOne(newDish)
      return handleCORS(NextResponse.json(stripId(newDish)))
    }

    // PUT /dishes/:id (admin)
    if (path[0] === 'dishes' && path.length === 2 && method === 'PUT') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      delete body._id
      delete body.id
      if (body.price !== undefined) body.price = parseFloat(body.price)
      if (body.prep_time !== undefined) body.prep_time = parseInt(body.prep_time)
      if (body.spice_level !== undefined) body.spice_level = parseInt(body.spice_level)
      await db.collection('dishes').updateOne({ id: path[1] }, { $set: body })
      const updated = await db.collection('dishes').findOne({ id: path[1] })
      return handleCORS(NextResponse.json(stripId(updated)))
    }

    // DELETE /dishes/:id (admin)
    if (path[0] === 'dishes' && path.length === 2 && method === 'DELETE') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      await db.collection('dishes').deleteOne({ id: path[1] })
      return handleCORS(NextResponse.json({ ok: true }))
    }

    // ---------------- Orders ----------------
    // POST /orders
    if (route === '/orders' && method === 'POST') {
      const body = await request.json()
      if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
        return handleCORS(NextResponse.json({ error: 'Items required' }, { status: 400 }))
      }

      // ---- Waiter-assisted dine-in additions --------------------------------
      // Customers can self-order via the QR/table flow OR a waiter can place
      // the order on their behalf. Both paths land here so the kitchen
      // pipeline stays single-source-of-truth.
      const orderSource = body.order_source === 'waiter' ? 'waiter' : 'qr'
      const waiterMeta = body.waiter && typeof body.waiter === 'object'
        ? {
            id: body.waiter.id || null,
            name: (body.waiter.name || '').toString().slice(0, 80) || null,
          }
        : null
      // Optional ticket-level flags surfaced to the kitchen / waiter UI.
      const flags = body.flags && typeof body.flags === 'object'
        ? {
            urgent: !!body.flags.urgent,
            allergy: !!body.flags.allergy,
            complimentary: !!body.flags.complimentary,
          }
        : { urgent: false, allergy: false, complimentary: false }
      // Default behaviour for waiter dine-in: merge into the table's
      // most-recent un-accepted order. Customers can opt-out via merge_active=false.
      const mergeActive = body.merge_active !== false
      // -----------------------------------------------------------------------

      // Normalise per-item notes coming from the waiter builder so the kitchen
      // sees the same shape regardless of source.
      const items = body.items.map(i => ({
        id: i.id,
        name: i.name,
        price: parseFloat(i.price) || 0,
        quantity: parseInt(i.quantity) || 1,
        notes: (i.notes || '').toString().slice(0, 240),
        prep_time: i.prep_time,
      }))
      const subtotal = items.reduce((s, i) => s + (i.price * i.quantity), 0)
      const tax = +(subtotal * 0.21).toFixed(2) // 21% VAT Lithuania

      // Delivery zone & fee
      let deliveryZone = null
      let deliveryFee = 0
      let courierEta = null
      if (body.type === 'delivery') {
        if (body.delivery_zone_id) {
          deliveryZone = await db.collection('delivery_zones').findOne({ id: body.delivery_zone_id })
          if (!deliveryZone) {
            return handleCORS(NextResponse.json({ error: 'Invalid delivery zone' }, { status: 400 }))
          }
          deliveryFee = parseFloat(deliveryZone.fee) || 0
          courierEta = deliveryZone.eta_minutes
        } else {
          deliveryFee = body.deliveryFee || 3.50
        }
      }
      const discount = body.discount || 0
      const total = +(subtotal + tax + deliveryFee - discount).toFixed(2)

      // Compute prep_time_total = max prep_time across items (kitchen parallel cooking)
      let prepTimeTotal = 0
      try {
        const dishIds = items.map(i => i.id).filter(Boolean)
        if (dishIds.length > 0) {
          const dishDocs = await db.collection('dishes').find({ id: { $in: dishIds } }).toArray()
          const dishPrepMap = Object.fromEntries(dishDocs.map(d => [d.id, parseInt(d.prep_time) || 15]))
          for (const i of items) {
            const p = dishPrepMap[i.id] || parseInt(i.prep_time) || 15
            if (p > prepTimeTotal) prepTimeTotal = p
          }
        }
        if (!prepTimeTotal) prepTimeTotal = 15
      } catch (e) { prepTimeTotal = 15 }

      // Dine-in flow: link or create table session
      let sessionId = null
      let tableNumber = null
      if (body.table_id) {
        const table = await db.collection('tables').findOne({ id: body.table_id })
        if (!table) return handleCORS(NextResponse.json({ error: 'Invalid table' }, { status: 400 }))
        tableNumber = table.number
        let session = await getActiveSession(db, body.table_id)
        if (!session) {
          // Auto-create walk-in session
          session = {
            id: uuidv4(),
            table_id: body.table_id,
            customer_name: body.customer?.name || (orderSource === 'waiter' ? 'Walk-in (waiter)' : 'Walk-in'),
            guests: body.guests || 2,
            started_at: new Date(),
            ended_at: null,
            session_status: 'active',
            origin: orderSource === 'waiter' ? 'waiter_order' : 'qr_order',
          }
          await db.collection('table_sessions').insertOne(session)
          await setTableStatus(db, body.table_id, 'occupied')
        }
        sessionId = session.id

        // Merge-into-active: append items to the most-recent received order on
        // this session so the kitchen doesn't get a duplicate ticket while
        // the previous one is still on the pass. Once the kitchen has accepted
        // (status >= preparing), we let the new ticket be a fresh row so the
        // kitchen flow stays clean.
        if (mergeActive) {
          const activeOrder = await db.collection('orders').findOne(
            { session_id: sessionId, status: 'received' },
            { sort: { created_at: -1 } }
          )
          if (activeOrder) {
            // Merge: increment quantity of identical (id + notes) items, push the rest.
            const merged = [...(activeOrder.items || [])]
            for (const it of items) {
              const idx = merged.findIndex(m =>
                m.id === it.id && (m.notes || '') === (it.notes || '')
              )
              if (idx >= 0) merged[idx].quantity = (parseInt(merged[idx].quantity) || 0) + it.quantity
              else merged.push(it)
            }
            const newSubtotal = merged.reduce((s, i) => s + (parseFloat(i.price) * parseInt(i.quantity)), 0)
            const newTax = +(newSubtotal * 0.21).toFixed(2)
            const newDiscount = activeOrder.discount || 0
            const newTotal = +(newSubtotal + newTax + (activeOrder.delivery_fee || 0) - newDiscount).toFixed(2)
            const mergedFlags = {
              urgent: !!(activeOrder.flags?.urgent || flags.urgent),
              allergy: !!(activeOrder.flags?.allergy || flags.allergy),
              complimentary: !!(activeOrder.flags?.complimentary || flags.complimentary),
            }
            const history = Array.isArray(activeOrder.history) ? activeOrder.history.slice() : []
            history.push({
              at: new Date(),
              action: 'append_items',
              source: orderSource,
              waiter: waiterMeta,
              added_items: items.map(i => ({ id: i.id, name: i.name, quantity: i.quantity, notes: i.notes })),
            })
            await db.collection('orders').updateOne(
              { id: activeOrder.id },
              {
                $set: {
                  items: merged,
                  subtotal: +newSubtotal.toFixed(2),
                  tax: newTax,
                  total: newTotal,
                  flags: mergedFlags,
                  history,
                  updated_at: new Date(),
                },
              }
            )
            const updated = await db.collection('orders').findOne({ id: activeOrder.id })
            return handleCORS(NextResponse.json({
              ...stripId(updated),
              merged: true,
              merged_into_order_id: activeOrder.id,
            }))
          }
        }
      }

      const order = {
        id: uuidv4(),
        order_number: 'AK' + Date.now().toString().slice(-6),
        user_id: (await currentUser())?.id || null,
        items,
        type: body.type || (body.table_id ? 'dine-in' : 'pickup'),
        order_type: body.table_id ? 'dine_in' : (body.type === 'delivery' ? 'delivery' : 'pickup'),
        // Waiter-assisted ordering metadata
        order_source: orderSource,
        waiter: waiterMeta,
        flags,
        history: [{
          at: new Date(),
          action: 'create',
          source: orderSource,
          waiter: waiterMeta,
        }],
        table_id: body.table_id || null,
        table_number: tableNumber,
        session_id: sessionId,
        customer: body.customer || {},
        address: body.address || null,
        // Delivery fields
        delivery_method: body.type === 'delivery' ? (body.delivery_method || 'in_house') : null,
        delivery_provider: body.type === 'delivery' ? (body.delivery_method || 'in_house') : null,
        delivery_status: body.type === 'delivery' ? 'pending' : null,
        delivery_zone_id: deliveryZone?.id || null,
        delivery_zone_name: deliveryZone?.name || null,
        courier_eta: courierEta,
        prep_time_total: body.type === 'delivery' ? prepTimeTotal : null,
        courier_tracking_url: null,
        courier_reference_id: null,
        courier_requested_at: null,
        courier_assigned_at: null,
        picked_up_at: null,
        notes: body.notes || '',
        coupon: body.coupon || null,
        payment_method: body.payment_method || 'cash',
        payment_status: 'pending',
        status: 'received',
        subtotal: +subtotal.toFixed(2),
        tax,
        delivery_fee: deliveryFee,
        discount,
        total,
        created_at: new Date(),
        updated_at: new Date(),
      }
      await db.collection('orders').insertOne(order)

      // For logged-in customers placing a delivery order, auto-save the address
      // into their address book so they don't need to retype it next time.
      if (order.user_id && order.type === 'delivery' && order.address?.address) {
        const u = await db.collection('users').findOne({ id: order.user_id })
        if (u) {
          const list = u.addresses || []
          const a = order.address
          const key = `${(a.address || '').toLowerCase().trim()}|${(a.city || '').toLowerCase().trim()}|${(a.zip || '').trim()}`
          const idx = list.findIndex(x => `${(x.address||'').toLowerCase().trim()}|${(x.city||'').toLowerCase().trim()}|${(x.zip||'').trim()}` === key)
          const now = new Date()
          if (idx >= 0) {
            list[idx].last_used_at = now
            if (deliveryZone?.id) list[idx].delivery_zone_id = deliveryZone.id
          } else {
            list.push({
              id: uuidv4(),
              label: 'Home',
              address: a.address,
              city: a.city || 'Kaunas',
              zip: a.zip || '',
              delivery_zone_id: deliveryZone?.id || null,
              created_at: now,
              last_used_at: now,
            })
          }
          await db.collection('users').updateOne({ id: order.user_id }, { $set: { addresses: list, updated_at: now } })
        }
      }

      return handleCORS(NextResponse.json(stripId(order)))
    }

    // GET /orders/:id  — supports both UUID (id) and human order_number (e.g. AK020909)
    if (path[0] === 'orders' && path.length === 2 && method === 'GET') {
      const key = path[1]
      // Order number is case-insensitive; UUID lookup is exact for backward compat.
      const order = await db.collection('orders').findOne({
        $or: [
          { id: key },
          { order_number: key },
          { order_number: key.toUpperCase() },
        ]
      })
      if (!order) return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      return handleCORS(NextResponse.json(stripId(order)))
    }

    // GET /orders (admin)
    if (route === '/orders' && method === 'GET') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const url = new URL(request.url)
      const status = url.searchParams.get('status')
      const q = status && status !== 'all' ? { status } : {}
      const orders = await db.collection('orders').find(q).sort({ created_at: -1 }).limit(200).toArray()
      return handleCORS(NextResponse.json(orders.map(stripId)))
    }

    // PUT /orders/:id (admin status update)
    if (path[0] === 'orders' && path.length === 2 && method === 'PUT') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      const update = { updated_at: new Date() }
      if (body.status) {
        update.status = body.status
        if (body.status === 'preparing') update.accepted_at = new Date()
        if (body.status === 'ready') update.ready_at = new Date()
        if (body.status === 'out') update.out_at = new Date()
        if (body.status === 'delivered') update.delivered_at = new Date()
      }
      if (body.priority !== undefined) update.priority = !!body.priority
      if (body.payment_status) update.payment_status = body.payment_status
      await db.collection('orders').updateOne({ id: path[1] }, { $set: update })
      const updated = await db.collection('orders').findOne({ id: path[1] })

      // ── Auto-notify waiter when a dine-in order becomes 'ready' ──────────
      // This replaces the old manual "Notify Waiter" button. The notification
      // is created exactly once per order; if the chef toggles ready/preparing
      // we don't spam — we re-open the existing pending notification or just
      // leave the existing one alone.
      if (body.status === 'ready' && updated && isDineIn(updated)) {
        const existing = await db.collection('waiter_notifications').findOne({ order_id: updated.id })
        if (!existing) {
          await db.collection('waiter_notifications').insertOne({
            id: uuidv4(),
            order_id: updated.id,
            order_number: updated.order_number,
            table_id: updated.table_id || null,
            table_name: updated.table_number ? `Table ${updated.table_number}` : null,
            items_summary: summariseItems(updated.items),
            customer_name: updated.customer?.name || 'Guest',
            notes: updated.notes || '',
            priority: !!updated.priority,
            status: 'pending',
            waiter_id: null,
            created_at: new Date(),
            picked_up_at: null,
            served_at: null,
          })
        } else if (existing.status === 'served') {
          // Order was bounced back from served (rare manual fix) — re-open it.
          await db.collection('waiter_notifications').updateOne(
            { id: existing.id },
            { $set: { status: 'pending', served_at: null, picked_up_at: null, created_at: new Date() } }
          )
        }
      }

      return handleCORS(NextResponse.json(stripId(updated)))
    }

    // GET /kitchen/orders - active orders for kitchen (admin)
    if (route === '/kitchen/orders' && method === 'GET') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const orders = await db.collection('orders').find({
        status: { $in: ['received', 'preparing', 'ready'] }
      }).sort({ priority: -1, created_at: 1 }).toArray()
      return handleCORS(NextResponse.json(orders.map(stripId)))
    }

    // ---------------- Waiter ----------------
    // GET /waiter/orders (admin) — dine-in orders that are ready or in-service
    // (waiter has picked them up but not yet served). Sorted by ready_at asc so
    // the longest-waiting plate is on top.
    if (route === '/waiter/orders' && method === 'GET') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const orders = await db.collection('orders').find({
        $and: [
          { $or: [{ order_type: 'dine_in' }, { type: 'dine-in' }, { table_id: { $ne: null } }] },
          { status: { $in: ['ready'] } },
          { serve_status: { $ne: 'served' } },
        ]
      }).sort({ priority: -1, ready_at: 1, created_at: 1 }).toArray()
      return handleCORS(NextResponse.json(orders.map(stripId)))
    }

    // GET /waiter/active-tables (admin) — table picker feed for waiter-assisted
    // ordering. Returns every table the waiter could plausibly take an order
    // for, with whatever extra context the UI needs to render rich cards.
    //
    // ?include=available  — also include unoccupied/available tables (default
    //                       false; useful only for the walk-in seating flow).
    if (route === '/waiter/active-tables' && method === 'GET') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const url = new URL(request.url)
      const includeAvailable = url.searchParams.get('include') === 'available'

      const tables = await db.collection('tables').find({}).sort({ number: 1 }).toArray()
      const sessions = await db.collection('table_sessions').find({ session_status: 'active' }).toArray()
      const sessionByTable = Object.fromEntries(sessions.map(s => [s.table_id, s]))

      // Today's reservations marked arrived but not yet seated — those tables
      // should appear in the picker even before an active session is created.
      const restNow = getRestaurantNow()
      const arrivedRes = await db.collection('reservations').find({
        date: restNow.dateStr,
        status: { $in: ['arrived', 'table_assigned'] },
      }).toArray()
      const arrivedByTable = {}
      for (const r of arrivedRes) {
        if (r.table_id && !arrivedByTable[r.table_id]) arrivedByTable[r.table_id] = r
      }

      // Active dine-in orders (one per session, latest first) keyed by session
      // so the picker can show "+ €23.40 already on the bill" or similar.
      const activeOrders = await db.collection('orders').find({
        session_id: { $in: sessions.map(s => s.id) },
        status: { $nin: ['delivered', 'cancelled'] },
      }).sort({ created_at: -1 }).toArray()
      const ordersBySession = {}
      for (const o of activeOrders) {
        if (!ordersBySession[o.session_id]) ordersBySession[o.session_id] = []
        ordersBySession[o.session_id].push(o)
      }

      const result = []
      for (const t of tables) {
        if (t.status === 'out_of_service') continue
        const session = sessionByTable[t.id] || null
        const reservation = arrivedByTable[t.id] || null
        const isOccupied = t.status === 'occupied' || !!session
        const isSeated = !!session
        const isAvailable = t.status === 'available' && !session && !reservation
        // Skip available tables unless caller asked for them.
        if (isAvailable && !includeAvailable) continue
        // Skip purely-reserved-not-arrived tables; waiter shouldn't take an
        // order before the guest is here.
        if (!isOccupied && !reservation && !isAvailable) continue

        const sessionOrders = session ? (ordersBySession[session.id] || []) : []
        const activeOrder = sessionOrders.find(o => o.status === 'received') || sessionOrders[0] || null

        result.push({
          id: t.id,
          number: t.number,
          capacity: t.capacity,
          section: t.section,
          status: t.status,
          state: isSeated ? 'seated' : (isOccupied ? 'occupied' : (reservation ? 'arrived' : 'available')),
          session: session ? {
            id: session.id,
            customer_name: session.customer_name,
            guests: session.guests,
            started_at: session.started_at,
            origin: session.origin,
          } : null,
          reservation: reservation ? {
            id: reservation.id,
            name: reservation.name,
            guests: reservation.guests,
            time: reservation.time,
            status: reservation.status,
          } : null,
          active_order: activeOrder ? {
            id: activeOrder.id,
            order_number: activeOrder.order_number,
            status: activeOrder.status,
            total: activeOrder.total,
            item_count: (activeOrder.items || []).reduce((s, i) => s + (parseInt(i.quantity) || 0), 0),
            order_source: activeOrder.order_source || 'qr',
            mergeable: activeOrder.status === 'received',
          } : null,
        })
      }

      return handleCORS(NextResponse.json({ tables: result }))
    }


    // GET /waiter/notifications (admin) — primary feed for the waiter dashboard.
    // Returns pending + picked_up notifications, newest at the top of "pending"
    // so chime/highlight detection on the client is straightforward.
    if (route === '/waiter/notifications' && method === 'GET') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const list = await db.collection('waiter_notifications').find({
        status: { $in: ['pending', 'picked_up'] }
      }).sort({ priority: -1, created_at: 1 }).toArray()
      return handleCORS(NextResponse.json(list.map(stripId)))
    }

    // POST /waiter/notifications/:id/pickup (admin) — waiter takes the plate
    // off the pass. Updates BOTH the notification and the underlying order so
    // existing customer tracking (waiter_picked_up_at, serve_status) keeps working.
    if (path[0] === 'waiter' && path[1] === 'notifications' && path.length === 4 && path[3] === 'pickup' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const notif = await db.collection('waiter_notifications').findOne({ id: path[2] })
      if (!notif) return handleCORS(NextResponse.json({ error: 'Notification not found' }, { status: 404 }))
      const now = new Date()
      await db.collection('waiter_notifications').updateOne(
        { id: notif.id },
        { $set: { status: 'picked_up', picked_up_at: now } }
      )
      await db.collection('orders').updateOne(
        { id: notif.order_id },
        { $set: { serve_status: 'picked_up_by_waiter', waiter_picked_up_at: now, updated_at: now } }
      )
      const updated = await db.collection('waiter_notifications').findOne({ id: notif.id })
      return handleCORS(NextResponse.json(stripId(updated)))
    }

    // POST /waiter/notifications/:id/served (admin) — waiter has placed the
    // food on the table. Closes the notification and finalizes the order
    // (status='delivered' + serve_status='served' + delivered_at + served_at).
    if (path[0] === 'waiter' && path[1] === 'notifications' && path.length === 4 && path[3] === 'served' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const notif = await db.collection('waiter_notifications').findOne({ id: path[2] })
      if (!notif) return handleCORS(NextResponse.json({ error: 'Notification not found' }, { status: 404 }))
      const now = new Date()
      await db.collection('waiter_notifications').updateOne(
        { id: notif.id },
        { $set: { status: 'served', served_at: now, picked_up_at: notif.picked_up_at || now } }
      )
      await db.collection('orders').updateOne(
        { id: notif.order_id },
        { $set: {
          serve_status: 'served',
          served_at: now,
          status: 'delivered',
          delivered_at: now,
          updated_at: now,
        } }
      )
      const updated = await db.collection('waiter_notifications').findOne({ id: notif.id })
      return handleCORS(NextResponse.json(stripId(updated)))
    }

    // POST /orders/:id/waiter-pickup (admin) — legacy pickup endpoint kept for
    // backward compatibility. Also syncs the matching notification if any.
    if (path[0] === 'orders' && path.length === 3 && path[2] === 'waiter-pickup' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const order = await db.collection('orders').findOne({ id: path[1] })
      if (!order) return handleCORS(NextResponse.json({ error: 'Order not found' }, { status: 404 }))
      const now = new Date()
      await db.collection('orders').updateOne({ id: path[1] }, { $set: {
        serve_status: 'picked_up_by_waiter',
        waiter_picked_up_at: now,
        updated_at: now,
      } })
      await db.collection('waiter_notifications').updateOne(
        { order_id: path[1], status: 'pending' },
        { $set: { status: 'picked_up', picked_up_at: now } }
      )
      const updated = await db.collection('orders').findOne({ id: path[1] })
      return handleCORS(NextResponse.json(stripId(updated)))
    }

    // POST /orders/:id/served (admin) — legacy served endpoint kept for
    // backward compatibility. Also closes the matching notification if any.
    if (path[0] === 'orders' && path.length === 3 && path[2] === 'served' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const order = await db.collection('orders').findOne({ id: path[1] })
      if (!order) return handleCORS(NextResponse.json({ error: 'Order not found' }, { status: 404 }))
      const now = new Date()
      await db.collection('orders').updateOne({ id: path[1] }, { $set: {
        serve_status: 'served',
        served_at: now,
        status: 'delivered',
        delivered_at: now,
        updated_at: now,
      } })
      await db.collection('waiter_notifications').updateOne(
        { order_id: path[1], status: { $in: ['pending', 'picked_up'] } },
        { $set: { status: 'served', served_at: now } }
      )
      const updated = await db.collection('orders').findOne({ id: path[1] })
      return handleCORS(NextResponse.json(stripId(updated)))
    }

    // ---------------- Reservations ----------------
    // POST /reservations
    if (route === '/reservations' && method === 'POST') {
      const body = await request.json()
      if (!body.date || !body.time || !body.guests || !body.name) {
        return handleCORS(NextResponse.json({ error: 'date, time, guests, name required' }, { status: 400 }))
      }

      // Reject past or sub-lead-time slots (defence in depth — UI also hides them).
      if (isPastReservationSlot(body.date, body.time)) {
        return handleCORS(NextResponse.json(
          { error: 'Please select a valid future reservation time.' },
          { status: 400 }
        ))
      }

      // Capacity-aware availability check using the same 90-min overlap logic
      // as GET /availability. This is the authoritative gate against
      // overbooking — we never trust the UI alone.
      const guestsRequested = parseInt(body.guests) || 2
      const allTables = await db.collection('tables').find({}).toArray()
      const sameDayReservations = await db.collection('reservations').find({
        date: body.date,
        status: { $ne: 'cancelled' },
      }).toArray()
      const suitable = suitableTablesForSlot({
        slotTime: body.time,
        guests: guestsRequested,
        sameDayReservations,
        allTables: allTables.filter(t => t.status !== 'out_of_service'),
      })
      if (suitable.length === 0) {
        return handleCORS(NextResponse.json(
          { error: 'Slot fully booked' },
          { status: 409 }
        ))
      }

      const reservation = {
        id: uuidv4(),
        confirmation: 'RES' + Date.now().toString().slice(-6),
        // Public, URL-safe code used for the guest tracking page
        // (/reservation/RSV-XXXXXX). Survives logout/cookie loss.
        reservation_code: await generateUniqueReservationCode(db),
        user_id: (await currentUser())?.id || null,
        name: body.name,
        phone: body.phone || '',
        email: body.email || '',
        date: body.date,
        time: body.time,
        guests: parseInt(body.guests) || 2,
        special_requests: body.special_requests || '',
        notes: body.notes || '',
        // New: customer expresses a preference rather than picking an exact
        // table. The admin reads this preference when assigning a real table.
        seating_preference: body.seating_preference || 'No preference',
        occasion: body.occasion || 'Casual dining',
        status: 'pending',
        table_id: null,
        created_at: new Date(),
      }
      await db.collection('reservations').insertOne(reservation)
      return handleCORS(NextResponse.json(stripId(reservation)))
    }

    // ---------------------------------------------------------------
    //  Public reservation tracking & guest recovery
    // ---------------------------------------------------------------
    // GET /reservations/by-code/:code — used by /reservation/[code] for
    // both guest users and logged-in users to live-poll status.
    // Tolerant: matches reservation_code (case-insensitive), legacy
    // `confirmation`, or even the raw 6-char suffix.
    if (path[0] === 'reservations' && path[1] === 'by-code' && path.length === 3 && method === 'GET') {
      const raw = decodeURIComponent(path[2] || '').trim().toUpperCase()
      if (!raw) return handleCORS(NextResponse.json({ error: 'Code required' }, { status: 400 }))
      const candidates = [raw]
      if (!raw.startsWith('RSV-')) candidates.push(`RSV-${raw}`)
      // Also try looking up by legacy confirmation (RES######)
      const reservation = await db.collection('reservations').findOne({
        $or: [
          { reservation_code: { $in: candidates } },
          { confirmation: raw },
        ]
      })
      if (!reservation) return handleCORS(NextResponse.json({ error: 'Reservation not found' }, { status: 404 }))
      const ensured = await ensureReservationCode(db, reservation)
      const table = ensured.table_id
        ? await db.collection('tables').findOne({ id: ensured.table_id })
        : null
      return handleCORS(NextResponse.json(publicReservationView(ensured, table)))
    }

    // POST /reservations/lookup — guest recovery. Body { phone? | email? }
    // Returns up to 10 most recent matching reservations as the public view
    // (no PII leak). Either phone OR email must be provided.
    if (route === '/reservations/lookup' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const email = (body.email || '').trim().toLowerCase()
      const phone = (body.phone || '').trim()
      if (!email && !phone) {
        return handleCORS(NextResponse.json({ error: 'Provide email or phone' }, { status: 400 }))
      }
      const filter = { $or: [] }
      if (email) filter.$or.push({ email: { $regex: `^${email}$`, $options: 'i' } })
      if (phone) {
        // Match on the last 7 digits to forgive country-code / formatting
        // differences ("+1 555-111-2222" should match "5551112222").
        const digits = phone.replace(/\D/g, '')
        const tail = digits.slice(-7)
        if (tail) filter.$or.push({ phone: { $regex: tail.split('').join('\\D*') } })
      }
      const list = await db.collection('reservations')
        .find(filter)
        .sort({ created_at: -1 })
        .limit(10)
        .toArray()
      // Backfill codes for legacy reservations so the tracking link works
      const ensured = []
      for (const r of list) ensured.push(await ensureReservationCode(db, r))
      const tableIds = [...new Set(ensured.map(r => r.table_id).filter(Boolean))]
      const tables = tableIds.length
        ? await db.collection('tables').find({ id: { $in: tableIds } }).toArray()
        : []
      const tableMap = new Map(tables.map(t => [t.id, t]))
      return handleCORS(NextResponse.json({
        reservations: ensured.map(r => publicReservationView(r, tableMap.get(r.table_id))),
      }))
    }

    // GET /reservations/availability?date=YYYY-MM-DD[&guests=N]
    if (route === '/reservations/availability' && method === 'GET') {
      const url = new URL(request.url)
      const date = url.searchParams.get('date')
      const guests = Math.max(1, parseInt(url.searchParams.get('guests') || '2', 10) || 2)
      if (!date) return handleCORS(NextResponse.json({ error: 'date required' }, { status: 400 }))

      const allTables = await db.collection('tables').find({}).toArray()
      const bookable = allTables.filter(t => t.status !== 'out_of_service')
      // Tables that could ever host a `guests`-party — used to compute the
      // `total` field surfaced to the client (so the UI can display "X / Y
      // available" against the relevant capacity, not the whole restaurant).
      const fitTotal = bookable.filter(t => t.capacity >= guests).length

      const sameDayReservations = await db.collection('reservations').find({
        date,
        status: { $ne: 'cancelled' },
      }).toArray()

      const restNow = getRestaurantNow()
      const isToday = date === restNow.dateStr
      const isPast = date < restNow.dateStr

      const slots = []
      for (let h = 12; h <= 22; h++) {
        for (const m of [0, 30]) {
          if (h === 22 && m === 30) continue
          const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`

          // 1) past-time / lead-time buffer (unchanged behaviour)
          if (isPast) continue
          if (isToday && timeStrToMinutes(time) < restNow.minutes + RESERVATION_LEAD_MIN) continue

          // 2) capacity-aware availability with 90-min overlap detection
          const suitable = suitableTablesForSlot({
            slotTime: time,
            guests,
            sameDayReservations,
            allTables: bookable,
          })
          if (suitable.length === 0) continue // hide fully-booked / no-fit slots

          slots.push({ time, available: suitable.length, total: fitTotal })
        }
      }

      return handleCORS(NextResponse.json({
        date,
        slots,
        total_tables: bookable.length,
        guests,
        // Surface server's notion of "now" + lead-time so the client can
        // double-check / auto-refresh without re-implementing TZ logic.
        server_now: {
          date: restNow.dateStr,
          time: `${String(Math.floor(restNow.minutes / 60)).padStart(2, '0')}:${String(restNow.minutes % 60).padStart(2, '0')}`,
          timezone: RESTAURANT_TZ,
          lead_time_minutes: RESERVATION_LEAD_MIN,
          duration_minutes: RESERVATION_DURATION_MIN,
        },
      }))
    }

    // GET /reservations (admin)
    if (route === '/reservations' && method === 'GET') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const reservations = await db.collection('reservations').find({}).sort({ date: -1, time: 1 }).limit(200).toArray()
      return handleCORS(NextResponse.json(reservations.map(stripId)))
    }

    // PUT /reservations/:id (admin) — generic status / table_id update with
    // timestamps for the full lifecycle:
    // pending → confirmed → table_assigned → arrived → checked_in → completed
    // (cancelled / no_show can interrupt at any point).
    //
    // Assigning a table implies the reservation is also confirmed (if not
    // already). We fire an in-app notification + queue email/SMS deliveries
    // the moment a table is assigned.
    if (path[0] === 'reservations' && path.length === 2 && method === 'PUT') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      const reservation = await db.collection('reservations').findOne({ id: path[1] })
      if (!reservation) return handleCORS(NextResponse.json({ error: 'Reservation not found' }, { status: 404 }))

      const update = {}
      let tableJustAssigned = null // Holds the new table doc when we should fire a notification

      // Handle table assignment with double-booking prevention
      if (body.table_id !== undefined && body.table_id !== null && body.table_id !== reservation.table_id) {
        // Check if this table is already assigned to another reservation at the same time
        const conflictingReservation = await db.collection('reservations').findOne({
          id: { $ne: path[1] },
          table_id: body.table_id,
          date: reservation.date,
          time: reservation.time,
          status: { $in: ['pending', 'confirmed', 'table_assigned', 'arrived'] }
        })

        if (conflictingReservation) {
          return handleCORS(NextResponse.json({
            error: `Table already reserved for ${reservation.time} on ${reservation.date}`
          }, { status: 409 }))
        }

        // Release previous table if exists
        if (reservation.table_id) {
          await autoUpdateTableStatuses(db)
        }

        const newTable = await db.collection('tables').findOne({ id: body.table_id })
        if (!newTable) {
          return handleCORS(NextResponse.json({ error: 'Table not found' }, { status: 404 }))
        }

        update.table_id = body.table_id
        update.table_assigned_at = new Date()
        // Always backfill confirmed_at when assigning a table — assignment
        // implies confirmation regardless of whether we also stamp a later
        // status (arrived/checked_in) in the same PUT.
        if (!reservation.confirmed_at) update.confirmed_at = new Date()

        // Assigning a table implies confirmation. Bump status to
        // 'table_assigned' unless an explicit later-stage status is being set
        // simultaneously (e.g. arrived/checked_in via the same PUT).
        const downstream = ['arrived', 'checked_in', 'completed', 'cancelled', 'no_show']
        if (!body.status || !downstream.includes(body.status)) {
          update.status = 'table_assigned'
        }

        // Instantly mark the new table as reserved
        await setTableStatus(db, body.table_id, 'reserved')

        tableJustAssigned = newTable
      }

      if (body.status) {
        // Honor explicit status from the body when it is "later" in the
        // lifecycle than what the table-assignment block set above.
        const explicitlyAdvancing = ['arrived', 'checked_in', 'completed', 'cancelled', 'no_show'].includes(body.status)
        if (explicitlyAdvancing || !update.status) {
          update.status = body.status
        }
        if (body.status === 'confirmed' && !reservation.confirmed_at) update.confirmed_at = new Date()
        if (body.status === 'arrived') {
          update.arrived_at = new Date()
          // When customer arrives, convert table from reserved to occupied if table assigned
          if (reservation.table_id || body.table_id) {
            const tableId = body.table_id || reservation.table_id
            await setTableStatus(db, tableId, 'occupied')
          }
        }
        if (body.status === 'cancelled') {
          update.cancelled_at = new Date()
          // Release table if cancelling
          if (reservation.table_id) {
            await setTableStatus(db, reservation.table_id, 'available')
          }
        }
        if (body.status === 'no_show') {
          update.no_show_at = new Date()
          // Release table on no-show
          if (reservation.table_id) {
            await setTableStatus(db, reservation.table_id, 'available')
          }
        }
        if (body.status === 'completed') update.completed_at = new Date()
      }

      if (body.seating_preference) update.seating_preference = body.seating_preference
      if (body.occasion) update.occasion = body.occasion
      if (body.special_requests !== undefined) update.special_requests = body.special_requests

      await db.collection('reservations').updateOne({ id: path[1] }, { $set: update })
      const updated = await db.collection('reservations').findOne({ id: path[1] })

      // Fire notification AFTER the DB update so the customer sees the
      // freshly-updated reservation when they navigate to /profile.
      if (tableJustAssigned) {
        try {
          await notifyTableAssigned(db, updated, tableJustAssigned)
        } catch (notifyErr) {
          console.warn('notifyTableAssigned failed:', notifyErr.message)
          // Non-fatal — the table assignment itself succeeded.
        }
      }

      return handleCORS(NextResponse.json(stripId(updated)))
    }

    // GET /reservations/:id/available-tables (admin) — get suitable tables for a reservation
    if (path[0] === 'reservations' && path.length === 3 && path[2] === 'available-tables' && method === 'GET') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const reservation = await db.collection('reservations').findOne({ id: path[1] })
      if (!reservation) return handleCORS(NextResponse.json({ error: 'Reservation not found' }, { status: 404 }))
      
      // Get all tables that can accommodate the party size, excluding non-assignable statuses
      const allTables = await db.collection('tables').find({
        capacity: { $gte: reservation.guests },
        status: { $nin: ['out_of_service', 'occupied', 'cleaning'] }
      }).sort({ capacity: 1, number: 1 }).toArray()
      
      // Calculate 90-minute overlap window for this reservation
      const resStart = timeStrToMinutes(reservation.time)
      const resEnd = resStart + RESERVATION_DURATION_MIN
      
      // Find all reservations on the same date that overlap with this reservation's 90-min window
      const sameDayReservations = await db.collection('reservations').find({
        id: { $ne: reservation.id },
        date: reservation.date,
        status: { $in: ['pending', 'confirmed', 'table_assigned', 'arrived'] },
        table_id: { $ne: null }
      }).toArray()
      
      // Filter to only overlapping reservations (90-minute overlap detection)
      const overlappingReservations = sameDayReservations.filter(r => {
        const rStart = timeStrToMinutes(r.time)
        if (Number.isNaN(rStart)) return false
        const rEnd = rStart + RESERVATION_DURATION_MIN
        // Standard half-open interval overlap: rEnd > resStart && rStart < resEnd
        return rEnd > resStart && rStart < resEnd
      })
      
      const blockedTableIds = new Set(overlappingReservations.map(r => r.table_id))
      const availableTables = allTables.filter(t => !blockedTableIds.has(t.id))

      // Enrich each table with its nearest upcoming reservation (other than the
      // one being assigned) plus the active session (when occupied) so the
      // manager can see timing context in the assignment modal.
      const tableIds = availableTables.map(t => t.id)
      const upcomingForTables = await db.collection('reservations').find({
        id: { $ne: reservation.id },
        table_id: { $in: tableIds },
        status: { $in: ['pending', 'confirmed', 'table_assigned'] },
      }).toArray()

      const nowTs = new Date()
      const nearestByTable = {}
      for (const r of upcomingForTables) {
        const dt = new Date(`${r.date}T${r.time}:00`)
        // Skip past reservations (allow a 30-min grace so just-started slots still surface)
        if (dt.getTime() + 30 * 60 * 1000 < nowTs.getTime()) continue
        const existing = nearestByTable[r.table_id]
        if (!existing || dt < new Date(`${existing.date}T${existing.time}:00`)) {
          nearestByTable[r.table_id] = r
        }
      }

      const enriched = []
      for (const t of availableTables) {
        const upcoming = nearestByTable[t.id] || null
        let activeSession = null
        if (t.status === 'occupied') {
          const s = await getActiveSession(db, t.id)
          if (s) activeSession = stripId(s)
        }
        enriched.push({
          ...stripId(t),
          upcoming_reservation: upcoming ? stripId(upcoming) : null,
          active_session: activeSession,
        })
      }

      // Suggest tables based on seating preference
      const suggested = enriched.filter(t =>
        reservation.seating_preference === 'No preference' ||
        t.section?.toLowerCase().includes(reservation.seating_preference?.toLowerCase()) ||
        reservation.seating_preference?.toLowerCase().includes(t.section?.toLowerCase())
      )

      return handleCORS(NextResponse.json({
        available: enriched,
        suggested,
        seating_preference: reservation.seating_preference
      }))
    }

    // POST /reservations/:id/checkin (admin) — body { table_id } -> creates session, occupies table
    if (path[0] === 'reservations' && path.length === 3 && path[2] === 'checkin' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      const reservation = await db.collection('reservations').findOne({ id: path[1] })
      if (!reservation) return handleCORS(NextResponse.json({ error: 'Reservation not found' }, { status: 404 }))
      const tableId = body.table_id || reservation.table_id
      if (!tableId) return handleCORS(NextResponse.json({ error: 'table_id required' }, { status: 400 }))
      const table = await db.collection('tables').findOne({ id: tableId })
      if (!table) return handleCORS(NextResponse.json({ error: 'Table not found' }, { status: 404 }))
      const existing = await getActiveSession(db, tableId)
      if (existing) return handleCORS(NextResponse.json({ error: 'Table already has an active session' }, { status: 409 }))
      const session = {
        id: uuidv4(),
        table_id: tableId,
        reservation_id: reservation.id,
        customer_name: reservation.name,
        guests: reservation.guests,
        started_at: new Date(),
        ended_at: null,
        session_status: 'active',
        origin: 'reservation',
      }
      await db.collection('table_sessions').insertOne(session)
      await db.collection('reservations').updateOne(
        { id: path[1] },
        { $set: { status: 'checked_in', checked_in_at: new Date(), table_id: tableId } }
      )
      await setTableStatus(db, tableId, 'occupied')
      return handleCORS(NextResponse.json({ ok: true, session: stripId(session) }))
    }

    // ---------------- Tables ----------------
    // GET /tables — enriched list (all + active session + active orders count + upcoming reservation)
    if (route === '/tables' && method === 'GET') {
      await autoUpdateTableStatuses(db)
      const tables = await db.collection('tables').find({}).sort({ number: 1 }).toArray()
      const result = []
      const now = new Date()
      for (const t of tables) {
        const session = await getActiveSession(db, t.id)
        let activeOrders = 0
        let sessionOrders = []
        if (session) {
          sessionOrders = await db.collection('orders').find({
            session_id: session.id,
            status: { $nin: ['cancelled'] }
          }).toArray()
          activeOrders = sessionOrders.filter(o => o.status !== 'delivered' && o.status !== 'completed').length
        }
        // Upcoming reservation in next 4 hours assigned to this table
        const upcomingRes = await db.collection('reservations').findOne({
          table_id: t.id,
          status: { $in: ['confirmed', 'pending', 'table_assigned'] },
        })
        result.push({
          ...stripId(t),
          active_session: session ? stripId(session) : null,
          active_orders: activeOrders,
          session_orders: sessionOrders.map(stripId),
          upcoming_reservation: upcomingRes ? stripId(upcomingRes) : null,
        })
      }
      return handleCORS(NextResponse.json(result))
    }

    // GET /tables/:id — single table detail + session + orders
    if (path[0] === 'tables' && path.length === 2 && method === 'GET') {
      const table = await db.collection('tables').findOne({ id: path[1] })
      if (!table) return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      const session = await getActiveSession(db, path[1])
      let orders = []
      if (session) {
        orders = await db.collection('orders').find({ session_id: session.id }).sort({ created_at: -1 }).toArray()
      }
      const upcomingRes = await db.collection('reservations').find({
        table_id: path[1],
        status: { $in: ['confirmed', 'pending', 'table_assigned'] },
      }).sort({ date: 1, time: 1 }).toArray()
      return handleCORS(NextResponse.json({
        ...stripId(table),
        active_session: session ? stripId(session) : null,
        orders: orders.map(stripId),
        upcoming_reservations: upcomingRes.map(stripId),
      }))
    }

    // GET /tables/:id/info — public (for QR scan to confirm table existence)
    if (path[0] === 'tables' && path.length === 3 && path[2] === 'info' && method === 'GET') {
      const table = await db.collection('tables').findOne({ id: path[1] })
      if (!table) return handleCORS(NextResponse.json({ error: 'Not found' }, { status: 404 }))
      return handleCORS(NextResponse.json({
        id: table.id, number: table.number, capacity: table.capacity, section: table.section, status: table.status,
      }))
    }

    // POST /tables/:id/start-session — PUBLIC (QR scan auto-occupy)
    // Idempotent: if active session exists, returns it. Otherwise creates a walk-in session and sets table=occupied.
    if (path[0] === 'tables' && path.length === 3 && path[2] === 'start-session' && method === 'POST') {
      const table = await db.collection('tables').findOne({ id: path[1] })
      if (!table) return handleCORS(NextResponse.json({ error: 'Table not found' }, { status: 404 }))
      if (table.status === 'out_of_service') {
        return handleCORS(NextResponse.json({ error: 'Table is out of service. Please ask your server.' }, { status: 400 }))
      }
      if (table.status === 'cleaning') {
        return handleCORS(NextResponse.json({ error: 'Table is being cleaned. Please ask your server.' }, { status: 400 }))
      }
      let session = await getActiveSession(db, path[1])
      let created = false
      if (!session) {
        session = {
          id: uuidv4(),
          table_id: path[1],
          customer_name: 'Guest',
          guests: 0, // unknown until they order
          started_at: new Date(),
          ended_at: null,
          session_status: 'active',
          origin: 'qr_scan',
        }
        await db.collection('table_sessions').insertOne(session)
        await setTableStatus(db, path[1], 'occupied')
        created = true
      }
      return handleCORS(NextResponse.json({
        ok: true,
        created,
        session: stripId(session),
        table: { id: table.id, number: table.number, capacity: table.capacity, section: table.section, status: 'occupied' },
      }))
    }

    // PUT /tables/:id (admin) — update status / capacity / position / out_of_service
    if (path[0] === 'tables' && path.length === 2 && method === 'PUT') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      const update = {}
      const allowed = ['status', 'capacity', 'section', 'x', 'y', 'number']
      for (const k of allowed) if (body[k] !== undefined) update[k] = body[k]
      if (update.capacity !== undefined) update.capacity = parseInt(update.capacity)
      if (update.x !== undefined) update.x = parseInt(update.x)
      if (update.y !== undefined) update.y = parseInt(update.y)
      if (update.number !== undefined) update.number = parseInt(update.number)
      await db.collection('tables').updateOne({ id: path[1] }, { $set: update })
      const updated = await db.collection('tables').findOne({ id: path[1] })
      return handleCORS(NextResponse.json(stripId(updated)))
    }

    // POST /tables (admin) — create new table
    if (route === '/tables' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      // Auto-pick next number if not provided
      let number = parseInt(body.number)
      if (!number) {
        const max = await db.collection('tables').find({}).sort({ number: -1 }).limit(1).toArray()
        number = (max[0]?.number || 0) + 1
      }
      const newTable = {
        id: body.id || `t${number}`,
        number,
        capacity: parseInt(body.capacity) || 2,
        status: 'available',
        section: body.section || 'Main Hall',
        x: parseInt(body.x) || 0,
        y: parseInt(body.y) || 0,
      }
      // Avoid id collision
      const existing = await db.collection('tables').findOne({ id: newTable.id })
      if (existing) newTable.id = `t${number}_${Date.now().toString().slice(-4)}`
      await db.collection('tables').insertOne(newTable)
      return handleCORS(NextResponse.json(stripId(newTable)))
    }

    // DELETE /tables/:id (admin) — only if no active session
    if (path[0] === 'tables' && path.length === 2 && method === 'DELETE') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const session = await getActiveSession(db, path[1])
      if (session) return handleCORS(NextResponse.json({ error: 'Cannot delete a table with an active session. Close the table first.' }, { status: 400 }))
      await db.collection('tables').deleteOne({ id: path[1] })
      return handleCORS(NextResponse.json({ ok: true }))
    }

    // POST /tables/:id/walkin (admin) — { guests, customer_name? }
    if (path[0] === 'tables' && path.length === 3 && path[2] === 'walkin' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      const table = await db.collection('tables').findOne({ id: path[1] })
      if (!table) return handleCORS(NextResponse.json({ error: 'Table not found' }, { status: 404 }))
      const existing = await getActiveSession(db, path[1])
      if (existing) return handleCORS(NextResponse.json({ error: 'Table already has an active session' }, { status: 409 }))
      const session = {
        id: uuidv4(),
        table_id: path[1],
        customer_name: body.customer_name || 'Walk-in',
        guests: parseInt(body.guests) || 2,
        started_at: new Date(),
        ended_at: null,
        session_status: 'active',
        origin: 'walkin',
      }
      await db.collection('table_sessions').insertOne(session)
      await setTableStatus(db, path[1], 'occupied')
      return handleCORS(NextResponse.json({ ok: true, session: stripId(session) }))
    }

    // POST /tables/:id/close (admin) — close active session, mark orders completed, table → cleaning
    if (path[0] === 'tables' && path.length === 3 && path[2] === 'close' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const session = await getActiveSession(db, path[1])
      if (!session) return handleCORS(NextResponse.json({ error: 'No active session' }, { status: 400 }))
      await db.collection('table_sessions').updateOne(
        { id: session.id },
        { $set: { session_status: 'completed', ended_at: new Date() } }
      )
      await db.collection('orders').updateMany(
        { session_id: session.id, status: { $nin: ['cancelled', 'delivered'] } },
        { $set: { status: 'delivered', delivered_at: new Date() } }
      )
      // If linked reservation, mark completed
      if (session.reservation_id) {
        await db.collection('reservations').updateOne(
          { id: session.reservation_id },
          { $set: { status: 'completed', completed_at: new Date() } }
        )
      }
      await setTableStatus(db, path[1], 'cleaning')
      return handleCORS(NextResponse.json({ ok: true }))
    }

    // POST /tables/:id/cleaned (admin) — cleaning -> available
    if (path[0] === 'tables' && path.length === 3 && path[2] === 'cleaned' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      await setTableStatus(db, path[1], 'available')
      return handleCORS(NextResponse.json({ ok: true }))
    }

    // GET /tables/:id/bill (admin) — bill for active session
    if (path[0] === 'tables' && path.length === 3 && path[2] === 'bill' && method === 'GET') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const session = await getActiveSession(db, path[1])
      if (!session) return handleCORS(NextResponse.json({ error: 'No active session' }, { status: 400 }))
      const orders = await db.collection('orders').find({
        session_id: session.id,
        status: { $ne: 'cancelled' }
      }).toArray()
      const allItems = []
      let subtotal = 0
      for (const o of orders) {
        for (const i of (o.items || [])) {
          allItems.push({ ...i, order_id: o.id, order_number: o.order_number })
          subtotal += i.price * i.quantity
        }
      }
      const tax = +(subtotal * 0.21).toFixed(2)
      const total = +(subtotal + tax).toFixed(2)
      const table = await db.collection('tables').findOne({ id: path[1] })
      return handleCORS(NextResponse.json({
        table: stripId(table),
        session: stripId(session),
        items: allItems,
        order_count: orders.length,
        subtotal: +subtotal.toFixed(2),
        tax,
        total,
        currency: 'EUR',
        vat_rate: 21,
        invoice_number: 'INV' + Date.now().toString().slice(-8),
        issued_at: new Date(),
      }))
    }

    // POST /tables/:id/pay (admin) — mark all session orders paid, close session, table -> cleaning
    if (path[0] === 'tables' && path.length === 3 && path[2] === 'pay' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json().catch(() => ({}))
      const paymentMethod = body.payment_method || 'cash'
      const session = await getActiveSession(db, path[1])
      if (!session) return handleCORS(NextResponse.json({ error: 'No active session' }, { status: 400 }))
      await db.collection('orders').updateMany(
        { session_id: session.id },
        { $set: { payment_status: 'paid', payment_method: paymentMethod, paid_at: new Date() } }
      )
      await db.collection('orders').updateMany(
        { session_id: session.id, status: { $nin: ['cancelled', 'delivered'] } },
        { $set: { status: 'delivered', delivered_at: new Date() } }
      )
      await db.collection('table_sessions').updateOne(
        { id: session.id },
        { $set: { session_status: 'completed', ended_at: new Date(), paid_at: new Date(), payment_method: paymentMethod } }
      )
      if (session.reservation_id) {
        await db.collection('reservations').updateOne(
          { id: session.reservation_id },
          { $set: { status: 'completed', completed_at: new Date() } }
        )
      }
      await setTableStatus(db, path[1], 'cleaning')
      return handleCORS(NextResponse.json({ ok: true }))
    }

    // ====================================================================
    //                     CUSTOMER AUTH (cookie session)
    // ====================================================================

    // POST /auth/signup  body: { email, password, name, phone? }
    if (route === '/auth/signup' && method === 'POST') {
      const body = await request.json()
      const email = (body.email || '').trim().toLowerCase()
      const password = body.password || ''
      const name = (body.name || '').trim()
      const phone = (body.phone || '').trim()

      if (!email || !password || !name) {
        return handleCORS(NextResponse.json({ error: 'Name, email and password are required' }, { status: 400 }))
      }
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return handleCORS(NextResponse.json({ error: 'Please enter a valid email' }, { status: 400 }))
      }
      if (password.length < 6) {
        return handleCORS(NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 }))
      }
      const existing = await db.collection('users').findOne({ email })
      if (existing) {
        return handleCORS(NextResponse.json({ error: 'An account with this email already exists. Try logging in.' }, { status: 409 }))
      }

      const user = {
        id: uuidv4(),
        email,
        name,
        phone,
        password_hash: await hashPassword(password),
        addresses: [],
        favorites: [],
        created_at: new Date(),
        updated_at: new Date(),
      }
      await db.collection('users').insertOne(user)

      // Auto-link any guest orders/reservations matching this email or phone
      const orderMatch = { user_id: { $in: [null, undefined] }, $or: [{ 'customer.email': email }] }
      if (phone) orderMatch.$or.push({ 'customer.phone': phone })
      const linkedOrders = await db.collection('orders').updateMany(orderMatch, { $set: { user_id: user.id } })
      const resMatch = { user_id: { $in: [null, undefined] }, $or: [{ email }] }
      if (phone) resMatch.$or.push({ phone })
      const linkedRes = await db.collection('reservations').updateMany(resMatch, { $set: { user_id: user.id } })

      const token = await signSession({ uid: user.id, email })
      const response = NextResponse.json({
        ok: true,
        user: publicUser(user),
        linked_orders: linkedOrders.modifiedCount || 0,
        linked_reservations: linkedRes.modifiedCount || 0,
      })
      response.headers.set('Set-Cookie', buildSessionCookie(token))
      return handleCORS(response)
    }

    // POST /auth/login  body: { email, password }
    if (route === '/auth/login' && method === 'POST') {
      const body = await request.json()
      const email = (body.email || '').trim().toLowerCase()
      const password = body.password || ''
      if (!email || !password) {
        return handleCORS(NextResponse.json({ error: 'Email and password are required' }, { status: 400 }))
      }
      const user = await db.collection('users').findOne({ email })
      if (!user || !(await verifyPassword(password, user.password_hash))) {
        return handleCORS(NextResponse.json({ error: 'Invalid email or password' }, { status: 401 }))
      }
      const token = await signSession({ uid: user.id, email })
      const response = NextResponse.json({ ok: true, user: publicUser(user) })
      response.headers.set('Set-Cookie', buildSessionCookie(token))
      return handleCORS(response)
    }

    // POST /auth/logout — clears the cookie
    if (route === '/auth/logout' && method === 'POST') {
      const response = NextResponse.json({ ok: true })
      response.headers.set('Set-Cookie', buildClearCookie())
      return handleCORS(response)
    }

    // GET /auth/me — returns the logged-in user, or 200 with user:null when guest
    if (route === '/auth/me' && method === 'GET') {
      const user = await currentUser()
      return handleCORS(NextResponse.json({ user: publicUser(user) }))
    }

    // ====================================================================
    //                       LOGGED-IN USER DATA
    // ====================================================================

    // PUT /users/me — update profile (name/phone)
    if (route === '/users/me' && method === 'PUT') {
      const user = await currentUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      const update = { updated_at: new Date() }
      if (typeof body.name === 'string') update.name = body.name.trim()
      if (typeof body.phone === 'string') update.phone = body.phone.trim()
      await db.collection('users').updateOne({ id: user.id }, { $set: update })
      const fresh = await db.collection('users').findOne({ id: user.id })
      return handleCORS(NextResponse.json(publicUser(fresh)))
    }

    // GET /users/me/orders — all orders linked to this user, newest first
    if (route === '/users/me/orders' && method === 'GET') {
      const user = await currentUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const orders = await db.collection('orders').find({ user_id: user.id }).sort({ created_at: -1 }).limit(100).toArray()
      return handleCORS(NextResponse.json(orders.map(stripId)))
    }

    // GET /users/me/reservations
    if (route === '/users/me/reservations' && method === 'GET') {
      const user = await currentUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const list = await db.collection('reservations').find({ user_id: user.id }).sort({ date: -1, time: -1 }).limit(50).toArray()
      // Backfill reservation_code on legacy rows so client-side tracking links work
      const ensured = []
      for (const r of list) ensured.push(await ensureReservationCode(db, r))
      return handleCORS(NextResponse.json(ensured.map(stripId)))
    }

    // GET /users/me/linkable-reservations — guest reservations whose
    // email/phone matches the logged-in user but which haven't been claimed
    // yet (user_id is null). Used by the profile to show the
    // "We found your previous reservations" prompt.
    if (route === '/users/me/linkable-reservations' && method === 'GET') {
      const user = await currentUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const matchers = []
      if (user.email) matchers.push({ email: { $regex: `^${user.email}$`, $options: 'i' } })
      if (user.phone) {
        const tail = user.phone.replace(/\D/g, '').slice(-7)
        if (tail) matchers.push({ phone: { $regex: tail.split('').join('\\D*') } })
      }
      if (matchers.length === 0) return handleCORS(NextResponse.json({ reservations: [] }))
      const list = await db.collection('reservations')
        .find({ user_id: null, $or: matchers })
        .sort({ created_at: -1 })
        .limit(20)
        .toArray()
      const ensured = []
      for (const r of list) ensured.push(await ensureReservationCode(db, r))
      return handleCORS(NextResponse.json({
        reservations: ensured.map(stripId),
      }))
    }

    // POST /users/me/link-reservations — body { reservation_ids: [...] }.
    // Claims unowned reservations matching the user's email/phone. Refuses
    // to claim reservations already owned by someone else.
    if (route === '/users/me/link-reservations' && method === 'POST') {
      const user = await currentUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json().catch(() => ({}))
      const ids = Array.isArray(body.reservation_ids) ? body.reservation_ids.filter(Boolean) : []
      if (ids.length === 0) return handleCORS(NextResponse.json({ error: 'reservation_ids required' }, { status: 400 }))

      // Defence: only claim ones whose contact info matches THIS user.
      const matchers = []
      if (user.email) matchers.push({ email: { $regex: `^${user.email}$`, $options: 'i' } })
      if (user.phone) {
        const tail = user.phone.replace(/\D/g, '').slice(-7)
        if (tail) matchers.push({ phone: { $regex: tail.split('').join('\\D*') } })
      }
      if (matchers.length === 0) {
        return handleCORS(NextResponse.json({ error: 'Profile missing email/phone' }, { status: 400 }))
      }

      const result = await db.collection('reservations').updateMany(
        { id: { $in: ids }, user_id: null, $or: matchers },
        { $set: { user_id: user.id, linked_at: new Date() } }
      )
      return handleCORS(NextResponse.json({ ok: true, linked: result.modifiedCount || 0 }))
    }

    // GET /users/me/favorites — returns the dish documents (not just ids)
    if (route === '/users/me/favorites' && method === 'GET') {
      const user = await currentUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const ids = user.favorites || []
      if (ids.length === 0) return handleCORS(NextResponse.json([]))
      const dishes = await db.collection('dishes').find({ id: { $in: ids } }).toArray()
      return handleCORS(NextResponse.json(dishes.map(stripId)))
    }

    // POST /users/me/favorites  body: { dish_id }  — toggles in/out of favorites
    if (route === '/users/me/favorites' && method === 'POST') {
      const user = await currentUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const { dish_id } = await request.json()
      if (!dish_id) return handleCORS(NextResponse.json({ error: 'dish_id required' }, { status: 400 }))
      const has = (user.favorites || []).includes(dish_id)
      const op = has ? { $pull: { favorites: dish_id } } : { $addToSet: { favorites: dish_id } }
      await db.collection('users').updateOne({ id: user.id }, op)
      return handleCORS(NextResponse.json({ ok: true, favorited: !has }))
    }

    // GET /users/me/addresses
    if (route === '/users/me/addresses' && method === 'GET') {
      const user = await currentUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      return handleCORS(NextResponse.json(user.addresses || []))
    }

    // POST /users/me/addresses  body: { address, city, zip, label?, delivery_zone_id? }
    // De-dupes by (address+city+zip) and bumps last_used_at instead of duplicating.
    if (route === '/users/me/addresses' && method === 'POST') {
      const user = await currentUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      if (!body.address) return handleCORS(NextResponse.json({ error: 'address required' }, { status: 400 }))

      const list = user.addresses || []
      const key = `${(body.address || '').toLowerCase().trim()}|${(body.city || '').toLowerCase().trim()}|${(body.zip || '').trim()}`
      const idx = list.findIndex(a => `${(a.address||'').toLowerCase().trim()}|${(a.city||'').toLowerCase().trim()}|${(a.zip||'').trim()}` === key)
      const now = new Date()
      let updated
      if (idx >= 0) {
        list[idx].last_used_at = now
        if (body.delivery_zone_id) list[idx].delivery_zone_id = body.delivery_zone_id
        if (body.label) list[idx].label = body.label
        updated = list
      } else {
        updated = [
          ...list,
          {
            id: uuidv4(),
            label: body.label || 'Home',
            address: body.address,
            city: body.city || 'Kaunas',
            zip: body.zip || '',
            delivery_zone_id: body.delivery_zone_id || null,
            created_at: now,
            last_used_at: now,
          },
        ]
      }
      await db.collection('users').updateOne({ id: user.id }, { $set: { addresses: updated, updated_at: now } })
      return handleCORS(NextResponse.json(updated))
    }

    // DELETE /users/me/addresses/:id
    if (path[0] === 'users' && path[1] === 'me' && path[2] === 'addresses' && path.length === 4 && method === 'DELETE') {
      const user = await currentUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const updated = (user.addresses || []).filter(a => a.id !== path[3])
      await db.collection('users').updateOne({ id: user.id }, { $set: { addresses: updated, updated_at: new Date() } })
      return handleCORS(NextResponse.json(updated))
    }

    // ====================================================================
    //                       NOTIFICATIONS (logged-in user)
    // ====================================================================

    // GET /notifications — list current user's notifications.
    // Query params: ?unread_only=true to filter to unread only.
    if (route === '/notifications' && method === 'GET') {
      const user = await currentUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const url = new URL(request.url)
      const unreadOnly = url.searchParams.get('unread_only') === 'true'
      const filter = { user_id: user.id }
      if (unreadOnly) filter.read = false
      const list = await db.collection('notifications').find(filter).sort({ created_at: -1 }).limit(50).toArray()
      const unreadCount = await db.collection('notifications').countDocuments({ user_id: user.id, read: false })
      return handleCORS(NextResponse.json({
        notifications: list.map(stripId),
        unread_count: unreadCount,
      }))
    }

    // POST /notifications/:id/read — mark a single notification read
    if (path[0] === 'notifications' && path.length === 3 && path[2] === 'read' && method === 'POST') {
      const user = await currentUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      await db.collection('notifications').updateOne(
        { id: path[1], user_id: user.id },
        { $set: { read: true, read_at: new Date() } }
      )
      return handleCORS(NextResponse.json({ ok: true }))
    }

    // POST /notifications/read-all — mark all current user's notifications read
    if (route === '/notifications/read-all' && method === 'POST') {
      const user = await currentUser()
      if (!user) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const result = await db.collection('notifications').updateMany(
        { user_id: user.id, read: false },
        { $set: { read: true, read_at: new Date() } }
      )
      return handleCORS(NextResponse.json({ ok: true, marked: result.modifiedCount || 0 }))
    }

    // ---------------- Admin auth ----------------
    if (route === '/admin/login' && method === 'POST') {
      const body = await request.json()
      if (body.password === (process.env.ADMIN_PASSWORD || 'admin123')) {
        return handleCORS(NextResponse.json({ ok: true, token: process.env.ADMIN_PASSWORD || 'admin123' }))
      }
      return handleCORS(NextResponse.json({ error: 'Invalid password' }, { status: 401 }))
    }

    // ---------------- Delivery Zones ----------------
    // GET /delivery-zones (public)
    if (route === '/delivery-zones' && method === 'GET') {
      const zones = await db.collection('delivery_zones').find({ active: { $ne: false } }).sort({ fee: 1 }).toArray()
      return handleCORS(NextResponse.json(zones.map(stripId)))
    }
    // POST /delivery-zones (admin)
    if (route === '/delivery-zones' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      const zone = {
        id: uuidv4(),
        name: body.name || 'New zone',
        name_lt: body.name_lt || body.name || 'Nauja zona',
        fee: parseFloat(body.fee) || 0,
        eta_minutes: parseInt(body.eta_minutes) || 30,
        postal_codes: Array.isArray(body.postal_codes) ? body.postal_codes : (body.postal_codes || '').split(',').map(s => s.trim()).filter(Boolean),
        active: body.active !== false,
      }
      await db.collection('delivery_zones').insertOne(zone)
      return handleCORS(NextResponse.json(stripId(zone)))
    }
    // PUT /delivery-zones/:id (admin)
    if (path[0] === 'delivery-zones' && path.length === 2 && method === 'PUT') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      const update = {}
      if (body.name !== undefined) update.name = body.name
      if (body.name_lt !== undefined) update.name_lt = body.name_lt
      if (body.fee !== undefined) update.fee = parseFloat(body.fee)
      if (body.eta_minutes !== undefined) update.eta_minutes = parseInt(body.eta_minutes)
      if (body.postal_codes !== undefined) update.postal_codes = Array.isArray(body.postal_codes) ? body.postal_codes : (body.postal_codes || '').split(',').map(s => s.trim()).filter(Boolean)
      if (body.active !== undefined) update.active = !!body.active
      await db.collection('delivery_zones').updateOne({ id: path[1] }, { $set: update })
      const updated = await db.collection('delivery_zones').findOne({ id: path[1] })
      return handleCORS(NextResponse.json(stripId(updated)))
    }
    // DELETE /delivery-zones/:id (admin)
    if (path[0] === 'delivery-zones' && path.length === 2 && method === 'DELETE') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      await db.collection('delivery_zones').deleteOne({ id: path[1] })
      return handleCORS(NextResponse.json({ ok: true }))
    }

    // ---------------- Order Dispatch (admin) ----------------
    // POST /orders/:id/dispatch  body: { provider }
    // Predictive dispatch: callable while order.status is 'preparing' OR 'ready'.
    // Sets delivery_status='courier_requested'; does NOT advance order.status until pickup.
    if (path[0] === 'orders' && path.length === 3 && path[2] === 'dispatch' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      const provider = body.provider || 'in_house'
      if (!isValidProvider(provider)) return handleCORS(NextResponse.json({ error: 'Invalid provider' }, { status: 400 }))
      const order = await db.collection('orders').findOne({ id: path[1] })
      if (!order) return handleCORS(NextResponse.json({ error: 'Order not found' }, { status: 404 }))
      if (order.type !== 'delivery') return handleCORS(NextResponse.json({ error: 'Not a delivery order' }, { status: 400 }))
      if (!['preparing', 'ready'].includes(order.status)) {
        return handleCORS(NextResponse.json({ error: 'Order must be Preparing or Ready before dispatch' }, { status: 400 }))
      }
      if (['courier_requested', 'picked_up', 'on_the_way', 'delivered'].includes(order.delivery_status)) {
        return handleCORS(NextResponse.json({ error: 'Courier already requested for this order' }, { status: 400 }))
      }

      const courierResp = await createCourierRequest(provider, order)
      const update = {
        delivery_method: provider,
        delivery_provider: provider,
        delivery_status: 'courier_requested',
        courier_reference_id: courierResp.courier_reference_id,
        courier_tracking_url: courierResp.tracking_url,
        courier_eta: courierResp.courier_eta || order.courier_eta,
        courier_requested_at: new Date(),
        courier_assigned_at: new Date(),
        updated_at: new Date(),
      }
      await db.collection('orders').updateOne({ id: path[1] }, { $set: update })
      const updated = await db.collection('orders').findOne({ id: path[1] })
      return handleCORS(NextResponse.json({ ok: true, manual: courierResp.manual, order: stripId(updated) }))
    }

    // POST /orders/:id/picked-up (admin) — courier picked up the food and left
    if (path[0] === 'orders' && path.length === 3 && path[2] === 'picked-up' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      await db.collection('orders').updateOne({ id: path[1] }, { $set: {
        delivery_status: 'picked_up',
        status: 'out',
        picked_up_at: new Date(),
        out_at: new Date(),
        updated_at: new Date(),
      } })
      const updated = await db.collection('orders').findOne({ id: path[1] })
      return handleCORS(NextResponse.json(stripId(updated)))
    }

    // POST /orders/:id/delivered (admin) — final delivered
    if (path[0] === 'orders' && path.length === 3 && path[2] === 'delivered' && method === 'POST') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      await db.collection('orders').updateOne({ id: path[1] }, { $set: { delivery_status: 'delivered', status: 'delivered', delivered_at: new Date(), updated_at: new Date() } })
      const updated = await db.collection('orders').findOne({ id: path[1] })
      return handleCORS(NextResponse.json(stripId(updated)))
    }

    // ---------------- Newsletter ----------------
    if (route === '/newsletter' && method === 'POST') {
      const body = await request.json()
      if (!body.email) return handleCORS(NextResponse.json({ error: 'email required' }, { status: 400 }))
      await db.collection('newsletters').updateOne(
        { email: body.email },
        { $set: { email: body.email, subscribed_at: new Date() } },
        { upsert: true }
      )
      return handleCORS(NextResponse.json({ ok: true }))
    }

    // ---------------- AI Recommendations ----------------
    // POST /recommend  body: { dish_id?, favorites?: [ids], history?: [ids], limit?: number }
    if (route === '/recommend' && method === 'POST') {
      const body = await request.json().catch(() => ({}))
      const limit = Math.min(parseInt(body.limit) || 3, 6)
      const allDishes = await db.collection('dishes').find({ available: { $ne: false } }).toArray()
      const dishMap = Object.fromEntries(allDishes.map(d => [d.id, d]))

      const currentDish = body.dish_id ? dishMap[body.dish_id] : null
      const favorites = (body.favorites || []).map(id => dishMap[id]).filter(Boolean)
      const history = (body.history || []).map(id => dishMap[id]).filter(Boolean)

      // Exclude the current dish from suggestions
      const excludeIds = new Set([body.dish_id, ...(body.favorites || []), ...(body.history || [])].filter(Boolean))
      const candidates = allDishes.filter(d => !excludeIds.has(d.id))

      const llmKey = process.env.EMERGENT_LLM_KEY
      const llmUrl = process.env.EMERGENT_LLM_URL || 'https://integrations.emergentagent.com/llm/v1/chat/completions'

      // Helper: rule-based fallback
      function ruleBased() {
        // Priority: pair complementary categories with current dish
        const targetCats = currentDish
          ? (currentDish.category === 'mains' ? ['starters', 'soups', 'desserts'] :
             currentDish.category === 'starters' ? ['mains', 'soups'] :
             currentDish.category === 'soups' ? ['mains', 'starters'] :
             currentDish.category === 'desserts' ? ['drinks', 'mains'] :
             ['mains'])
          : ['mains', 'desserts', 'starters']
        const scored = candidates.map(d => {
          let s = 0
          if (targetCats.includes(d.category)) s += 5
          if (d.bestseller) s += 3
          // Match dietary preferences from favorites
          if (favorites.length) {
            const favTags = new Set(favorites.flatMap(f => f.dietary_tags || []))
            if ((d.dietary_tags || []).some(t => favTags.has(t))) s += 2
          }
          s += Math.random() * 0.5 // tiny tiebreaker
          return { dish: d, score: s }
        }).sort((a, b) => b.score - a.score)
        return scored.slice(0, limit).map(({ dish }) => ({
          id: dish.id, name: dish.name, name_lt: dish.name_lt, price: dish.price,
          image_url: dish.image_url, category: dish.category, bestseller: dish.bestseller,
          reason: dish.bestseller ? 'A guest favorite' : `Pairs beautifully — ${dish.category}`,
        }))
      }

      // Try LLM
      if (llmKey && candidates.length > 0) {
        try {
          const dishList = candidates.slice(0, 25).map(d => ({
            id: d.id, name: d.name, category: d.category,
            description: (d.description || '').slice(0, 120),
            price: d.price, dietary_tags: d.dietary_tags || [], bestseller: !!d.bestseller,
          }))

          const sys = `You are the head sommelier and maître d' of Aukštaitija, a modern Lithuanian fine-dining restaurant in Kaunas. You know how flavors, courses, and Lithuanian culinary traditions pair together. You always respond with valid minified JSON.`

          const userPrompt = `From the menu below, pick exactly ${limit} dishes that would best COMPLEMENT what the customer is looking at.
${currentDish ? `\nCurrent dish viewed: ${currentDish.name} (${currentDish.category}, €${currentDish.price}). Description: ${currentDish.description}` : ''}
${favorites.length ? `\nCustomer favorites so far: ${favorites.map(f => f.name).join(', ')}` : ''}
${history.length ? `\nRecently browsed: ${history.map(h => h.name).join(', ')}` : ''}

Available menu (do NOT invent dishes — only pick from these ids):
${JSON.stringify(dishList)}

Rules:
1. Pick ${limit} different dishes that PAIR well with the current selection (different course, complementary flavors).
2. Avoid picking another dish from the same exact category unless it's clearly justified.
3. For each pick, write a single warm, persuasive sentence (max 14 words, English).
4. Return JSON in this exact shape: {"picks":[{"id":"<dish_id>","reason":"<sentence>"}]}`

          const llmRes = await fetch(llmUrl, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${llmKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: 'gpt-4o-mini',
              response_format: { type: 'json_object' },
              temperature: 0.6,
              max_tokens: 400,
              messages: [
                { role: 'system', content: sys },
                { role: 'user', content: userPrompt },
              ],
            }),
            signal: AbortSignal.timeout(12000),
          })
          if (!llmRes.ok) throw new Error(`LLM HTTP ${llmRes.status}`)
          const llmData = await llmRes.json()
          const content = llmData.choices?.[0]?.message?.content || '{}'
          const parsed = JSON.parse(content)
          const picks = (parsed.picks || []).slice(0, limit)
            .map(p => {
              const d = dishMap[p.id]
              if (!d) return null
              return {
                id: d.id, name: d.name, name_lt: d.name_lt, price: d.price,
                image_url: d.image_url, category: d.category, bestseller: d.bestseller,
                reason: (p.reason || '').slice(0, 120) || 'Recommended for you',
              }
            }).filter(Boolean)
          if (picks.length > 0) {
            return handleCORS(NextResponse.json({ source: 'ai', model: 'gpt-4o-mini', picks }))
          }
        } catch (err) {
          console.warn('LLM recommend failed:', err.message)
          // fall through to rule-based
        }
      }

      return handleCORS(NextResponse.json({ source: 'rules', picks: ruleBased() }))
    }

    // ---------------- Analytics (admin) ----------------
    if (route === '/admin/analytics' && method === 'GET') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const orders = await db.collection('orders').find({}).toArray()
      const reservations = await db.collection('reservations').find({}).toArray()
      const totalRevenue = orders.reduce((s, o) => s + (o.total || 0), 0)
      const today = new Date(); today.setHours(0,0,0,0)
      const todayOrders = orders.filter(o => new Date(o.created_at) >= today)
      const todayRevenue = todayOrders.reduce((s, o) => s + (o.total || 0), 0)
      const dishCount = {}
      orders.forEach(o => (o.items || []).forEach(i => {
        dishCount[i.name] = (dishCount[i.name] || 0) + (i.quantity || 1)
      }))
      const topDishes = Object.entries(dishCount).sort((a,b) => b[1]-a[1]).slice(0,5).map(([name, count]) => ({ name, count }))
      const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0

      // Delivery analytics
      const delivOrders = orders.filter(o => o.type === 'delivery')
      const providerCounts = { in_house: 0, wolt: 0, bolt_food: 0 }
      let totalDeliveryMs = 0
      let deliveredCount = 0
      delivOrders.forEach(o => {
        const p = o.delivery_method || o.delivery_provider || 'in_house'
        if (providerCounts[p] !== undefined) providerCounts[p]++
        if (o.delivered_at && o.created_at) {
          totalDeliveryMs += new Date(o.delivered_at).getTime() - new Date(o.created_at).getTime()
          deliveredCount++
        }
      })
      const avgDeliveryMin = deliveredCount > 0 ? Math.round(totalDeliveryMs / deliveredCount / 60000) : 0

      // Waiter / service-floor performance — restricted to dine-in orders that
      // actually went through the waiter dashboard (have served_at). We track:
      //   • served_count      — total dine-in plates marked served
      //   • served_today      — same, since 00:00 today
      //   • avg_pickup_minutes — ready_at → waiter_picked_up_at (how long the
      //                         plate sat on the pass before a waiter grabbed it)
      //   • avg_serve_minutes  — waiter_picked_up_at → served_at (walking time)
      //   • avg_kitchen_to_table_minutes — ready_at → served_at (overall pass
      //                         to table; the metric guests actually feel)
      const waiterServed = orders.filter(o =>
        o.served_at && (o.order_type === 'dine_in' || o.type === 'dine-in' || o.table_id)
      )
      let pickMs = 0, pickN = 0
      let serveMs = 0, serveN = 0
      let k2tMs = 0, k2tN = 0
      let servedToday = 0
      waiterServed.forEach(o => {
        const served = new Date(o.served_at).getTime()
        if (o.ready_at && o.waiter_picked_up_at) {
          pickMs += new Date(o.waiter_picked_up_at).getTime() - new Date(o.ready_at).getTime()
          pickN++
        }
        if (o.waiter_picked_up_at) {
          serveMs += served - new Date(o.waiter_picked_up_at).getTime()
          serveN++
        }
        if (o.ready_at) {
          k2tMs += served - new Date(o.ready_at).getTime()
          k2tN++
        }
        if (new Date(o.served_at) >= today) servedToday++
      })
      const round1 = (n) => Math.round(n * 10) / 10 // keep 1 decimal — minutes are short
      const waiterStats = {
        served_count: waiterServed.length,
        served_today: servedToday,
        avg_pickup_minutes: pickN > 0 ? round1(pickMs / pickN / 60000) : 0,
        avg_serve_minutes: serveN > 0 ? round1(serveMs / serveN / 60000) : 0,
        avg_kitchen_to_table_minutes: k2tN > 0 ? round1(k2tMs / k2tN / 60000) : 0,
        sample_size: { pickup: pickN, serve: serveN, kitchen_to_table: k2tN },
      }

      return handleCORS(NextResponse.json({
        total_revenue: +totalRevenue.toFixed(2),
        today_revenue: +todayRevenue.toFixed(2),
        total_orders: orders.length,
        today_orders: todayOrders.length,
        total_reservations: reservations.length,
        avg_order_value: +avgOrderValue.toFixed(2),
        top_dishes: topDishes,
        delivery: {
          total_delivery_orders: delivOrders.length,
          provider_counts: providerCounts,
          avg_delivery_minutes: avgDeliveryMin,
          delivered_count: deliveredCount,
        },
        waiter: waiterStats,
      }))
    }

    return handleCORS(NextResponse.json({ error: `Route ${route} not found` }, { status: 404 }))
  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json({ error: 'Internal server error', detail: error.message }, { status: 500 }))
  }
}

export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute
