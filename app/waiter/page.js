'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Utensils, Clock, Bell, BellOff, Volume2, LogOut, ArrowLeft,
  CheckCircle2, ChefHat, Plus, Receipt, Users, X, MoreHorizontal,
  Lightbulb, CreditCard, Mail, XCircle, Info, Sparkles, Wallet,
} from 'lucide-react'
import { toast } from 'sonner'

// ---------- helpers ----------

const HIGHLIGHT_MS = 10 * 1000

function formatElapsed(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}

function formatMinutesAgo(ms) {
  const m = Math.max(0, Math.floor(ms / 60000))
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m`
}

// Restaurant currency formatter
const eur = (n) => `€${(Number(n) || 0).toFixed(2)}`

// ---------- Ready-to-Serve card ----------
function ReadyCard({ notif, now, onServe }) {
  const createdMs = now - new Date(notif.created_at).getTime()
  const isFresh = createdMs < HIGHLIGHT_MS
  const isLate = createdMs > 5 * 60 * 1000
  const isUrgent = createdMs > 8 * 60 * 1000

  const tone = isUrgent
    ? 'border-red-500/40 shadow-[0_0_24px_-12px_rgba(239,68,68,0.45)]'
    : isLate
      ? 'border-amber-500/35 shadow-[0_0_24px_-12px_rgba(245,158,11,0.4)]'
      : 'border-emerald-400/30 shadow-[0_0_24px_-12px_rgba(16,185,129,0.4)]'

  const timeColor = isUrgent ? 'text-red-400' : isLate ? 'text-amber-300' : 'text-emerald-300'

  return (
    <div className={`relative rounded-2xl bg-zinc-950/70 backdrop-blur-xl border ${tone} transition-all`}>
      {isFresh && (
        <span className="absolute -top-1.5 -right-1.5 inline-flex items-center gap-1 bg-emerald-400/20 text-emerald-200 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase ring-1 ring-emerald-300/40">
          <Sparkles className="h-3 w-3" /> New
        </span>
      )}
      <div className="p-5">
        <div className="flex items-start justify-between mb-3 gap-3">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="bg-amber-300 text-zinc-950 px-3 py-1 rounded-md font-bold text-base tracking-tight">
              Table {notif.table_name?.replace(/^Table\s*/i, '') || '?'}
            </span>
            <span className="text-xs text-zinc-500 font-mono">#{notif.order_number}</span>
          </div>
          <div className="text-right shrink-0">
            <div className={`flex items-center justify-end gap-1.5 font-mono text-xl tabular-nums ${timeColor}`}>
              <Clock className="h-4 w-4 opacity-70" /> {formatElapsed(createdMs)}
            </div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 mt-0.5">since ready</p>
          </div>
        </div>

        <p className="text-sm text-zinc-300 mb-3">{notif.customer_name || 'Guest'}</p>

        <div className="mb-4 px-3 py-2 rounded-lg bg-white/[0.04] border border-white/10 text-sm text-zinc-100 truncate">
          {notif.items_summary || '—'}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={() => onServe(notif.id)}
            className="flex-1 h-12 text-base font-semibold bg-emerald-500 hover:bg-emerald-400 text-zinc-950 border-0 shadow-md shadow-emerald-500/20"
          >
            <CheckCircle2 className="h-5 w-5 mr-2" /> Served
          </Button>
          <button
            className="h-12 w-12 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-zinc-400 flex items-center justify-center transition"
            title="More"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------- Dining & Bills card ----------
function DiningCard({ bill, now, onOpen }) {
  const anchor = bill.last_served_at || bill.opened_at
  const elapsedMs = anchor ? now - new Date(anchor).getTime() : 0
  const minutes = Math.floor(elapsedMs / 60000)
  const isRequested = bill.status === 'bill_requested'

  // Color tiers — bill_requested ALWAYS purple regardless of duration
  let tone, badgeTone, timeColor
  if (isRequested) {
    tone = 'border-purple-400/60 shadow-[0_0_24px_-12px_rgba(168,85,247,0.55)]'
    badgeTone = 'bg-purple-500/15 border border-purple-400/40 text-purple-200'
    timeColor = 'text-purple-300'
  } else if (minutes >= 40) {
    tone = 'border-red-500/35 shadow-[0_0_24px_-12px_rgba(239,68,68,0.35)]'
    badgeTone = 'bg-red-500/10 border border-red-500/30 text-red-300'
    timeColor = 'text-red-400'
  } else if (minutes >= 20) {
    tone = 'border-amber-500/35 shadow-[0_0_24px_-12px_rgba(245,158,11,0.35)]'
    badgeTone = 'bg-amber-500/10 border border-amber-500/30 text-amber-300'
    timeColor = 'text-amber-300'
  } else {
    tone = 'border-white/10'
    badgeTone = 'bg-emerald-500/10 border border-emerald-500/25 text-emerald-300'
    timeColor = 'text-emerald-300'
  }

  return (
    <button
      onClick={() => onOpen(bill)}
      className={`group text-left relative rounded-2xl bg-zinc-950/70 backdrop-blur-xl border ${tone} transition-all hover:-translate-y-0.5 hover:border-amber-400/50 cursor-pointer w-full`}
    >
      <div className="p-4">
        <div className="flex items-start justify-between mb-3 gap-2">
          <span className={`px-3 py-1 rounded-md font-bold text-sm tracking-tight ${isRequested ? 'bg-purple-300 text-zinc-950' : 'bg-amber-300 text-zinc-950'}`}>
            Table {bill.table_number ?? '?'}
          </span>
          <div className="text-right shrink-0">
            <div className={`flex items-center justify-end gap-1 font-mono text-base tabular-nums ${timeColor}`}>
              <Clock className="h-3.5 w-3.5 opacity-70" />
              {minutes > 0 ? `${minutes}m` : '<1m'}
            </div>
            <p className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 mt-0.5">
              {isRequested ? 'bill requested' : 'since served'}
            </p>
          </div>
        </div>

        <p className="text-sm text-zinc-200 font-medium truncate mb-1">
          {bill.customer_name || 'Guest'}
        </p>

        <span className={`inline-block text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md ${badgeTone}`}>
          {isRequested ? 'Bill Requested' : 'Dining'}
        </span>

        <div className="flex items-center justify-between mt-3 pt-3 border-t border-white/5">
          <div className="flex items-center gap-1.5 text-xs text-zinc-400">
            <Users className="h-3.5 w-3.5" />
            <span>{bill.guests || 0} guests</span>
          </div>
          <span className="text-xs font-mono text-zinc-400">{eur(bill.totals?.total ?? 0)}</span>
        </div>
      </div>
    </button>
  )
}

// ---------- Bill drawer ----------
function BillDrawer({ open, token, bill, onClose, onPaid, refresh, now }) {
  const [detail, setDetail] = useState(null) // { table, session, bill_session, orders, totals }
  const [loading, setLoading] = useState(false)
  const [note, setNote] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [paying, setPaying] = useState(false)
  const [paymentMethod, setPaymentMethod] = useState('cash')

  useEffect(() => {
    if (!open || !bill || !token) return
    let cancelled = false
    setLoading(true)
    setDetail(null)
    setNote(bill.note || '')
    setPaymentMethod(bill.payment_method || 'cash')
    fetch(`/api/tables/${bill.table_id}/bill`, { headers: { 'x-admin-token': token } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setDetail(d) })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [open, bill, token])

  if (!open || !bill) return null

  const totals = detail?.totals || bill.totals || { subtotal: 0, vat: 0, total: 0 }
  const orders = detail?.orders || []
  const tableNumber = detail?.table?.number ?? bill.table_number ?? '?'
  const orderNumbers = orders.map(o => o.order_number).filter(Boolean)
  const headerOrderLine = orderNumbers.length === 1
    ? `#${orderNumbers[0]} · Dine In`
    : orderNumbers.length > 1
      ? `${orderNumbers.length} orders · Dine In`
      : 'Dine In'

  const anchor = bill.last_served_at || bill.opened_at
  const elapsedMs = anchor ? now - new Date(anchor).getTime() : 0
  const isRequested = bill.status === 'bill_requested'

  const setMethod = async (method) => {
    setPaymentMethod(method)
    try {
      await fetch(`/api/waiter/bills/${bill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ payment_method: method }),
      })
      refresh?.()
    } catch {}
  }

  const saveNote = async () => {
    setSavingNote(true)
    try {
      const res = await fetch(`/api/waiter/bills/${bill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ note }),
      })
      if (res.ok) toast.success('Note saved')
      refresh?.()
    } catch {
      toast.error('Failed to save note')
    } finally {
      setSavingNote(false)
    }
  }

  const cancelRequest = async () => {
    try {
      const res = await fetch(`/api/waiter/bills/${bill.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
        body: JSON.stringify({ cancel_request: true }),
      })
      if (res.ok) { toast.success('Bill request cancelled'); refresh?.(); onClose() }
      else toast.error('Failed to cancel request')
    } catch {
      toast.error('Failed to cancel request')
    }
  }

  const requestBillInApp = async () => {
    try {
      const res = await fetch('/api/guest-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: bill.table_id, request_type: 'bill', note: 'Manually opened by waiter' }),
      })
      if (res.ok) { toast.success('Bill marked as requested'); refresh?.() }
    } catch {
      toast.error('Failed')
    }
  }

  const completePayment = async () => {
    if (!confirm(`Confirm payment of ${eur(totals.total)} (${paymentMethod})?`)) return
    setPaying(true)
    try {
      // Persist method first so the closed-out snapshot captures it
      if (paymentMethod) {
        await fetch(`/api/waiter/bills/${bill.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
          body: JSON.stringify({ payment_method: paymentMethod, note }),
        })
      }
      const res = await fetch(`/api/tables/${bill.table_id}/complete-payment`, {
        method: 'POST', headers: { 'x-admin-token': token },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(`Paid ${eur(data.paid_total ?? totals.total)} · ${paymentMethod}. Table available.`)
        onPaid?.()
      } else {
        toast.error(data.error || 'Payment failed')
      }
    } catch {
      toast.error('Payment failed')
    } finally {
      setPaying(false)
    }
  }

  return (
    <>
      {/* Backdrop */}
      <button
        onClick={onClose}
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150"
        aria-label="Close bill"
      />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[460px] max-w-full bg-zinc-950 border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 text-zinc-100">
        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-serif text-2xl text-zinc-50">Table {tableNumber}</h2>
              {isRequested && (
                <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-400/40 text-purple-200">
                  Bill Requested
                </span>
              )}
            </div>
            <p className="text-sm text-zinc-400 mt-1">
              {bill.customer_name || 'Guest'} {bill.guests ? `· ${bill.guests} guests` : ''}
            </p>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <div className="text-right">
              <p className={`font-mono text-2xl tabular-nums ${isRequested ? 'text-purple-300' : 'text-amber-300'}`}>
                {Math.max(0, Math.floor(elapsedMs / 60000))}m
              </p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                {isRequested ? 'since request' : 'since served'}
              </p>
            </div>
            <button onClick={onClose} className="h-9 w-9 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-300 transition">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Order Summary */}
          <section className="rounded-xl bg-white/[0.02] border border-white/10 p-4">
            <div className="mb-3">
              <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Order Summary</p>
              <p className="text-sm text-zinc-300 mt-0.5 font-mono">{headerOrderLine}</p>
            </div>

            {loading ? (
              <p className="text-sm text-zinc-500">Loading bill…</p>
            ) : orders.length === 0 ? (
              <p className="text-sm text-zinc-500">No unpaid items.</p>
            ) : (
              <div className="space-y-2">
                {orders.flatMap(o => (o.items || []).map((it, idx) => (
                  <div key={`${o.id}-${idx}`} className="flex justify-between items-start gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-zinc-200 truncate">
                        <span className="text-zinc-400">{it.quantity}×</span> {it.name}
                      </p>
                      {it.notes && (
                        <p className="text-[11px] text-amber-400/80 mt-0.5 italic truncate">"{it.notes}"</p>
                      )}
                    </div>
                    <span className="text-zinc-300 font-mono tabular-nums shrink-0">
                      {eur((parseFloat(it.price) || 0) * (parseInt(it.quantity) || 0))}
                    </span>
                  </div>
                )))}
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-white/10 space-y-1.5 text-sm">
              <div className="flex justify-between text-zinc-400">
                <span>Subtotal</span>
                <span className="font-mono tabular-nums text-zinc-300">{eur(totals.subtotal)}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>VAT (21%)</span>
                <span className="font-mono tabular-nums text-zinc-300">{eur(totals.vat)}</span>
              </div>
              {totals.tips > 0 && (
                <div className="flex justify-between text-zinc-400">
                  <span>Tips</span>
                  <span className="font-mono tabular-nums text-emerald-300">{eur(totals.tips)}</span>
                </div>
              )}
              <div className="flex justify-between pt-2 mt-2 border-t border-white/10 text-base">
                <span className="text-zinc-200 font-medium">Total</span>
                <span className="font-mono tabular-nums text-amber-300 font-bold">{eur(totals.total)}</span>
              </div>
            </div>
          </section>

          {/* Payment method */}
          <section>
            <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Payment method</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setMethod('cash')}
                className={`h-11 rounded-md border text-sm font-medium transition flex items-center justify-center gap-2 ${
                  paymentMethod === 'cash'
                    ? 'bg-amber-300/15 border-amber-300/60 text-amber-200'
                    : 'bg-white/[0.04] border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'
                }`}
              >
                <Wallet className="h-4 w-4" /> Cash
              </button>
              <button
                onClick={() => setMethod('card')}
                className={`h-11 rounded-md border text-sm font-medium transition flex items-center justify-center gap-2 ${
                  paymentMethod === 'card'
                    ? 'bg-amber-300/15 border-amber-300/60 text-amber-200'
                    : 'bg-white/[0.04] border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'
                }`}
              >
                <CreditCard className="h-4 w-4" /> Card
              </button>
            </div>
          </section>

          {/* Primary action */}
          <Button
            onClick={completePayment}
            disabled={paying || orders.length === 0}
            className="w-full h-12 text-base font-semibold bg-purple-500 hover:bg-purple-400 text-white border-0 shadow-md shadow-purple-500/20"
          >
            <CheckCircle2 className="h-5 w-5 mr-2" /> {paying ? 'Processing…' : 'Payment Completed'}
          </Button>

          {/* Secondary actions */}
          <div className="grid gap-2">
            {!isRequested && (
              <Button
                variant="outline"
                onClick={requestBillInApp}
                className="h-11 bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-100"
              >
                <Mail className="h-4 w-4 mr-2" /> Mark as Bill Requested
              </Button>
            )}
            {isRequested && (
              <Button
                variant="outline"
                onClick={cancelRequest}
                className="h-11 bg-white/[0.02] border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"
              >
                <XCircle className="h-4 w-4 mr-2" /> Cancel Bill Request
              </Button>
            )}
          </div>

          {/* Quick note */}
          <section>
            <Label className="text-[11px] uppercase tracking-[0.25em] text-zinc-500 mb-2 block">Quick note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add note about this table…"
              rows={3}
              className="bg-white/[0.02] border-white/10 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-amber-400/40"
            />
            <Button
              variant="outline"
              onClick={saveNote}
              disabled={savingNote}
              className="mt-2 w-full h-10 bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-100"
            >
              {savingNote ? 'Saving…' : 'Save Note'}
            </Button>
          </section>
        </div>
      </aside>
    </>
  )
}

