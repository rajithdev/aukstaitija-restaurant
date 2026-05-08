'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ChefHat, Truck, ShoppingBag, Utensils, Clock, AlertTriangle, Bell, BellOff, LogOut, ArrowLeft, Volume2, Flame, CheckCircle2, PackageCheck } from 'lucide-react'
import { toast } from 'sonner'

const TYPE_ICONS = { delivery: Truck, pickup: ShoppingBag, 'dine-in': Utensils }

function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function OrderCard({ order, onAccept, onReady, onDispatch, onPriority, now }) {
  const TypeIcon = TYPE_ICONS[order.type] || ShoppingBag
  const createdMs = now - new Date(order.created_at).getTime()
  const acceptedMs = order.accepted_at ? now - new Date(order.accepted_at).getTime() : 0
  const readyMs = order.ready_at ? now - new Date(order.ready_at).getTime() : 0

  const isLate = createdMs > 15 * 60 * 1000 && order.status !== 'ready'
  const isUrgent = createdMs > 25 * 60 * 1000 || order.priority

  const accentColor = order.status === 'received' ? 'border-l-amber-500' : order.status === 'preparing' ? 'border-l-blue-500' : 'border-l-green-500'

  return (
    <Card className={`p-4 border-l-4 ${accentColor} ${isUrgent ? 'ring-2 ring-destructive animate-pulse' : isLate ? 'ring-1 ring-amber-500' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <div>
          <p className="font-serif text-2xl">#{order.order_number}</p>
          <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
            <TypeIcon className="h-3 w-3" />
            <span className="uppercase tracking-wider">{order.type}</span>
            {order.priority && <span className="text-destructive flex items-center gap-1"><Flame className="h-3 w-3" /> PRIORITY</span>}
          </div>
        </div>
        <div className="text-right">
          <div className={`flex items-center gap-1 font-mono text-xl ${isUrgent ? 'text-destructive' : isLate ? 'text-amber-500' : 'text-foreground'}`}>
            <Clock className="h-4 w-4" />
            {formatElapsed(createdMs)}
          </div>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">since order</p>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-2">{order.customer?.name} {order.customer?.phone && `· ${order.customer.phone}`}</p>

      <div className="my-3 space-y-1.5">
        {order.items?.map((i, idx) => (
          <div key={idx} className="flex items-baseline gap-2 text-sm">
            <span className="font-bold text-primary text-base w-6">{i.quantity}×</span>
            <span className="flex-1">{i.name}</span>
          </div>
        ))}
      </div>

      {order.notes && (
        <div className="my-3 p-2 bg-amber-500/10 border border-amber-500/30 rounded-sm text-xs">
          <p className="font-semibold text-amber-700 dark:text-amber-400 mb-1">⚠ Notes:</p>
          <p className="italic">{order.notes}</p>
        </div>
      )}
      {order.items?.some(i => i.notes) && (
        <div className="my-3 p-2 bg-blue-500/10 border border-blue-500/30 rounded-sm text-xs">
          {order.items.filter(i => i.notes).map((i, idx) => (
            <p key={idx} className="italic">"{i.notes}" <span className="text-muted-foreground">— {i.name}</span></p>
          ))}
        </div>
      )}

      {order.status === 'preparing' && (
        <p className="text-xs text-blue-500 mb-2">⏱ Cooking: {formatElapsed(acceptedMs)}</p>
      )}
      {order.status === 'ready' && (
        <p className="text-xs text-green-500 mb-2">✓ Ready for {formatElapsed(readyMs)}</p>
      )}

      <div className="flex gap-2 mt-3">
        {order.status === 'received' && (
          <Button onClick={() => onAccept(order.id)} className="flex-1 h-11 bg-blue-600 hover:bg-blue-700 text-white">
            <ChefHat className="h-4 w-4 mr-1" /> Accept & Start
          </Button>
        )}
        {order.status === 'preparing' && (
          <Button onClick={() => onReady(order.id)} className="flex-1 h-11 bg-green-600 hover:bg-green-700 text-white">
            <PackageCheck className="h-4 w-4 mr-1" /> Mark Ready
          </Button>
        )}
        {order.status === 'ready' && (
          <Button onClick={() => onDispatch(order.id, order.type)} className="flex-1 h-11 bg-primary">
            <CheckCircle2 className="h-4 w-4 mr-1" /> {order.type === 'delivery' ? 'Dispatch' : 'Hand Over'}
          </Button>
        )}
        <Button onClick={() => onPriority(order.id, !order.priority)} variant="outline" size="icon" className="h-11 w-11" title="Toggle priority">
          <Flame className={`h-4 w-4 ${order.priority ? 'fill-destructive text-destructive' : ''}`} />
        </Button>
      </div>
    </Card>
  )
}

function KitchenPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [pwd, setPwd] = useState('')
  const [orders, setOrders] = useState([])
  const [now, setNow] = useState(Date.now())
  const [audioOn, setAudioOn] = useState(true)
  const [filter, setFilter] = useState('all')
  const prevIdsRef = useRef(new Set())
  const audioCtxRef = useRef(null)

  useEffect(() => {
    const t = localStorage.getItem('aukstaitija_admin_token') || ''
    if (t) setToken(t)
  }, [])

  // Tick every second for timers
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  const playChime = () => {
    if (!audioOn) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtxRef.current
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      o.connect(g); g.connect(ctx.destination)
      o.frequency.value = 880
      g.gain.value = 0.18
      o.start()
      o.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.25)
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
      o.stop(ctx.currentTime + 0.4)
    } catch (e) {}
  }

  const fetchOrders = async (tk = token) => {
    if (!tk) return
    const res = await fetch('/api/kitchen/orders', { headers: { 'x-admin-token': tk } })
    if (res.status === 401) { setToken(''); localStorage.removeItem('aukstaitija_admin_token'); return }
    const data = await res.json()
    if (Array.isArray(data)) {
      // Detect new orders for chime
      const newReceivedIds = new Set(data.filter(o => o.status === 'received').map(o => o.id))
      const prev = prevIdsRef.current
      let hasNew = false
      newReceivedIds.forEach(id => { if (!prev.has(id)) hasNew = true })
      if (hasNew && prev.size > 0) {
        playChime()
        toast.success('🔔 New order!')
      }
      prevIdsRef.current = newReceivedIds
      setOrders(data)
    }
  }

  // Poll every 4s
  useEffect(() => {
    if (!token) return
    fetchOrders(token)
    const i = setInterval(() => fetchOrders(token), 4000)
    return () => clearInterval(i)
  }, [token])

  const updateOrder = async (id, body) => {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify(body)
    })
    if (res.ok) fetchOrders()
  }

  const login = async (e) => {
    e.preventDefault()
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) })
    const data = await res.json()
    if (data.token) {
      setToken(data.token); localStorage.setItem('aukstaitija_admin_token', data.token)
    } else { toast.error('Invalid password') }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm p-6">
          <div className="text-center mb-6">
            <ChefHat className="h-12 w-12 mx-auto text-primary mb-3" />
            <h1 className="font-serif text-3xl">Kitchen</h1>
            <p className="text-xs text-muted-foreground mt-1">Aukštaitija · Staff access</p>
          </div>
          <form onSubmit={login} className="space-y-3">
            <div><Label>Password</Label><Input type="password" value={pwd} onChange={e => setPwd(e.target.value)} className="mt-2" required /></div>
            <Button type="submit" className="w-full h-11">Sign in</Button>
            <p className="text-xs text-muted-foreground text-center">Demo: <code className="text-primary">admin123</code></p>
          </form>
        </Card>
      </div>
    )
  }

  let visible = orders
  if (filter !== 'all') visible = visible.filter(o => o.type === filter)

  const cols = {
    received: visible.filter(o => o.status === 'received'),
    preparing: visible.filter(o => o.status === 'preparing'),
    ready: visible.filter(o => o.status === 'ready'),
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
      <header className="sticky top-0 z-50 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="container mx-auto h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
            <ChefHat className="h-6 w-6 text-primary" />
            <h1 className="font-serif text-2xl">Kitchen</h1>
            <span className="hidden md:inline text-xs uppercase tracking-[0.3em] text-muted-foreground">{new Date(now).toLocaleTimeString()}</span>
          </div>
          <div className="flex items-center gap-2">
            <select value={filter} onChange={e => setFilter(e.target.value)} className="h-9 px-3 text-sm bg-background border border-border rounded-md">
              <option value="all">All types</option>
              <option value="dine-in">Dine-in</option>
              <option value="pickup">Pickup</option>
              <option value="delivery">Delivery</option>
            </select>
            <Button variant="outline" size="icon" onClick={() => setAudioOn(!audioOn)} title="Toggle alert sound">
              {audioOn ? <Volume2 className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4" />}
            </Button>
            <Button variant="outline" onClick={() => { setToken(''); localStorage.removeItem('aukstaitija_admin_token') }}>
              <LogOut className="h-4 w-4 mr-1" /> Exit
            </Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-6">
        {/* Stats bar */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="p-4 border-l-4 border-l-amber-500">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Incoming</p>
            <p className="font-serif text-4xl">{cols.received.length}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-blue-500">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Cooking</p>
            <p className="font-serif text-4xl">{cols.preparing.length}</p>
          </Card>
          <Card className="p-4 border-l-4 border-l-green-500">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">Ready</p>
            <p className="font-serif text-4xl">{cols.ready.length}</p>
          </Card>
        </div>

        {/* Board */}
        <div className="grid lg:grid-cols-3 gap-4">
          {/* Incoming */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="font-serif text-2xl flex items-center gap-2"><Bell className="h-5 w-5 text-amber-500" /> Incoming</h2>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{cols.received.length}</span>
            </div>
            <div className="space-y-3">
              {cols.received.length === 0 && <p className="text-sm text-muted-foreground p-8 text-center">No incoming orders</p>}
              {cols.received.map(o => (
                <OrderCard key={o.id} order={o} now={now}
                  onAccept={(id) => updateOrder(id, { status: 'preparing' })}
                  onReady={(id) => updateOrder(id, { status: 'ready' })}
                  onDispatch={(id, type) => updateOrder(id, { status: type === 'delivery' ? 'out' : 'delivered' })}
                  onPriority={(id, p) => updateOrder(id, { priority: p })}
                />
              ))}
            </div>
          </div>

          {/* Cooking */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="font-serif text-2xl flex items-center gap-2"><Flame className="h-5 w-5 text-blue-500" /> Cooking</h2>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{cols.preparing.length}</span>
            </div>
            <div className="space-y-3">
              {cols.preparing.length === 0 && <p className="text-sm text-muted-foreground p-8 text-center">Nothing on the pass</p>}
              {cols.preparing.map(o => (
                <OrderCard key={o.id} order={o} now={now}
                  onAccept={(id) => updateOrder(id, { status: 'preparing' })}
                  onReady={(id) => updateOrder(id, { status: 'ready' })}
                  onDispatch={(id, type) => updateOrder(id, { status: type === 'delivery' ? 'out' : 'delivered' })}
                  onPriority={(id, p) => updateOrder(id, { priority: p })}
                />
              ))}
            </div>
          </div>

          {/* Ready */}
          <div>
            <div className="flex items-center justify-between mb-3 px-1">
              <h2 className="font-serif text-2xl flex items-center gap-2"><PackageCheck className="h-5 w-5 text-green-500" /> Ready</h2>
              <span className="text-xs uppercase tracking-wider text-muted-foreground">{cols.ready.length}</span>
            </div>
            <div className="space-y-3">
              {cols.ready.length === 0 && <p className="text-sm text-muted-foreground p-8 text-center">No orders ready</p>}
              {cols.ready.map(o => (
                <OrderCard key={o.id} order={o} now={now}
                  onAccept={(id) => updateOrder(id, { status: 'preparing' })}
                  onReady={(id) => updateOrder(id, { status: 'ready' })}
                  onDispatch={(id, type) => updateOrder(id, { status: type === 'delivery' ? 'out' : 'delivered' })}
                  onPriority={(id, p) => updateOrder(id, { priority: p })}
                />
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground mt-8">Live · auto-refreshes every 4s · Orders &gt; 15min show amber, &gt; 25min flash red</p>
      </div>
    </div>
  )
}

export default KitchenPage
