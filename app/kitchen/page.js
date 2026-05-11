'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import {
  ChefHat, Truck, ShoppingBag, Utensils, Clock, Bell, BellOff, LogOut,
  ArrowLeft, Volume2, Flame, CheckCircle2, PackageCheck, Bike,
  LayoutGrid, Inbox, Soup, Settings, History, Activity, MoreVertical, XCircle, X,
} from 'lucide-react'
import { toast } from 'sonner'
import DispatchModal from '@/components/DispatchModal'

// Premium KDS palette — locked dark regardless of global theme.
// Accents: gold (#D4A54A), cooking blue, ready emerald.
const TYPE_LABEL = { delivery: 'Delivery', pickup: 'Pickup', 'dine-in': 'Dine-in' }
const TYPE_ICONS = { delivery: Truck, pickup: ShoppingBag, 'dine-in': Utensils }
const PROVIDER_LABEL = {
  in_house: { label: 'In-house', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  wolt: { label: 'Wolt', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  bolt_food: { label: 'Bolt', cls: 'bg-emerald-400/15 text-emerald-200 border-emerald-400/30' },
}

function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

// ── Reusable atoms ──────────────────────────────────────────────────────────
const Pill = ({ children, className = '' }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-[0.18em] font-semibold border ${className}`}>
    {children}
  </span>
)

// ── Tiny overflow menu (hover/click reveal) ─────────────────────────────────
function OverflowMenu({ children, label = 'More' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return
    const close = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="h-11 w-11 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition"
        title={label}
        aria-label={label}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] z-20 min-w-[180px] rounded-xl bg-zinc-900 border border-white/10 shadow-xl py-1.5 text-sm">
          {typeof children === 'function' ? children(() => setOpen(false)) : children}
        </div>
      )}
    </div>
  )
}

const OverflowItem = ({ onClick, children, danger }) => (
  <button
    onClick={onClick}
    className={`w-full text-left px-3.5 py-2 flex items-center gap-2 hover:bg-white/5 transition ${danger ? 'text-red-300 hover:text-red-200' : 'text-zinc-200'}`}
  >
    {children}
  </button>
)

// ── Order card ──────────────────────────────────────────────────────────────
// Ultra-minimal kitchen workflow:
//   Incoming Queue (received + preparing) → ONE button: "Food Ready"
//                                         + inline header icons: Priority · Reject
//   Ready                                  → passive holding area (overflow menu
//                                            for delivery dispatch / pickup hand-off)
// Urgency: amber glow after 5 min, red pulsing after 8 min.
function OrderCard({ order, now, onReject, onReady, onDispatch, onPickedUp, onPriority, onServed }) {
  const TypeIcon = TYPE_ICONS[order.type] || ShoppingBag
  const createdMs = now - new Date(order.created_at).getTime()
  const readyMs = order.ready_at ? now - new Date(order.ready_at).getTime() : 0
  const isReady = order.status === 'ready'

  // Local UI state for the reject confirmation modal.
  const [rejectConfirmOpen, setRejectConfirmOpen] = useState(false)

  // Urgency thresholds (5 min amber, 8 min red) — only active until ready.
  const isLate   = !isReady && createdMs > 5 * 60 * 1000
  const isUrgent = !isReady && (createdMs > 8 * 60 * 1000 || order.priority)

  const provider = order.delivery_method || order.delivery_provider
  const providerInfo = provider ? PROVIDER_LABEL[provider] : null
  const isDelivery = order.type === 'delivery'
  const isDineIn = order.type === 'dine-in'

  const courierAlreadyRequested = isDelivery && ['courier_requested', 'courier_assigned', 'picked_up', 'on_the_way', 'delivered'].includes(order.delivery_status)

  // Per-status accent system
  const accent = isReady
    ? { glow: 'shadow-[0_0_32px_-12px_rgba(16,185,129,0.4)]', edge: 'before:from-emerald-400/70 before:via-emerald-400/20', ring: 'ring-emerald-400/30' }
    : { glow: 'shadow-[0_0_32px_-12px_rgba(212,165,74,0.4)]', edge: 'before:from-amber-400/70 before:via-amber-400/20', ring: 'ring-amber-400/30' }

  const urgencyRing = isUrgent
    ? 'ring-2 ring-red-500/70 animate-[pulse_1.6s_ease-in-out_infinite] shadow-[0_0_36px_-8px_rgba(239,68,68,0.5)]'
    : isLate
      ? 'ring-1 ring-amber-500/60 shadow-[0_0_32px_-10px_rgba(245,158,11,0.45)]'
      : `ring-1 ${accent.ring}`

  const itemCount = order.items?.reduce((s, i) => s + (i.quantity || 1), 0) || 0
  const itemNotes = (order.items || []).filter(i => i.notes)
  const timeColor = isUrgent ? 'text-red-400' : isLate ? 'text-amber-300' : 'text-zinc-100'

  return (
    <div className={`group relative overflow-hidden rounded-2xl bg-zinc-950/70 backdrop-blur-xl ${urgencyRing} ${accent.glow} transition-all`}>
      <div className={`absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent ${accent.edge} to-transparent`} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-serif text-2xl tracking-tight text-zinc-50">#{order.order_number}</h3>
              {order.table_number && (
                <Pill className="bg-amber-400/15 text-amber-200 border-amber-400/30">
                  Table {order.table_number}
                </Pill>
              )}
              {!order.table_number && (
                <Pill className="bg-white/5 text-zinc-300 border-white/10">
                  <TypeIcon className="h-3 w-3" />
                  {TYPE_LABEL[order.type] || order.type}
                </Pill>
              )}
              {providerInfo && (
                <Pill className={providerInfo.cls}>{providerInfo.label}</Pill>
              )}
              {order.priority && (
                <Pill className="bg-red-500/15 text-red-300 border-red-500/30 animate-[pulse_2s_ease-in-out_infinite]">
                  <Flame className="h-3 w-3" /> Priority
                </Pill>
              )}
            </div>
            <p className="mt-2 text-xs text-zinc-400">
              <span className="text-zinc-300">{order.customer?.name || 'Guest'}</span>
              <span> · {itemCount} item{itemCount !== 1 ? 's' : ''}</span>
            </p>
          </div>
          <div className="text-right shrink-0 flex flex-col items-end gap-1.5">
            <div className={`flex items-center justify-end gap-1.5 font-mono text-2xl tabular-nums ${timeColor}`}>
              <Clock className="h-4 w-4 opacity-70" />
              {formatElapsed(createdMs)}
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 -mt-0.5">since order</p>
            {isReady && (
              <p className="text-[11px] font-mono text-emerald-300 tabular-nums">
                <span className="opacity-70">waiting</span> {formatElapsed(readyMs)}
              </p>
            )}

            {/* Inline quick actions — only for orders still being cooked.
                One-tap priority toggle + one-tap reject (with confirm modal).
                Eliminates the 3-dot overflow menu for max chef speed. */}
            {!isReady && (
              <div className="flex items-center gap-1.5 mt-1">
                <button
                  type="button"
                  onClick={() => onPriority(order.id, !order.priority)}
                  title={order.priority ? 'Clear priority' : 'Mark as priority'}
                  aria-label={order.priority ? 'Clear priority' : 'Mark as priority'}
                  className={`h-9 w-9 rounded-lg flex items-center justify-center border transition-all active:scale-95 ${
                    order.priority
                      ? 'bg-red-500/20 border-red-500/50 text-red-300 shadow-[0_0_14px_-2px_rgba(239,68,68,0.55)] animate-[pulse_2s_ease-in-out_infinite]'
                      : 'bg-white/[0.04] border-white/10 text-zinc-500 hover:text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/40'
                  }`}
                >
                  <Flame className={`h-4 w-4 ${order.priority ? 'fill-red-500/40' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setRejectConfirmOpen(true)}
                  title="Reject order"
                  aria-label="Reject order"
                  className="h-9 w-9 rounded-lg flex items-center justify-center border bg-white/[0.04] border-white/10 text-zinc-500 hover:text-red-300 hover:bg-red-500/15 hover:border-red-500/40 transition-all active:scale-95"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="space-y-1 mb-3">
          {order.items?.map((i, idx) => (
            <div key={idx} className="flex items-baseline gap-3 text-[15px]">
              <span className="font-mono text-amber-300 w-7 tabular-nums">{i.quantity}×</span>
              <span className="flex-1 text-zinc-100">{i.name}</span>
            </div>
          ))}
        </div>

        {/* Notes / allergens */}
        {(order.notes || itemNotes.length > 0) && (
          <div className="mb-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-amber-300/90 font-semibold mb-0.5">
              <Bell className="h-3 w-3" /> Special Request
            </div>
            {order.notes && (
              <p className="text-sm text-amber-100/95 italic">"{order.notes}"</p>
            )}
            {itemNotes.map((i, idx) => (
              <p key={idx} className="text-xs text-amber-100/80 italic">
                "{i.notes}" <span className="text-amber-100/50 not-italic">— {i.name}</span>
              </p>
            ))}
          </div>
        )}

        {/* Actions — single CTA for cooking orders, passive label for ready */}
        <div className="flex gap-2">
          {!isReady && (
            <Button
              onClick={() => onReady(order.id)}
              className="flex-1 h-12 text-base font-semibold bg-gradient-to-b from-emerald-400 to-emerald-600 hover:from-emerald-300 hover:to-emerald-500 text-zinc-950 shadow-md shadow-emerald-500/25 border-0"
            >
              <CheckCircle2 className="h-4 w-4 mr-2" /> Food Ready
            </Button>
          )}

          {isReady && (
            <>
              <div className="flex-1 h-12 px-4 rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center gap-2 text-sm text-emerald-300 font-semibold">
                <CheckCircle2 className="h-4 w-4" />
                <span>
                  {isDineIn
                    ? `Waiter notified · Table ${order.table_number || '?'}`
                    : isDelivery
                      ? (courierAlreadyRequested ? 'Awaiting courier pickup' : 'Ready for courier')
                      : 'Ready for pickup'}
                </span>
              </div>
              {(isDelivery || (!isDineIn && !isDelivery)) && (
                <OverflowMenu>
                  {(close) => (
                    <>
                      {isDelivery && !courierAlreadyRequested && (
                        <OverflowItem onClick={() => { onDispatch(order); close() }}>
                          <Bike className="h-4 w-4 text-amber-300" /> Dispatch courier
                        </OverflowItem>
                      )}
                      {isDelivery && courierAlreadyRequested && (
                        <OverflowItem onClick={() => { onPickedUp(order.id); close() }}>
                          <Truck className="h-4 w-4 text-amber-300" /> Mark picked up
                        </OverflowItem>
                      )}
                      {!isDineIn && !isDelivery && (
                        <OverflowItem onClick={() => { onServed(order.id); close() }}>
                          <CheckCircle2 className="h-4 w-4 text-emerald-300" /> Hand over
                        </OverflowItem>
                      )}
                    </>
                  )}
                </OverflowMenu>
              )}
            </>
          )}
        </div>
      </div>

      {/* Reject confirmation — compact, premium, locked to KDS dark palette. */}
      <Dialog open={rejectConfirmOpen} onOpenChange={setRejectConfirmOpen}>
        <DialogContent className="dark bg-zinc-950 border border-white/10 text-zinc-100 sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl text-zinc-50">Reject this order?</DialogTitle>
            <DialogDescription className="text-zinc-400">
              Order <span className="font-mono text-zinc-200">#{order.order_number}</span>
              {order.table_number ? <> · Table <span className="text-amber-300">{order.table_number}</span></> : null}
              <span className="block mt-1 text-xs text-zinc-500">This cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              variant="ghost"
              onClick={() => setRejectConfirmOpen(false)}
              className="text-zinc-300 hover:text-zinc-100 hover:bg-white/5 border border-white/10"
            >
              Cancel
            </Button>
            <Button
              onClick={() => { setRejectConfirmOpen(false); onReject(order.id) }}
              className="bg-gradient-to-b from-red-500 to-red-700 hover:from-red-400 hover:to-red-600 text-white border-0 shadow-md shadow-red-500/25"
            >
              <X className="h-4 w-4 mr-1.5" /> Reject Order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ── Column header ───────────────────────────────────────────────────────────
const ColumnHeader = ({ title, count, accent, icon: Icon }) => (
  <div className="flex items-center justify-between mb-4 px-1">
    <div className="flex items-center gap-3">
      <div className={`h-9 w-9 rounded-xl flex items-center justify-center ${accent.bg} ${accent.text} ring-1 ${accent.ring}`}>
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <h2 className="font-serif text-2xl text-zinc-50 tracking-tight leading-none">{title}</h2>
        <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mt-1">{count} order{count !== 1 ? 's' : ''}</p>
      </div>
    </div>
    <span className={`font-mono text-3xl tabular-nums ${accent.text}`}>{String(count).padStart(2, '0')}</span>
  </div>
)

const COL_ACCENTS = {
  incoming: { bg: 'bg-amber-400/15', text: 'text-amber-300', ring: 'ring-amber-400/30' },
  cooking:  { bg: 'bg-sky-400/15',   text: 'text-sky-300',   ring: 'ring-sky-400/30' },
  ready:    { bg: 'bg-emerald-400/15', text: 'text-emerald-300', ring: 'ring-emerald-400/30' },
  completed:{ bg: 'bg-zinc-500/15',  text: 'text-zinc-300',  ring: 'ring-zinc-500/30' },
}

// ── Sidebar nav item ────────────────────────────────────────────────────────
const NavItem = ({ active, icon: Icon, label, badge, onClick }) => (
  <button
    onClick={onClick}
    className={`w-full group flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${active
      ? 'bg-gradient-to-r from-amber-400/20 to-amber-400/5 text-amber-200 ring-1 ring-amber-400/40 shadow-[0_0_24px_-6px_rgba(212,165,74,0.5)]'
      : 'text-zinc-400 hover:text-zinc-100 hover:bg-white/5'}`}
  >
    <Icon className={`h-4 w-4 shrink-0 ${active ? 'text-amber-300' : ''}`} />
    <span className="text-sm font-medium tracking-wide flex-1">{label}</span>
    {badge !== undefined && badge !== null && (
      <span className={`min-w-[22px] text-center font-mono text-[11px] px-1.5 py-0.5 rounded-md tabular-nums ${active ? 'bg-amber-400/25 text-amber-100' : 'bg-white/5 text-zinc-400'}`}>
        {badge}
      </span>
    )}
  </button>
)

// ── Main page ───────────────────────────────────────────────────────────────
function KitchenPage() {
  const [token, setToken] = useState('')
  const [pwd, setPwd] = useState('')
  const [orders, setOrders] = useState([])
  const [completed, setCompleted] = useState([])
  const [analytics, setAnalytics] = useState(null)
  const [now, setNow] = useState(Date.now())
  const [audioOn, setAudioOn] = useState(true)
  const [filter, setFilter] = useState('all')
  const [view, setView] = useState('orders') // orders | incoming | cooking | ready | completed | settings
  const [dispatchOrder, setDispatchOrder] = useState(null)
  const prevIdsRef = useRef(new Set())
  const audioCtxRef = useRef(null)

  useEffect(() => {
    const t = localStorage.getItem('aukstaitija_admin_token') || ''
    if (t) setToken(t)
  }, [])

  // 1-second tick keeps the elapsed timers smooth without re-fetching data.
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  const playChime = (variant = 'incoming') => {
    if (!audioOn) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtxRef.current
      const now = ctx.currentTime
      const tones = variant === 'incoming' ? [880, 660] : [990, 1320]
      tones.forEach((freq, idx) => {
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'sine'; o.frequency.value = freq
        g.gain.value = 0.0001
        const start = now + idx * 0.16
        o.start(start)
        g.gain.exponentialRampToValueAtTime(0.22, start + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, start + 0.32)
        o.stop(start + 0.36)
      })
    } catch (e) {}
  }

  const fetchOrders = async (tk = token) => {
    if (!tk) return
    const res = await fetch('/api/kitchen/orders', { headers: { 'x-admin-token': tk } })
    if (res.status === 401) { setToken(''); localStorage.removeItem('aukstaitija_admin_token'); return }
    const data = await res.json()
    if (!Array.isArray(data)) return
    // Detect new received orders for chime — skip first load.
    const newIds = new Set(data.filter(o => o.status === 'received').map(o => o.id))
    const prev = prevIdsRef.current
    let hasNew = false
    newIds.forEach(id => { if (!prev.has(id)) hasNew = true })
    if (hasNew && prev.size > 0) {
      playChime('incoming')
      toast.success('🔔 New order received')
    }
    prevIdsRef.current = newIds
    setOrders(data)
  }

  const fetchCompleted = async (tk = token) => {
    if (!tk) return
    const res = await fetch('/api/orders?status=delivered', { headers: { 'x-admin-token': tk } })
    if (!res.ok) return
    const data = await res.json()
    if (Array.isArray(data)) {
      // Last 24h, newest first.
      const cutoff = Date.now() - 24 * 60 * 60 * 1000
      const filt = data
        .filter(o => new Date(o.delivered_at || o.updated_at || o.created_at).getTime() >= cutoff)
        .slice(0, 60)
      setCompleted(filt)
    }
  }

  const fetchAnalytics = async (tk = token) => {
    if (!tk) return
    const res = await fetch('/api/admin/analytics', { headers: { 'x-admin-token': tk } })
    if (res.ok) setAnalytics(await res.json())
  }

  // Poll active board fast (4s); poll completed/analytics slower (15s).
  useEffect(() => {
    if (!token) return
    fetchOrders(token); fetchCompleted(token); fetchAnalytics(token)
    const a = setInterval(() => fetchOrders(token), 4000)
    const b = setInterval(() => { fetchCompleted(token); fetchAnalytics(token) }, 15000)
    return () => { clearInterval(a); clearInterval(b) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const updateOrder = async (id, body) => {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify(body)
    })
    if (res.ok) fetchOrders()
  }

  const handleDispatch = (order) => {
    if (order.type === 'delivery') setDispatchOrder(order)
    else updateOrder(order.id, { status: 'delivered' })
  }

  const handleReject = async (id) => {
    // Confirmation is handled by the inline dialog inside each OrderCard now,
    // so we can call this directly without an extra confirm() prompt.
    await updateOrder(id, { status: 'cancelled' })
    toast.success('Order rejected')
  }

  const handlePickedUp = async (id) => {
    const res = await fetch(`/api/orders/${id}/picked-up`, { method: 'POST', headers: { 'x-admin-token': token } })
    if (res.ok) { toast.success('Marked as picked up'); fetchOrders() }
    else toast.error('Failed to mark picked up')
  }

  const handleServed = async (id) => {
    const res = await fetch(`/api/orders/${id}/served`, { method: 'POST', headers: { 'x-admin-token': token } })
    if (res.ok) { toast.success('Marked as served'); fetchOrders(); fetchCompleted() }
    else {
      // Fallback for non-dine-in pickup orders
      await updateOrder(id, { status: 'delivered' })
      toast.success('Handed over')
    }
  }

  const login = async (e) => {
    e.preventDefault()
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) })
    const data = await res.json()
    if (data.token) { setToken(data.token); localStorage.setItem('aukstaitija_admin_token', data.token) }
    else toast.error('Invalid password')
  }

  // Filter by order type
  const visible = useMemo(() => {
    return filter === 'all' ? orders : orders.filter(o => o.type === filter)
  }, [orders, filter])

  const cols = useMemo(() => {
    const sortAsc = (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    return {
      // Auto-accepted: every order in received OR preparing belongs to the live queue.
      // Once chef taps "Food Ready", order transitions to status=ready and is
      // immediately filtered out of the kitchen view — front-of-house takes over.
      incoming: visible.filter(o => o.status === 'received' || o.status === 'preparing').sort(sortAsc),
    }
  }, [visible])

  // Average prep time across active + completed orders that have both timestamps.
  const avgPrepMin = useMemo(() => {
    const samples = [...orders, ...completed].filter(o => o.accepted_at && o.ready_at)
    if (samples.length === 0) return 0
    const totalMs = samples.reduce((s, o) => s + (new Date(o.ready_at).getTime() - new Date(o.accepted_at).getTime()), 0)
    return Math.round(totalMs / samples.length / 60000)
  }, [orders, completed])

  // ── Login screen ──────────────────────────────────────────────────────────
  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-zinc-100" style={{ background: 'radial-gradient(ellipse at top, rgba(212,165,74,0.06), transparent 55%), #0A0A0B' }}>
        <div className="w-full max-w-sm rounded-2xl bg-zinc-950/70 backdrop-blur-xl ring-1 ring-white/10 shadow-[0_0_60px_-15px_rgba(212,165,74,0.4)] p-7">
          <div className="text-center mb-6">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/15 ring-1 ring-amber-400/30 mb-3">
              <ChefHat className="h-7 w-7 text-amber-300" />
            </div>
            <h1 className="font-serif text-3xl text-zinc-50">Kitchen</h1>
            <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500 mt-1">Aukštaitija · KDS</p>
          </div>
          <form onSubmit={login} className="space-y-3">
            <div>
              <Label className="text-zinc-300">Password</Label>
              <Input type="password" value={pwd} onChange={e => setPwd(e.target.value)} className="mt-2 bg-white/5 border-white/10 text-zinc-100 focus-visible:ring-amber-400/40" required />
            </div>
            <Button type="submit" className="w-full h-12 bg-gradient-to-b from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-zinc-950 font-semibold border-0">Sign in</Button>
            <p className="text-xs text-zinc-500 text-center">Demo: <code className="text-amber-300">admin123</code></p>
          </form>
        </div>
      </div>
    )
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  const navBadges = {
    orders: cols.incoming.length,
    completed: completed.length,
  }

  // Single centered column — no Ready board on the chef's screen.
  // Front-of-house owns the order the moment it leaves the kitchen.
  const columns = [{ k: 'incoming', title: 'Incoming Queue', accent: COL_ACCENTS.incoming, icon: Inbox, list: cols.incoming }]

  const showCompleted = view === 'completed'
  const showSettings = view === 'settings'

  return (
    <div
      className="dark min-h-screen text-zinc-100 selection:bg-amber-400/30"
      style={{
        background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(212,165,74,0.08), transparent 60%), #0A0A0B',
      }}
    >
      <div className="flex min-h-screen">
        {/* ── Sidebar ─────────────────────────────────────────────────── */}
        <aside className="hidden lg:flex w-[260px] shrink-0 flex-col border-r border-white/5 bg-black/40 backdrop-blur-xl">
          <div className="px-5 pt-6 pb-4 border-b border-white/5">
            <Link href="/admin" className="flex items-center gap-3 group">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-[0_0_20px_-4px_rgba(212,165,74,0.6)]">
                <ChefHat className="h-5 w-5 text-zinc-950" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-amber-300/80">Aukštaitija</p>
                <p className="font-serif text-xl text-zinc-50 leading-tight">Kitchen</p>
              </div>
            </Link>
          </div>

          <nav className="px-3 py-4 space-y-1 flex-1">
            <p className="px-4 pt-2 pb-1 text-[10px] uppercase tracking-[0.3em] text-zinc-600">Workflow</p>
            <NavItem active={view === 'orders'}    icon={LayoutGrid}   label="Active Orders" badge={navBadges.orders}    onClick={() => setView('orders')} />
            <NavItem active={view === 'completed'} icon={History}      label="Completed"     badge={navBadges.completed} onClick={() => setView('completed')} />
            <p className="px-4 pt-4 pb-1 text-[10px] uppercase tracking-[0.3em] text-zinc-600">System</p>
            <NavItem active={view === 'settings'}  icon={Settings}     label="Settings"      onClick={() => setView('settings')} />
          </nav>

          <div className="px-5 py-4 border-t border-white/5">
            <Link href="/waiter" className="flex items-center gap-2 text-xs text-zinc-400 hover:text-amber-300 transition">
              <Utensils className="h-3.5 w-3.5" /> Open Waiter Display →
            </Link>
          </div>
        </aside>

        {/* ── Right: top bar + content ──────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col">
          {/* Top bar */}
          <header className="sticky top-0 z-40 border-b border-white/5 bg-black/60 backdrop-blur-xl">
            <div className="h-20 px-6 flex items-center gap-4">
              {/* Mobile compact brand */}
              <div className="lg:hidden flex items-center gap-2">
                <Link href="/admin" className="text-zinc-400"><ArrowLeft className="h-4 w-4" /></Link>
                <ChefHat className="h-5 w-5 text-amber-300" />
                <span className="font-serif text-lg text-zinc-50">Kitchen</span>
              </div>

              {/* Live + clock — centered */}
              <div className="hidden md:flex flex-1 items-center justify-center gap-5">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
                  </span>
                  <span className="text-[11px] uppercase tracking-[0.25em] text-emerald-300 font-semibold">Live</span>
                </div>
                <div className="font-mono text-2xl tabular-nums text-zinc-50 tracking-wider">
                  {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
                </div>
              </div>

              {/* Right actions */}
              <div className="flex items-center gap-2 ml-auto">
                <select
                  value={filter}
                  onChange={e => setFilter(e.target.value)}
                  className="h-10 px-3 text-sm bg-white/5 border border-white/10 rounded-lg text-zinc-200 hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-amber-400/40"
                >
                  <option value="all">All types</option>
                  <option value="dine-in">Dine-in</option>
                  <option value="pickup">Pickup</option>
                  <option value="delivery">Delivery</option>
                </select>
                <button
                  onClick={() => setAudioOn(!audioOn)}
                  className="h-10 w-10 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition"
                  title="Toggle alert sound"
                >
                  {audioOn ? <Volume2 className="h-4 w-4 text-amber-300" /> : <BellOff className="h-4 w-4 text-zinc-500" />}
                </button>
                <button
                  onClick={() => { setToken(''); localStorage.removeItem('aukstaitija_admin_token') }}
                  className="h-10 px-4 text-sm rounded-lg bg-white/5 hover:bg-red-500/20 hover:text-red-200 border border-white/10 text-zinc-300 flex items-center gap-2 transition"
                >
                  <LogOut className="h-4 w-4" /> Exit
                </button>
              </div>
            </div>
          </header>

          {/* Main content */}
          <main className="flex-1 px-6 py-6 overflow-x-hidden">
            {/* Settings view */}
            {showSettings && (
              <div className="max-w-2xl mx-auto">
                <h2 className="font-serif text-3xl text-zinc-50 mb-6">Settings</h2>
                <div className="space-y-3">
                  <div className="rounded-2xl bg-zinc-950/70 ring-1 ring-white/10 p-5 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-zinc-100">Audio alerts</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Plays a chime on new orders and ready notifications.</p>
                    </div>
                    <button
                      onClick={() => setAudioOn(!audioOn)}
                      className={`relative h-7 w-12 rounded-full transition ${audioOn ? 'bg-amber-400' : 'bg-zinc-700'}`}
                    >
                      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white transition-all ${audioOn ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                  <div className="rounded-2xl bg-zinc-950/70 ring-1 ring-white/10 p-5 flex items-center justify-between">
                    <div>
                      <p className="font-medium text-zinc-100">Order type filter</p>
                      <p className="text-xs text-zinc-500 mt-0.5">Limit the board to a single channel.</p>
                    </div>
                    <select
                      value={filter}
                      onChange={e => setFilter(e.target.value)}
                      className="h-10 px-3 text-sm bg-white/5 border border-white/10 rounded-lg text-zinc-200"
                    >
                      <option value="all">All types</option>
                      <option value="dine-in">Dine-in</option>
                      <option value="pickup">Pickup</option>
                      <option value="delivery">Delivery</option>
                    </select>
                  </div>
                  <div className="rounded-2xl bg-zinc-950/70 ring-1 ring-white/10 p-5">
                    <p className="font-medium text-zinc-100">Refresh cadence</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Active board polls every 4 seconds. Completed list and analytics every 15 seconds.</p>
                  </div>
                  <div className="rounded-2xl bg-zinc-950/70 ring-1 ring-white/10 p-5">
                    <p className="font-medium text-zinc-100">Urgency thresholds</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Amber glow &gt;5 min · Red pulsing glow &gt;8 min</p>
                  </div>
                </div>
              </div>
            )}

            {/* Completed view */}
            {showCompleted && (
              <div>
                <div className="flex items-baseline justify-between mb-6">
                  <h2 className="font-serif text-3xl text-zinc-50">Completed · last 24h</h2>
                  <p className="text-xs uppercase tracking-[0.25em] text-zinc-500">{completed.length} orders</p>
                </div>
                {completed.length === 0 ? (
                  <div className="text-center py-20 text-zinc-500">
                    <History className="h-10 w-10 mx-auto mb-3 opacity-40" />
                    <p>No completed orders yet today.</p>
                  </div>
                ) : (
                  <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {completed.map(o => {
                      const TypeIcon = TYPE_ICONS[o.type] || ShoppingBag
                      const prepMs = o.accepted_at && o.ready_at ? new Date(o.ready_at).getTime() - new Date(o.accepted_at).getTime() : null
                      return (
                        <div key={o.id} className="rounded-2xl bg-zinc-950/60 ring-1 ring-white/5 p-4 hover:ring-white/10 transition">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <p className="font-serif text-xl text-zinc-100">#{o.order_number}</p>
                              <p className="text-xs text-zinc-500 mt-0.5 flex items-center gap-2">
                                <TypeIcon className="h-3 w-3" />{TYPE_LABEL[o.type] || o.type}
                                {o.table_number && <span className="text-amber-300">· Table {o.table_number}</span>}
                              </p>
                            </div>
                            <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/80">Done</span>
                          </div>
                          <p className="text-xs text-zinc-400 mb-2">{o.customer?.name} · €{o.total?.toFixed(2)}</p>
                          <ul className="text-xs text-zinc-500 mb-3 space-y-0.5">
                            {(o.items || []).slice(0, 3).map((i, idx) => (
                              <li key={idx}>{i.quantity}× {i.name}</li>
                            ))}
                            {(o.items?.length || 0) > 3 && <li className="italic">+{o.items.length - 3} more</li>}
                          </ul>
                          <div className="flex items-center justify-between text-[11px] text-zinc-500 pt-3 border-t border-white/5">
                            <span>{new Date(o.delivered_at || o.updated_at || o.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {prepMs != null && <span className="font-mono">prep {Math.round(prepMs / 60000)}m</span>}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Board view */}
            {!showCompleted && !showSettings && (
              <>
                <div className="max-w-3xl mx-auto">
                  {columns.map(col => (
                    <section key={col.k} className="min-w-0">
                      <ColumnHeader title={col.title} count={col.list.length} accent={col.accent} icon={col.icon} />
                      <div className="space-y-4">
                        {col.list.length === 0 && (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-24 px-6 text-center">
                            <col.icon className="h-9 w-9 mx-auto text-zinc-600 mb-3" />
                            <p className="text-sm text-zinc-500">Queue is clear · awaiting orders</p>
                            <p className="text-[11px] text-zinc-600 mt-1">New orders will appear here instantly.</p>
                          </div>
                        )}
                        {col.list.map(o => (
                          <OrderCard
                            key={o.id} order={o} now={now}
                            onReject={handleReject}
                            onReady={async (id) => {
                              await updateOrder(id, { status: 'ready' })
                              toast.success('Waiter notified', { duration: 2200 })
                            }}
                            onDispatch={handleDispatch}
                            onPickedUp={handlePickedUp}
                            onPriority={(id, p) => updateOrder(id, { priority: p })}
                            onServed={handleServed}
                          />
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </>
            )}
          </main>

          {/* Bottom analytics strip */}
          {!showSettings && (
            <footer className="sticky bottom-0 border-t border-white/5 bg-black/70 backdrop-blur-xl">
              <div className="px-6 py-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat label="Today's orders" value={analytics?.today_orders ?? '—'} icon={Activity} accent="text-amber-300" />
                <Stat label="In queue" value={cols.incoming.length} icon={Inbox} accent="text-amber-300" />
                <Stat label="Completed" value={completed.length} icon={CheckCircle2} accent="text-emerald-300" />
                <Stat label="Avg prep time" value={avgPrepMin > 0 ? `${avgPrepMin}m` : '—'} icon={Clock} accent="text-zinc-200" />
              </div>
            </footer>
          )}
        </div>
      </div>

      {dispatchOrder && (
        <DispatchModal
          order={dispatchOrder}
          token={token}
          onClose={() => setDispatchOrder(null)}
          onDispatched={() => { setDispatchOrder(null); fetchOrders() }}
        />
      )}
    </div>
  )
}

const Stat = ({ label, value, icon: Icon, accent }) => (
  <div className="flex items-center gap-3">
    <div className="h-9 w-9 rounded-lg bg-white/5 ring-1 ring-white/10 flex items-center justify-center">
      <Icon className={`h-4 w-4 ${accent}`} />
    </div>
    <div className="min-w-0">
      <p className="text-[10px] uppercase tracking-[0.25em] text-zinc-500">{label}</p>
      <p className={`font-mono text-xl tabular-nums leading-tight ${accent}`}>{value}</p>
    </div>
  </div>
)

export default KitchenPage