// ---------- main page ----------
export default function WaiterPage() {
  const [token, setToken] = useState('')
  const [pwd, setPwd] = useState('')
  const [notifs, setNotifs] = useState([])
  const [guestRequests, setGuestRequests] = useState([])
  const [bills, setBills] = useState([])
  const [now, setNow] = useState(Date.now())
  const [audioOn, setAudioOn] = useState(true)
  const [openBill, setOpenBill] = useState(null)

  const prevPendingIdsRef = useRef(new Set())
  const audioCtxRef = useRef(null)
  const firstFetchRef = useRef(true)

  useEffect(() => {
    const t = localStorage.getItem('aukstaitija_admin_token') || ''
    if (t) setToken(t)
  }, [])

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
    } catch {}
  }

  const fetchNotifs = async (tk = token) => {
    if (!tk) return
    const res = await fetch('/api/waiter/notifications', { headers: { 'x-admin-token': tk } })
    if (res.status === 401) { setToken(''); localStorage.removeItem('aukstaitija_admin_token'); return }
    const data = await res.json()
    if (!Array.isArray(data)) return
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
      // Keep the open drawer in sync with fresh totals
      setOpenBill(prev => {
        if (!prev) return prev
        const fresh = data.find(b => b.id === prev.id)
        return fresh || null
      })
    }
  }

  const refreshAll = () => {
    fetchNotifs(); fetchGuestRequests(); fetchBills()
  }

  useEffect(() => {
    if (!token) return
    refreshAll()
    const i = setInterval(refreshAll, 3000)
    return () => clearInterval(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const resolveRequest = async (id) => {
    const res = await fetch(`/api/guest-requests/${id}`, { method: 'PATCH', headers: { 'x-admin-token': token } })
    if (res.ok) { toast.success('Request resolved'); fetchGuestRequests() }
  }

  const serve = async (id) => {
    const res = await fetch(`/api/waiter/notifications/${id}/served`, {
      method: 'POST', headers: { 'x-admin-token': token },
    })
    if (res.ok) {
      toast.success('✅ Moved to Dining & Bills')
      fetchNotifs(); fetchBills()
    } else toast.error('Failed to mark served')
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

  const ready = useMemo(() => notifs.filter(n => n.status === 'pending'), [notifs])

  // Sort Dining & Bills: bill_requested → longest dining → recently served
  const dining = useMemo(() => {
    const arr = [...bills]
    arr.sort((a, b) => {
      const aReq = a.status === 'bill_requested' ? 0 : 1
      const bReq = b.status === 'bill_requested' ? 0 : 1
      if (aReq !== bReq) return aReq - bReq
      const aAnchor = a.last_served_at || a.opened_at
      const bAnchor = b.last_served_at || b.opened_at
      // Older first (longest dining)
      return new Date(aAnchor || 0).getTime() - new Date(bAnchor || 0).getTime()
    })
    return arr
  }, [bills])

  const otherRequests = useMemo(() => guestRequests.filter(r => r.request_type !== 'bill'), [guestRequests])

  // ---------- login ----------
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
            <Button type="submit" className="w-full h-12 bg-amber-300 hover:bg-amber-200 text-zinc-950 font-semibold border-0">Sign in</Button>
            <p className="text-xs text-zinc-500 text-center">Demo: <code className="text-amber-300">admin123</code></p>
          </form>
        </div>
      </div>
    )
  }

  // ---------- main layout ----------
  return (
    <div className="dark min-h-screen text-zinc-100"
      style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(212,165,74,0.06), transparent 60%), #0A0A0B' }}>
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-black/70 backdrop-blur-xl">
        <div className="container mx-auto h-16 px-4 sm:px-6 flex items-center gap-3 sm:gap-4">
          <Link href="/admin" className="text-zinc-400 hover:text-zinc-100 transition shrink-0"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="h-9 w-9 rounded-lg bg-amber-400/15 ring-1 ring-amber-400/30 flex items-center justify-center shrink-0">
            <Utensils className="h-4 w-4 text-amber-300" />
          </div>
          <div className="hidden sm:block min-w-0">
            <p className="text-[10px] uppercase tracking-[0.3em] text-amber-300/80 leading-tight">Aukštaitija</p>
            <p className="font-serif text-lg text-zinc-50 leading-tight">Waiter Display</p>
          </div>
          <div className="flex-1 flex items-center justify-center gap-3">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-300 font-semibold">Live · 3s</span>
            </div>
            <div className="hidden md:block font-mono text-lg tabular-nums text-zinc-300 tracking-wider">
              {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Link href="/waiter/new-order">
              <Button size="sm" className="h-9 bg-amber-300 hover:bg-amber-200 text-zinc-950 font-semibold border-0">
                <Plus className="h-4 w-4 mr-1" /> New Order
              </Button>
            </Link>
            <Link href="/kitchen" className="hidden md:block">
              <Button variant="outline" size="sm" className="h-9 bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10">
                <ChefHat className="h-4 w-4 mr-1" /> Kitchen
              </Button>
            </Link>
            <button
              onClick={() => setAudioOn(!audioOn)}
              className="h-9 w-9 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition"
              title="Toggle alert sound"
            >
              {audioOn ? <Volume2 className="h-4 w-4 text-amber-300" /> : <BellOff className="h-4 w-4 text-zinc-500" />}
            </button>
            <button
              onClick={() => { setToken(''); localStorage.removeItem('aukstaitija_admin_token') }}
              className="h-9 px-3 text-sm rounded-md bg-white/5 hover:bg-red-500/20 hover:text-red-200 border border-white/10 text-zinc-300 flex items-center gap-1.5 transition"
            >
              <LogOut className="h-4 w-4" /> Exit
            </button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 sm:px-6 py-6 max-w-6xl">
        {/* Top stats card */}
        <div className="rounded-2xl bg-zinc-950/60 border border-emerald-500/20 p-5 mb-6 flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Bell className="h-5 w-5 text-emerald-300" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] uppercase tracking-[0.3em] text-zinc-500">Ready to serve</p>
            <p className="font-serif text-4xl text-emerald-200 leading-none mt-1">{ready.length}</p>
          </div>
          <p className="text-sm text-zinc-400 hidden sm:block">
            {ready.length === 0 ? 'All caught up' : ready.length === 1 ? '1 order waiting' : `${ready.length} orders waiting`}
          </p>
        </div>

        {/* 1. Ready to Serve */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center">
                <Bell className="h-4 w-4 text-emerald-300" />
              </div>
              <div>
                <h2 className="font-serif text-2xl text-zinc-50 leading-tight">1. Ready to Serve</h2>
                <p className="text-[11px] text-zinc-500">Food is ready — take to the table</p>
              </div>
            </div>
            <span className="font-mono text-2xl tabular-nums text-emerald-300">
              {String(ready.length).padStart(2, '0')}
            </span>
          </div>

          {ready.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-12 text-center">
              <Bell className="h-8 w-8 mx-auto text-zinc-600 mb-2 opacity-60" />
              <p className="text-zinc-400">Nothing ready right now</p>
              <p className="text-xs text-zinc-600 mt-1">Orders will appear here when the kitchen marks them ready.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {ready.map(n => <ReadyCard key={n.id} notif={n} now={now} onServe={serve} />)}
            </div>
          )}
        </section>

        {/* 2. Dining & Bills */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
                <Users className="h-4 w-4 text-amber-300" />
              </div>
              <div>
                <h2 className="font-serif text-2xl text-zinc-50 leading-tight">2. Dining &amp; Bills</h2>
                <p className="text-[11px] text-zinc-500">Tables eating or requesting payment</p>
              </div>
            </div>
            <span className="font-mono text-2xl tabular-nums text-amber-300">
              {String(dining.length).padStart(2, '0')}
            </span>
          </div>

          {dining.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] py-12 text-center">
              <Receipt className="h-8 w-8 mx-auto text-zinc-600 mb-2 opacity-60" />
              <p className="text-zinc-400">No tables dining right now</p>
              <p className="text-xs text-zinc-600 mt-1">Tap "Served" on a ready order to open its bill here.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {dining.map(b => <DiningCard key={b.id} bill={b} now={now} onOpen={setOpenBill} />)}
            </div>
          )}

          {/* Legend + tip */}
          {dining.length > 0 && (
            <div className="mt-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-xs text-zinc-500">
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400"></span><span>0–20 min · all good</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400"></span><span>20–40 min · check when possible</span></div>
                <div className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-red-400"></span><span>40+ min · check soon</span></div>
              </div>
              <div className="flex items-center gap-1.5">
                <Info className="h-3.5 w-3.5" />
                <span><span className="text-zinc-400">Tip:</span> bill requests appear first, then longest dining.</span>
              </div>
            </div>
          )}
        </section>

        {/* Other guest requests (non-bill) */}
        {otherRequests.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-amber-400/15 border border-amber-400/30 flex items-center justify-center">
                  <Bell className="h-4 w-4 text-amber-300" />
                </div>
                <div>
                  <h2 className="font-serif text-2xl text-zinc-50 leading-tight">Guest Requests</h2>
                  <p className="text-[11px] text-zinc-500">Assistance needed</p>
                </div>
              </div>
              <span className="font-mono text-2xl tabular-nums text-amber-300">{String(otherRequests.length).padStart(2, '0')}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {otherRequests.map(req => {
                const createdMs = now - new Date(req.created_at).getTime()
                const labels = { waiter: 'Request Waiter', water: 'Need Water', allergy: 'Allergy Assistance', other: 'Other Help' }
                const colors = {
                  waiter: 'bg-amber-500/10 border-amber-500/30 text-amber-300',
                  water: 'bg-blue-500/10 border-blue-500/30 text-blue-300',
                  allergy: 'bg-red-500/10 border-red-500/30 text-red-300',
                  other: 'bg-zinc-500/10 border-zinc-500/30 text-zinc-300',
                }
                return (
                  <div key={req.id} className="rounded-xl bg-white/[0.02] border border-white/10 p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="bg-amber-300 text-zinc-950 px-2.5 py-0.5 rounded-md text-sm font-bold">
                          Table {req.table_number || '?'}
                        </span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border ${colors[req.request_type] || colors.other}`}>
                          {labels[req.request_type] || req.request_type}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 text-xs text-zinc-400 font-mono">
                        <Clock className="h-3 w-3" /> {formatElapsed(createdMs)}
                      </div>
                    </div>
                    {req.note && (
                      <p className="text-xs text-zinc-400 italic mb-3 px-2 py-1.5 rounded-md bg-white/[0.03] border border-white/10">"{req.note}"</p>
                    )}
                    <Button onClick={() => resolveRequest(req.id)} className="w-full h-10 bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-medium border-0">
                      <CheckCircle2 className="h-4 w-4 mr-2" /> Resolve
                    </Button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* How it works footer */}
        <div className="mt-8 rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:p-5">
          <div className="flex items-start gap-3">
            <div className="h-8 w-8 rounded-md bg-amber-400/10 border border-amber-400/30 flex items-center justify-center shrink-0">
              <Lightbulb className="h-4 w-4 text-amber-300" />
            </div>
            <div className="text-sm text-zinc-400">
              <p className="text-zinc-200 font-medium mb-0.5">How it works</p>
              <p>When you click <span className="text-zinc-200 font-semibold">Served</span>, the order moves to <span className="text-zinc-200 font-semibold">Dining &amp; Bills</span>. When a bill is requested (or called manually), it's highlighted at the top.</p>
            </div>
          </div>
        </div>
      </main>

      <BillDrawer
        open={!!openBill}
        token={token}
        bill={openBill}
        now={now}
        refresh={fetchBills}
        onClose={() => setOpenBill(null)}
        onPaid={() => { setOpenBill(null); refreshAll() }}
      />
    </div>
  )
}
