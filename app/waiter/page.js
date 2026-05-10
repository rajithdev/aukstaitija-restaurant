'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Utensils, Clock, Bell, BellOff, Volume2, LogOut, ArrowLeft,
  Hand, CheckCircle2, PackageCheck, Flame, ChefHat, Sparkles,
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

function NotificationCard({ notif, now, onPickUp, onServe, onReturn }) {
  const createdMs = now - new Date(notif.created_at).getTime()
  const inService = notif.status === 'picked_up'
  const pickedMs = notif.picked_up_at ? now - new Date(notif.picked_up_at).getTime() : 0

  const isFresh = !inService && createdMs < HIGHLIGHT_MS
  const isLate = !inService && createdMs > 5 * 60 * 1000
  const isUrgent = !inService && createdMs > 8 * 60 * 1000

  // Per-state ring/glow palette — fresh = amber pulse, in-service = sky, late
  // states override with amber/red as they grow more urgent.
  const ring = inService
    ? 'ring-1 ring-sky-400/40 shadow-[0_0_38px_-10px_rgba(56,189,248,0.45)]'
    : isUrgent
      ? 'ring-2 ring-red-500/70 animate-[pulse_1.4s_ease-in-out_infinite] shadow-[0_0_45px_-10px_rgba(239,68,68,0.55)]'
      : isLate
        ? 'ring-1 ring-amber-500/60 shadow-[0_0_34px_-10px_rgba(245,158,11,0.45)]'
        : isFresh
          ? 'ring-2 ring-amber-300/70 shadow-[0_0_45px_-8px_rgba(212,165,74,0.65)] animate-[pulse_1.6s_ease-in-out_infinite]'
          : 'ring-1 ring-emerald-400/40 shadow-[0_0_34px_-10px_rgba(16,185,129,0.4)]'

  return (
    <div className={`relative overflow-hidden rounded-2xl bg-zinc-950/70 backdrop-blur-xl ${ring} transition-all hover:-translate-y-0.5`}>
      {isFresh && (
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />
      )}

      <div className="p-5">
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="bg-gradient-to-b from-amber-300 to-amber-500 text-zinc-950 px-3 py-1 rounded-md font-bold tracking-wide text-sm shadow-lg shadow-amber-500/30">
                {notif.table_name || 'Table ?'}
              </span>
              <span className="text-xs text-zinc-400 font-mono">#{notif.order_number}</span>
              {notif.priority && (
                <span className="text-red-300 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider">
                  <Flame className="h-3 w-3" /> Priority
                </span>
              )}
              {isFresh && (
                <span className="bg-amber-400/20 text-amber-200 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 ring-1 ring-amber-300/40">
                  <Sparkles className="h-3 w-3" /> New
                </span>
              )}
              {inService && (
                <span className="bg-sky-500/15 text-sky-200 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase flex items-center gap-1 ring-1 ring-sky-400/30">
                  <Hand className="h-3 w-3" /> In service
                </span>
              )}
            </div>
            <p className="mt-2 text-xs text-zinc-400">{notif.customer_name || 'Guest'}</p>
          </div>
          <div className="text-right shrink-0">
            {!inService ? (
              <>
                <div className={`flex items-center justify-end gap-1.5 font-mono text-2xl tabular-nums ${isUrgent ? 'text-red-400' : isLate ? 'text-amber-300' : 'text-zinc-100'}`}>
                  <Clock className="h-4 w-4 opacity-70" /> {formatElapsed(createdMs)}
                </div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-0.5">since ready</p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-end gap-1.5 font-mono text-2xl tabular-nums text-sky-300">
                  <Hand className="h-4 w-4 opacity-70" /> {formatElapsed(pickedMs)}
                </div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-0.5">in your hand</p>
              </>
            )}
          </div>
        </div>

        {/* Items summary */}
        <div className="mb-3 px-3 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-sm text-zinc-100">
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

        {/* Actions */}
        <div className="flex gap-2 mt-3">
          {!inService ? (
            <Button onClick={() => onPickUp(notif.id)} className="flex-1 h-12 text-[15px] font-semibold bg-gradient-to-b from-sky-500 to-sky-700 hover:from-sky-400 hover:to-sky-600 text-white shadow-lg shadow-sky-500/30 border-0">
              <Hand className="h-4 w-4 mr-2" /> Pick Up
            </Button>
          ) : (
            <Button onClick={() => onReturn(notif.id)} variant="outline" className="h-12 px-4 bg-white/5 hover:bg-white/10 border-white/10 text-zinc-300" title="Put back on pass">
              ← Back
            </Button>
          )}
          <Button
            onClick={() => onServe(notif.id)}
            className={`flex-1 h-12 text-[15px] font-semibold border-0 ${inService
              ? 'bg-gradient-to-b from-emerald-500 to-emerald-700 hover:from-emerald-400 hover:to-emerald-600 text-white shadow-lg shadow-emerald-500/30'
              : 'bg-gradient-to-b from-amber-300 to-amber-500 hover:from-amber-200 hover:to-amber-400 text-zinc-950 shadow-lg shadow-amber-500/30'}`}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" /> Mark Served
          </Button>
        </div>
      </div>
    </div>
  )
}

