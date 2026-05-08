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
  if (tablesCount === 0) {
    const tables = []
    for (let i = 1; i <= 10; i++) {
      tables.push({ id: `t${i}`, number: i, capacity: i <= 4 ? 2 : i <= 8 ? 4 : 8 })
    }
    await db.collection('tables').insertMany(tables)
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

      const order = {
        id: uuidv4(),
        order_number: 'AK' + Date.now().toString().slice(-6),
        items: body.items,
        type: body.type || 'pickup', // delivery | pickup | dine-in
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

    // PUT /reservations/:id (admin)
    if (path[0] === 'reservations' && path.length === 2 && method === 'PUT') {
      if (!isAdmin(request)) return handleCORS(NextResponse.json({ error: 'Unauthorized' }, { status: 401 }))
      const body = await request.json()
      await db.collection('reservations').updateOne({ id: path[1] }, { $set: { status: body.status } })
      const updated = await db.collection('reservations').findOne({ id: path[1] })
      return handleCORS(NextResponse.json(stripId(updated)))
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
