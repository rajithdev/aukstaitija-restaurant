'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Utensils, Clock, Bell, BellOff, Volume2, LogOut, ArrowLeft,
  Hand, CheckCircle2, PackageCheck, Flame, ChefHat, Sparkles, Plus, Receipt,
} from 'lucide-react'
import { toast } from 'sonner'

// Highlight a notification with a glow ring for the first N seconds after it
// is created — gives a clear visual cue to a waiter glancing at the screen.
const HIGHLIGHT_MS = 10 * 1000

function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function NotificationCard({ notif, now, onServe }) {
  const createdMs = now - new Date(notif.created_at).getTime()

  const isFresh = createdMs < HIGHLIGHT_MS
  const isLate = createdMs > 5 * 60 * 1000
  const isUrgent = createdMs > 8 * 60 * 1000

  // Ring/glow palette for urgency levels
  const ring = isUrgent
    ? 'ring-2 ring-red-500/70 animate-[pulse_1.4s_ease-in-out_infinite] shadow-[0_0_45px_-10px_rgba(239,68,68,0.55)]'
    : isLate
      ? 'ring-1 ring-amber-500/60 shadow-[0_0_34px_-10px_rgba(245,158,11,0.45)]'
      : isFresh
        ? 'ring-2 ring-emerald-300/70 shadow-[0_0_45px_-8px_rgba(16,185,129,0.65)] animate-[pulse_1.6s_ease-in-out_infinite]'
        : 'ring-1 ring-emerald-400/40 shadow-[0_0_34px_-10px_rgba(16,185,129,0.4)]'

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-zinc-950/70 backdrop-blur-xl ${ring} transition-all hover:-translate-y-0.5`}>
      {isFresh && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-300/80 to-transparent" />
      )}

      <div className="p-5">
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-950 px-4 py-1.5 rounded-md font-bold tracking-wide text-lg shadow-lg shadow-amber-500/30">
                {notif.table_name || 'Table ?'}
              </span>
              <span className="text-xs text-zinc-400 font-mono">#{notif.order_number}</span>
              {notif.priority && (
                <span className="text-red-300 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
                  <Flame className="h-3 w-3" /> Priority
                </span>
              )}
              {isFresh && (
                <span className="bg-emerald-400/20 text-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 ring-1 ring-emerald-300/40">
                  <Sparkles className="h-3 w-3" /> New
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-zinc-400">{notif.customer_name || 'Guest'}</p>
          </div>
          <div className="text-right shrink-0">
            <div className={`flex items-center justify-end gap-1.5 font-mono text-2xl tabular-nums ${isUrgent ? 'text-red-400' : isLate ? 'text-amber-300' : 'text-emerald-300'}`}>
              <Clock className="h-5 w-5 opacity-70" /> {formatElapsed(createdMs)}
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-0.5">since ready</p>
          </div>
        </div>

        {/* Items summary */}
        <div className="mb-3 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 font-medium">
          {notif.items_summary || '—'}
        </div>

        {/* Notes / allergy */}
        {notif.notes && (
          <div className="mb-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.06] px-3 py-2 text-xs">
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-amber-300/90 font-semibold mb-1">
              <Bell className="h-3 w-3" /> Special Request
            </div>
            <p className="text-amber-100/95 italic">"{notif.notes}"</p>
          </div>
        )}

        {/* Single Action Button - Served */}
        <Button
          onClick={() => onServe(notif.id)}
          className="w-full h-14 text-base font-semibold bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white shadow-lg shadow-emerald-500/30 border-0"
        >
          <CheckCircle2 className="h-5 w-5 mr-2" /> Served
        </Button>
      </div>
    </div>
  )
}

function WaiterPage() {
  const [token, setToken] = useState('')
  const [pwd, setPwd] = useState('')
  const [notifs, setNotifs] = useState([])
  const [guestRequests, setGuestRequests] = useState([])
  const [bills, setBills] = useState([])
  const [now, setNow] = useState(Date.now())
  const [audioOn, setAudioOn] = useState(true)
  const prevPendingIdsRef = useRef(new Set())
  const audioCtxRef = useRef(null)
  const firstFetchRef = useRef(true)

  useEffect(() => {
    const t = localStorage.getItem('aukstaitija_admin_token') || ''
    if (t) setToken(t)
  }, [])

  // 1-second tick keeps timers smooth without re-fetching the queue.
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  const playChime = () => {
    if (!audioOn) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtxRef.current
      const start = ctx.currentTime
      // Premium 3-tone "fanfare" for ready food — distinctive vs kitchen's chime.
      const tones = [660, 880, 1175]
      tones.forEach((freq, idx) => {
        const o = ctx.createOscillator(); const g = ctx.createGain()
        o.connect(g); g.connect(ctx.destination)
        o.type = 'sine'; o.frequency.value = freq
        g.gain.value = 0.0001
        const t0 = start + idx * 0.13
        o.start(t0)
        g.gain.exponentialRampToValueAtTime(0.22, t0 + 0.01)
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.32)
        o.stop(t0 + 0.36)
      })
    } catch (e) {}
  }

  const fetchNotifs = async (tk = token) => {
    if (!tk) return
    const res = await fetch('/api/waiter/notifications', { headers: { 'x-admin-token': tk } })
    if (res.status === 401) { setToken(''); localStorage.removeItem('aukstaitija_admin_token'); return }
    const data = await res.json()
    if (!Array.isArray(data)) return
    // Detect new pending notifications (chime + toast). Skip on first load so
    // we don't ding for everything already on the pass when staff signs in.
    const pendingIds = new Set(data.filter(n => n.status === 'pending').map(n => n.id))
    if (!firstFetchRef.current) {
      const prev = prevPendingIdsRef.current
      let newOnes = []
      pendingIds.forEach(id => { if (!prev.has(id)) newOnes.push(data.find(n => n.id === id)) })
      if (newOnes.length > 0) {
        playChime()
        const first = newOnes[0]
        toast.success(`🍽️ ${first.table_name || 'Table'} · #${first.order_number} ready`)
      }
    }
    prevPendingIdsRef.current = pendingIds
    firstFetchRef.current = false
    setNotifs(data)
  }

  const fetchGuestRequests = async (tk = token) => {
    if (!tk) return
    const res = await fetch('/api/guest-requests', { headers: { 'x-admin-token': tk } })
    if (res.ok) {
      const data = await res.json()
      setGuestRequests(Array.isArray(data) ? data : [])
    }
  }

  const fetchBills = async (tk = token) => {
    if (!tk) return
    const res = await fetch('/api/waiter/bills', { headers: { 'x-admin-token': tk } })
    if (res.ok) {
      const data = await res.json()
      setBills(Array.isArray(data) ? data : [])
    }
  }

  const resolveRequest = async (id) => {
    const res = await fetch(`/api/guest-requests/${id}`, {
      method: 'PATCH',
      headers: { 'x-admin-token': token },
    })
    if (res.ok) {
      toast.success('Request resolved')
      fetchGuestRequests()
    }
  }

  // Auto-refresh every 3 seconds per spec.
  useEffect(() => {
    if (!token) return
    fetchNotifs(token)
    fetchGuestRequests(token)
    fetchBills(token)
    const i = setInterval(() => {
      fetchNotifs(token)
      fetchGuestRequests(token)
      fetchBills(token)
    }, 3000)
    return () => clearInterval(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const pickUp = async (id) => {
    // Removed - no longer needed in simplified workflow
  }

  const serve = async (id) => {
    const res = await fetch(`/api/waiter/notifications/${id}/served`, {
      method: 'POST', headers: { 'x-admin-token': token },
    })
    if (res.ok) {
      toast.success('✅ Served! Bill opened for table.')
      fetchNotifs()
      fetchBills()
    }
    else toast.error('Failed to mark served')
  }

  const returnToPass = async (id) => {
    // Removed - no longer needed in simplified workflow
  }

  const login = async (e) => {
    e.preventDefault()
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    })
    const data = await res.json()
    if (data.token) {
      setToken(data.token); localStorage.setItem('aukstaitija_admin_token', data.token)
    } else { toast.error('Invalid password') }
  }

  // Only show pending (ready) orders - removed inService filter
  const ready = useMemo(() => notifs.filter(n => n.status === 'pending'), [notifs])
  
  // Separate bill requests from other guest requests
  const billRequests = useMemo(() => guestRequests.filter(r => r.request_type === 'bill'), [guestRequests])
  const otherRequests = useMemo(() => guestRequests.filter(r => r.request_type !== 'bill'), [guestRequests])

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 text-zinc-100"
        style={{ background: 'radial-gradient(ellipse at top, rgba(212,165,74,0.06), transparent 55%), #0A0A0B' }}>
        <div className="w-full max-w-sm rounded-2xl bg-zinc-950/70 backdrop-blur-xl ring-1 ring-white/10 shadow-[0_0_60px_-15px_rgba(212,165,74,0.4)] p-7">
          <div className="text-center mb-6">
            <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-400/15 ring-1 ring-amber-400/30 mb-3">
              <Utensils className="h-7 w-7 text-amber-300" />
            </div>
            <h1 className="font-serif text-3xl text-zinc-50">Waiter</h1>
            <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500 mt-1">Aukštaitija · Service</p>
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

  return (
    <div className="dark min-h-screen text-zinc-100"
      style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(212,165,74,0.08), transparent 60%), #0A0A0B' }}>
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-black/70 backdrop-blur-xl">
        <div className="container mx-auto h-20 px-6 flex items-center gap-4">
          <Link href="/admin" className="text-zinc-400 hover:text-zinc-100 transition"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-[0_0_20px_-4px_rgba(212,165,74,0.6)]">
            <Utensils className="h-5 w-5 text-zinc-950" />
          </div>
          <div className="hidden sm:block">
            <p className="text-[10px] uppercase tracking-[0.3em] text-amber-300/80">Aukštaitija</p>
            <p className="font-serif text-xl text-zinc-50 leading-tight">Waiter Display</p>
          </div>
          <div className="flex-1 flex items-center justify-center gap-4">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400"></span>
              </span>
              <span className="text-[11px] uppercase tracking-[0.25em] text-emerald-300 font-semibold">Live · 3s</span>
            </div>
            <div className="hidden md:block font-mono text-2xl tabular-nums text-zinc-50 tracking-wider">
              {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/waiter/new-order">
              <Button size="sm" className="h-10 bg-gradient-to-b from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-zinc-950 font-semibold border-0 shadow-lg shadow-amber-500/25">
                <Plus className="h-4 w-4 mr-1.5" /> New Order
              </Button>
            </Link>
            <Link href="/kitchen" className="hidden md:block">
              <Button variant="outline" size="sm" className="bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10 hover:text-amber-300">
                <ChefHat className="h-4 w-4 mr-1" /> Kitchen
              </Button>
            </Link>
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

      <div className="container mx-auto px-6 py-6">
        {/* Stats strip - simplified */}
        <div className="rounded-2xl bg-zinc-950/60 ring-1 ring-emerald-400/30 p-6 shadow-[0_0_32px_-12px_rgba(16,185,129,0.5)] mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-xl bg-emerald-400/15 ring-1 ring-emerald-400/30 flex items-center justify-center">
                <Bell className="h-6 w-6 text-emerald-300" />
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500">Ready to serve</p>
                <p className="font-serif text-5xl text-emerald-200 leading-none mt-1">{ready.length}</p>
              </div>
            </div>
            <p className="text-sm text-zinc-400">
              {ready.length === 0 ? 'All caught up!' : ready.length === 1 ? '1 order waiting' : `${ready.length} orders waiting`}
            </p>
          </div>
        </div>

        {/* Bills Section — auto-populated when waiter taps "Served" or when a
            customer taps "Request Bill". Persistent table tab until payment. */}
        {bills.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-5 px-1">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-400/15 ring-1 ring-amber-400/30 flex items-center justify-center">
                  <Receipt className="h-5 w-5 text-amber-300" />
                </div>
                <div>
                  <h2 className="font-serif text-3xl text-zinc-50 tracking-tight leading-none">Bills</h2>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500 mt-1">
                    {bills.filter(b => b.status === 'bill_requested').length > 0
                      ? `${bills.filter(b => b.status === 'bill_requested').length} payment ready`
                      : 'Awaiting payment'}
                  </p>
                </div>
              </div>
              <span className="font-mono text-4xl tabular-nums text-amber-300">
                {String(bills.length).padStart(2, '0')}
              </span>
            </div>

            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {bills.map(bill => {
                const isRequested = bill.status === 'bill_requested'
                const sinceServedMs = bill.last_served_at
                  ? now - new Date(bill.last_served_at).getTime()
                  : (bill.opened_at ? now - new Date(bill.opened_at).getTime() : 0)
                const isStale = sinceServedMs > 12 * 60 * 1000

                const ring = isRequested
                  ? 'ring-2 ring-purple-400/70 shadow-[0_0_42px_-8px_rgba(168,85,247,0.55)] animate-[pulse_1.6s_ease-in-out_infinite]'
                  : isStale
                    ? 'ring-1 ring-amber-500/60 shadow-[0_0_34px_-10px_rgba(245,158,11,0.4)]'
                    : 'ring-1 ring-amber-400/30 shadow-[0_0_28px_-12px_rgba(212,165,74,0.35)]'

                const statusLabel = isRequested ? 'Bill Requested' : 'Awaiting Payment'
                const statusClasses = isRequested
                  ? 'bg-purple-500/15 border-purple-500/40 text-purple-200'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-200'

                return (
                  <Link key={bill.id} href={`/waiter/table/${bill.table_id}`}>
                    <div className={`group relative overflow-hidden rounded-2xl bg-zinc-950/70 backdrop-blur-xl ${ring} transition-all hover:-translate-y-0.5 cursor-pointer`}>
                      {isRequested && (
                        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-300/80 to-transparent" />
                      )}
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3 gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-950 px-4 py-1.5 rounded-md font-bold tracking-wide text-lg shadow-lg shadow-amber-500/30">
                                Table {bill.table_number ?? '?'}
                              </span>
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${statusClasses}`}>
                                {statusLabel}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-zinc-400">
                              {bill.customer_name || 'Guest'}
                              {bill.guests ? ` · ${bill.guests} guests` : ''}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="font-mono text-3xl tabular-nums text-amber-200 leading-none">
                              €{(bill.totals?.total ?? 0).toFixed(2)}
                            </p>
                            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-1">
                              {bill.order_count} order{bill.order_count === 1 ? '' : 's'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-xs text-zinc-400 mb-3">
                          <div className="flex items-center gap-1.5">
                            <Clock className="h-3.5 w-3.5 opacity-70" />
                            <span>
                              {bill.last_served_at
                                ? `Served ${formatElapsed(sinceServedMs)} ago`
                                : `Opened ${formatElapsed(sinceServedMs)} ago`}
                            </span>
                          </div>
                          <span className="uppercase tracking-wider text-[10px]">
                            {bill.payment_method || 'Cash'}
                          </span>
                        </div>

                        <Button className="w-full h-12 text-base font-semibold bg-gradient-to-b from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-zinc-950 border-0 shadow-lg shadow-amber-500/25">
                          <Receipt className="h-4 w-4 mr-2" /> Open Bill
                        </Button>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Bill Requests Section */}
        {billRequests.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-5 px-1">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-purple-400/15 ring-1 ring-purple-400/30 flex items-center justify-center">
                  <Receipt className="h-5 w-5 text-purple-300" />
                </div>
                <div>
                  <h2 className="font-serif text-3xl text-zinc-50 tracking-tight leading-none">Bill Requests</h2>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500 mt-1">Payment ready</p>
                </div>
              </div>
              <span className="font-mono text-4xl tabular-nums text-purple-300">{String(billRequests.length).padStart(2, '0')}</span>
            </div>
            
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {billRequests.map(req => {
                const createdMs = now - new Date(req.created_at).getTime()
                
                return (
                  <div key={req.id} className="relative overflow-hidden rounded-2xl bg-zinc-950/70 backdrop-blur-xl ring-1 ring-purple-400/40 shadow-[0_0_32px_-10px_rgba(168,85,247,0.4)] transition-all hover:-translate-y-0.5">
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-purple-300/80 to-transparent" />
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3 gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="bg-gradient-to-b from-purple-300 to-purple-500 text-zinc-950 px-4 py-1.5 rounded-md font-bold tracking-wide text-lg shadow-lg shadow-purple-500/30">
                              Table {req.table_number || '?'}
                            </span>
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border bg-purple-500/10 border-purple-500/30 text-purple-300">
                              Request Bill
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex items-center justify-end gap-1.5 font-mono text-xl tabular-nums text-purple-300">
                            <Clock className="h-4 w-4 opacity-70" /> {formatElapsed(createdMs)}
                          </div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-0.5">ago</p>
                        </div>
                      </div>

                      <div className="flex gap-2">
                        <Link href={`/waiter/table/${req.table_id}`} className="flex-1">
                          <Button className="w-full h-12 text-base font-semibold bg-gradient-to-b from-purple-500 to-purple-700 hover:from-purple-400 hover:to-purple-600 text-white shadow-lg shadow-purple-500/30 border-0">
                            <Receipt className="h-5 w-5 mr-2" /> View Bill
                          </Button>
                        </Link>
                        <Button
                          onClick={() => resolveRequest(req.id)}
                          variant="outline"
                          className="h-12 px-4 border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                        >
                          <CheckCircle2 className="h-5 w-5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Guest Requests Section */}
        {otherRequests.length > 0 && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-5 px-1">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-400/15 ring-1 ring-amber-400/30 flex items-center justify-center">
                  <Bell className="h-5 w-5 text-amber-300" />
                </div>
                <div>
                  <h2 className="font-serif text-3xl text-zinc-50 tracking-tight leading-none">Guest Requests</h2>
                  <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500 mt-1">Assistance needed</p>
                </div>
              </div>
              <span className="font-mono text-4xl tabular-nums text-amber-300">{String(guestRequests.length).padStart(2, '0')}</span>
            </div>
            
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
              {otherRequests.map(req => {
                const createdMs = now - new Date(req.created_at).getTime()
                const requestTypeLabels = {
                  waiter: 'Request Waiter',
                  water: 'Need Water',
                  bill: 'Request Bill',
                  allergy: 'Allergy Assistance',
                  other: 'Other Help',
                }
                const requestTypeColors = {
                  waiter: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
                  water: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
                  bill: 'bg-purple-500/10 border-purple-500/30 text-purple-300',
                  allergy: 'bg-red-500/10 border-red-500/30 text-red-300',
                  other: 'bg-zinc-500/10 border-zinc-500/30 text-zinc-300',
                }
                
                return (
                  <div key={req.id} className={`relative overflow-hidden rounded-2xl bg-zinc-950/70 backdrop-blur-xl ring-1 ring-amber-400/40 shadow-[0_0_32px_-10px_rgba(212,165,74,0.4)] transition-all hover:-translate-y-0.5`}>
                    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />
                    <div className="p-5">
                      <div className="flex items-start justify-between mb-3 gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-950 px-4 py-1.5 rounded-md font-bold tracking-wide text-lg shadow-lg shadow-amber-500/30">
                              Table {req.table_number || '?'}
                            </span>
                            <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${requestTypeColors[req.request_type] || requestTypeColors.other}`}>
                              {requestTypeLabels[req.request_type] || req.request_type}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="flex items-center justify-end gap-1.5 font-mono text-xl tabular-nums text-amber-300">
                            <Clock className="h-4 w-4 opacity-70" /> {formatElapsed(createdMs)}
                          </div>
                          <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-0.5">ago</p>
                        </div>
                      </div>

                      {req.note && (
                        <div className="mb-3 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100 italic">
                          "{req.note}"
                        </div>
                      )}

                      <Button
                        onClick={() => resolveRequest(req.id)}
                        className="w-full h-12 text-base font-semibold bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white shadow-lg shadow-emerald-500/30 border-0"
                      >
                        <CheckCircle2 className="h-5 w-5 mr-2" /> Mark Resolved
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Single column - Ready to Serve */}
        <div>
          <div className="flex items-center justify-between mb-5 px-1">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-emerald-400/15 ring-1 ring-emerald-400/30 flex items-center justify-center">
                <PackageCheck className="h-5 w-5 text-emerald-300" />
              </div>
              <div>
                <h2 className="font-serif text-3xl text-zinc-50 tracking-tight leading-none">Ready to Serve</h2>
                <p className="text-[11px] uppercase tracking-[0.3em] text-zinc-500 mt-1">One tap to complete</p>
              </div>
            </div>
            <span className="font-mono text-4xl tabular-nums text-emerald-300">{String(ready.length).padStart(2, '0')}</span>
          </div>
          
          <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-4">
            {ready.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-20 px-6 text-center">
                <Bell className="h-10 w-10 mx-auto text-zinc-600 mb-3 opacity-60" />
                <p className="text-lg text-zinc-400 font-medium">Nothing ready right now</p>
                <p className="text-sm text-zinc-600 mt-2">Orders will appear here automatically when the kitchen marks them ready.</p>
              </div>
            )}
            {ready.map(n => (
              <NotificationCard key={n.id} notif={n} now={now} onServe={serve} />
            ))}
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-8">
          Auto-refreshes every 3s · New orders highlighted for 10s · &gt;5min amber, &gt;8min red
        </p>
      </div>
    </div>
  )
}

export default WaiterPage
