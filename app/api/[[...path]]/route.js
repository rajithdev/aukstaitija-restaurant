import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import { CATEGORIES, DISHES } from '@/lib/seedData'

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
    // Look for assigned reservations within next 2h or in past 30 min
    const reservations = await db.collection('reservations').find({
      table_id: t.id,
      status: { $in: ['confirmed', 'pending'] }
    }).toArray()
    let isReserved = false
    for (const r of reservations) {
      const resDt = new Date(`${r.date}T${r.time}:00`)
      const diff = resDt.getTime() - now.getTime()
      if (diff > -30 * 60 * 1000 && diff <= 2 * 60 * 60 * 1000) {
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

async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()
    await ensureSeeded(db)

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
      const subtotal = body.items.reduce((s, i) => s + (parseFloat(i.price) * parseInt(i.quantity)), 0)
      const tax = +(subtotal * 0.21).toFixed(2) // 21% VAT Lithuania
      const deliveryFee = body.type === 'delivery' ? (body.deliveryFee || 3.50) : 0
      const discount = body.discount || 0
      const total = +(subtotal + tax + deliveryFee - discount).toFixed(2)

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
            customer_name: body.customer?.name || 'Walk-in',
            guests: body.guests || 2,
            started_at: new Date(),
            ended_at: null,
            session_status: 'active',
            origin: 'qr_order',
          }
          await db.collection('table_sessions').insertOne(session)
          await setTableStatus(db, body.table_id, 'occupied')
        }
        sessionId = session.id
      }

      const order = {
        id: uuidv4(),
        order_number: 'AK' + Date.now().toString().slice(-6),
        items: body.items,
        type: body.type || (body.table_id ? 'dine-in' : 'pickup'),
        order_type: body.table_id ? 'dine_in' : (body.type === 'delivery' ? 'delivery' : 'pickup'),
        table_id: body.table_id || null,
        table_number: tableNumber,
        session_id: sessionId,
        customer: body.customer || {},
        address: body.address || null,
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
      return handleCORS(NextResponse.json(stripId(order)))
    }

    // GET /orders/:id
    if (path[0] === 'orders' && path.length === 2 && method === 'GET') {
      const order = await db.collection('orders').findOne({ id: path[1] })
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

    // ---------------- Reservations ----------------
    // POST /reservations
    if (route === '/reservations' && method === 'POST') {
      const body = await request.json()
      if (!body.date || !body.time || !body.guests || !body.name) {
        return handleCORS(NextResponse.json({ error: 'date, time, guests, name required' }, { status: 400 }))
      }
      // Check capacity for that slot
      const existing = await db.collection('reservations').find({
        date: body.date,
        time: body.time,
        status: { $ne: 'cancelled' }
      }).toArray()
      const totalTables = await db.collection('tables').countDocuments()
      if (existing.length >= totalTables) {
        return handleCORS(NextResponse.json({ error: 'Slot fully booked' }, { status: 409 }))
      }

      const reservation = {
        id: uuidv4(),
        confirmation: 'RES' + Date.now().toString().slice(-6),
        name: body.name,
        phone: body.phone || '',
        email: body.email || '',
        date: body.date,
        time: body.time,
        guests: parseInt(body.guests) || 2,
        special_requests: body.special_requests || '',
        status: 'confirmed',
        created_at: new Date(),
      }
      await db.collection('reservations').insertOne(reservation)
      return handleCORS(NextResponse.json(stripId(reservation)))
    }

    // GET /reservations/availability?date=YYYY-MM-DD
    if (route === '/reservations/availability' && method === 'GET') {
      const url = new URL(request.url)
      const date = url.searchParams.get('date')
      if (!date) return handleCORS(NextResponse.json({ error: 'date required' }, { status: 400 }))
      const totalTables = await db.collection('tables').countDocuments()
      const reservations = await db.collection('reservations').find({
        date,
        status: { $ne: 'cancelled' }
      }).toArray()
      const slots = []
      for (let h = 12; h <= 22; h++) {
        for (const m of [0, 30]) {
          if (h === 22 && m === 30) continue
          const time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
          const booked = reservations.filter(r => r.time === time).length
          slots.push({ time, available: totalTables - booked, total: totalTables })
        }
      }
      return handleCORS(NextResponse.json({ date, slots, total_tables: totalTables }))
    }

    // GET /reservations (admin)
    if (route === '/reservations' && method === 'GET') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const reservations = await db.collection('reservations').find({}).sort({ date: -1, time: 1 }).limit(200).toArray()
      return handleCORS(NextResponse.json(reservations.map(stripId)))
    }

    // PUT /reservations/:id (admin) — generic status update
    if (path[0] === 'reservations' && path.length === 2 && method === 'PUT') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      const update = {}
      if (body.status) update.status = body.status
      if (body.table_id !== undefined) update.table_id = body.table_id
      if (body.status === 'no_show') update.no_show_at = new Date()
      if (body.status === 'completed') update.completed_at = new Date()
      await db.collection('reservations').updateOne({ id: path[1] }, { $set: update })
      const updated = await db.collection('reservations').findOne({ id: path[1] })
      return handleCORS(NextResponse.json(stripId(updated)))
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
          status: { $in: ['confirmed', 'pending'] },
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
        status: { $in: ['confirmed', 'pending'] },
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

    // PUT /tables/:id (admin) — update status / capacity / position / out_of_service
    if (path[0] === 'tables' && path.length === 2 && method === 'PUT') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      const update = {}
      const allowed = ['status', 'capacity', 'section', 'x', 'y', 'number']
      for (const k of allowed) if (body[k] !== undefined) update[k] = body[k]
      await db.collection('tables').updateOne({ id: path[1] }, { $set: update })
      const updated = await db.collection('tables').findOne({ id: path[1] })
      return handleCORS(NextResponse.json(stripId(updated)))
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

    // ---------------- Admin auth ----------------
    if (route === '/admin/login' && method === 'POST') {
      const body = await request.json()
      if (body.password === (process.env.ADMIN_PASSWORD || 'admin123')) {
        return handleCORS(NextResponse.json({ ok: true, token: process.env.ADMIN_PASSWORD || 'admin123' }))
      }
      return handleCORS(NextResponse.json({ error: 'Invalid password' }, { status: 401 }))
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
      return handleCORS(NextResponse.json({
        total_revenue: +totalRevenue.toFixed(2),
        today_revenue: +todayRevenue.toFixed(2),
        total_orders: orders.length,
        today_orders: todayOrders.length,
        total_reservations: reservations.length,
        avg_order_value: +avgOrderValue.toFixed(2),
        top_dishes: topDishes,
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