function WaiterPage() {
  const [token, setToken] = useState('')
  const [pwd, setPwd] = useState('')
  const [notifs, setNotifs] = useState([])
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

  // Auto-refresh every 3 seconds per spec.
  useEffect(() => {
    if (!token) return
    fetchNotifs(token)
    const i = setInterval(() => fetchNotifs(token), 3000)
    return () => clearInterval(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const pickUp = async (id) => {
    const res = await fetch(`/api/waiter/notifications/${id}/pickup`, {
      method: 'POST', headers: { 'x-admin-token': token },
    })
    if (res.ok) { toast.success('Picked up'); fetchNotifs() }
    else toast.error('Failed to pick up')
  }

  const serve = async (id) => {
    const res = await fetch(`/api/waiter/notifications/${id}/served`, {
      method: 'POST', headers: { 'x-admin-token': token },
    })
    if (res.ok) { toast.success('Served — enjoy!'); fetchNotifs() }
    else toast.error('Failed to mark served')
  }

  // "Back" — manually return a plate to the pass. Calls pickup endpoint with a
  // small client-side optimistic revert; server side, we just hit the same
  // /pickup PATH but with a query flag. Simpler approach: do nothing on the
  // server, just refetch — but we want the order's serve_status reset. For
  // now, we surface a toast and ask kitchen to redo — keep the UX honest.
  const returnToPass = async (id) => {
    toast.info('To return a plate, ask kitchen to re-mark it ready.')
    fetchNotifs()
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

  const pending = useMemo(() => notifs.filter(n => n.status === 'pending'), [notifs])
  const inService = useMemo(() => notifs.filter(n => n.status === 'picked_up'), [notifs])

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
        {/* Stats strip */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-2xl bg-zinc-950/60 ring-1 ring-amber-400/30 p-5 shadow-[0_0_28px_-12px_rgba(212,165,74,0.45)]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-amber-400/15 ring-1 ring-amber-400/30 flex items-center justify-center">
                <Bell className="h-5 w-5 text-amber-300" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Pending pickup</p>
                <p className="font-serif text-4xl text-amber-200 leading-none mt-1">{pending.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-2xl bg-zinc-950/60 ring-1 ring-sky-400/30 p-5 shadow-[0_0_28px_-12px_rgba(56,189,248,0.4)]">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-sky-400/15 ring-1 ring-sky-400/30 flex items-center justify-center">
                <Hand className="h-5 w-5 text-sky-300" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">In service</p>
                <p className="font-serif text-4xl text-sky-200 leading-none mt-1">{inService.length}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Two-column board */}
        <div className="grid lg:grid-cols-2 gap-5">
          <div>
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-amber-400/15 ring-1 ring-amber-400/30 flex items-center justify-center">
                  <PackageCheck className="h-4 w-4 text-amber-300" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl text-zinc-50 tracking-tight leading-none">Pending Pickup</h2>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mt-1">{pending.length} waiting</p>
                </div>
              </div>
              <span className="font-mono text-3xl tabular-nums text-amber-300">{String(pending.length).padStart(2, '0')}</span>
            </div>
            <div className="space-y-4">
              {pending.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-16 px-6 text-center">
                  <Bell className="h-7 w-7 mx-auto text-zinc-600 mb-2 opacity-60" />
                  <p className="text-sm text-zinc-500">Nothing on the pass right now</p>
                  <p className="text-xs text-zinc-600 mt-1">Plates will appear here automatically when the kitchen marks them ready.</p>
                </div>
              )}
              {pending.map(n => (
                <NotificationCard key={n.id} notif={n} now={now} onPickUp={pickUp} onServe={serve} onReturn={returnToPass} />
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-4 px-1">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-sky-400/15 ring-1 ring-sky-400/30 flex items-center justify-center">
                  <Hand className="h-4 w-4 text-sky-300" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl text-zinc-50 tracking-tight leading-none">In Service</h2>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 mt-1">{inService.length} carrying</p>
                </div>
              </div>
              <span className="font-mono text-3xl tabular-nums text-sky-300">{String(inService.length).padStart(2, '0')}</span>
            </div>
            <div className="space-y-4">
              {inService.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-16 px-6 text-center">
                  <Hand className="h-7 w-7 mx-auto text-zinc-600 mb-2 opacity-60" />
                  <p className="text-sm text-zinc-500">No plates in hand</p>
                </div>
              )}
              {inService.map(n => (
                <NotificationCard key={n.id} notif={n} now={now} onPickUp={pickUp} onServe={serve} onReturn={returnToPass} />
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-zinc-600 mt-8">
          Auto-refreshes every 3s · New plates highlighted for 10s · &gt;5min amber, &gt;8min red
        </p>
      </div>
    </div>
  )
}

export default WaiterPage
