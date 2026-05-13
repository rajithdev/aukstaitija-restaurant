'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Utensils, Clock, Bell, BellOff, Volume2, LogOut, ArrowLeft,
  CheckCircle2, ChefHat, Plus, Receipt, Users, X, Droplets,
  AlertTriangle, HelpCircle, Wallet, CreditCard, Mail, XCircle,
  Sparkles, LayoutGrid, ListChecks,
} from 'lucide-react'
import { toast } from 'sonner'
import WaiterOrderInterface from '@/components/WaiterOrderInterface'

// ============================================================================
// helpers
// ============================================================================

const HIGHLIGHT_MS = 10 * 1000
const eur = (n) => `€${(Number(n) || 0).toFixed(2)}`

function formatMMSS(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

function formatRelative(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  return `${h}h ${m % 60}m ago`
}

// ============================================================================
// Compact operational primitives
// ============================================================================

// ReadyPill — single food-ready pickup, shown in the persistent top strip.
function ReadyPill({ notif, now, onServe }) {
  const ms = now - new Date(notif.created_at).getTime()
  const isLate = ms > 5 * 60 * 1000
  const isUrgent = ms > 8 * 60 * 1000
  const tone = isUrgent
    ? 'bg-red-500/15 border-red-500/50 hover:bg-red-500/25 text-red-200'
    : isLate
      ? 'bg-amber-500/15 border-amber-500/50 hover:bg-amber-500/25 text-amber-200'
      : 'bg-emerald-500/12 border-emerald-500/45 hover:bg-emerald-500/22 text-emerald-200'
  return (
    <button
      onClick={() => onServe(notif.id)}
      className={`group shrink-0 inline-flex items-center gap-2 pl-2 pr-2.5 py-1.5 rounded-lg border transition ${tone}`}
      title="Mark served"
    >
      <span className="bg-amber-300 text-zinc-950 px-1.5 py-0.5 rounded font-bold text-xs leading-none">
        T{notif.table_name?.replace(/^Table\s*/i, '') || '?'}
      </span>
      <span className="text-[11px] text-zinc-300 truncate max-w-[120px]">{notif.items_summary || '—'}</span>
      <span className="font-mono text-[11px] tabular-nums opacity-80">{formatMMSS(ms)}</span>
      <CheckCircle2 className="h-3.5 w-3.5 opacity-80 group-hover:opacity-100" />
    </button>
  )
}

// TableTile — compact card for the Active Tables tab.
function TableTile({ bill, readyForTable, now, onOpenBill }) {
  const anchor = bill.last_served_at || bill.opened_at
  const elapsedMs = anchor ? now - new Date(anchor).getTime() : 0
  const minutes = Math.floor(elapsedMs / 60000)
  const hasReady = readyForTable && readyForTable.length > 0
  const isBillReq = bill.status === 'bill_requested'

  // Stage resolution — most-urgent first
  let stage, stageColor, dotColor, accent
  if (hasReady) {
    stage = 'Food ready · take to table'
    stageColor = 'text-emerald-300'
    dotColor = 'bg-emerald-400'
    accent = 'border-emerald-500/45 shadow-[0_0_18px_-10px_rgba(16,185,129,0.55)]'
  } else if (isBillReq) {
    stage = 'Bill requested'
    stageColor = 'text-purple-300'
    dotColor = 'bg-purple-400'
    accent = 'border-purple-500/55 shadow-[0_0_18px_-10px_rgba(168,85,247,0.55)]'
  } else if (minutes >= 40) {
    stage = `Dining · ${minutes}m`
    stageColor = 'text-red-300'
    dotColor = 'bg-red-400'
    accent = 'border-red-500/35'
  } else if (minutes >= 20) {
    stage = `Dining · ${minutes}m`
    stageColor = 'text-amber-300'
    dotColor = 'bg-amber-400'
    accent = 'border-amber-500/35'
  } else {
    stage = minutes > 0 ? `Dining · ${minutes}m` : 'Just served'
    stageColor = 'text-zinc-300'
    dotColor = 'bg-zinc-500'
    accent = 'border-white/10'
  }

  return (
    <button
      onClick={() => onOpenBill(bill)}
      className={`group text-left rounded-lg bg-zinc-900/70 hover:bg-zinc-900 border ${accent} hover:border-amber-400/45 transition p-2.5`}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="bg-amber-300 text-zinc-950 px-2 py-0.5 rounded font-bold text-sm leading-none">T{bill.table_number ?? '?'}</span>
        <span className="text-[10px] text-zinc-500 font-mono">{bill.guests || 0}p</span>
      </div>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`h-1.5 w-1.5 rounded-full ${dotColor} ${(hasReady || isBillReq) ? 'animate-pulse' : ''}`} />
        <span className={`text-[11px] ${stageColor} truncate`}>{stage}</span>
      </div>
      <p className="text-[11px] text-zinc-500 truncate">{bill.customer_name || 'Guest'}</p>
      <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-white/5">
        <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{bill.payment_method || 'cash'}</span>
        <span className="text-xs font-mono tabular-nums text-zinc-200">{eur(bill.totals?.total ?? 0)}</span>
      </div>
    </button>
  )
}

// AssistRow — compact list row for the Assistance Requests tab.
const ASSIST_META = {
  waiter: { label: 'Request Waiter',    Icon: Bell,          dot: 'bg-amber-400', text: 'text-amber-300', tone: 'border-amber-500/30 hover:border-amber-500/50' },
  water:  { label: 'Need Water',        Icon: Droplets,      dot: 'bg-sky-400',   text: 'text-sky-300',   tone: 'border-sky-500/30 hover:border-sky-500/50' },
  allergy:{ label: 'Allergy Assistance',Icon: AlertTriangle, dot: 'bg-rose-400',  text: 'text-rose-300',  tone: 'border-rose-500/45 hover:border-rose-500/65 bg-rose-500/[0.04]' },
  other:  { label: 'Other Help',        Icon: HelpCircle,    dot: 'bg-zinc-400',  text: 'text-zinc-300',  tone: 'border-white/10 hover:border-white/25' },
}

function AssistRow({ req, now, onResolve, onTakeOrder, busy }) {
  const meta = ASSIST_META[req.request_type] || ASSIST_META.other
  const Icon = meta.Icon
  const ms = now - new Date(req.created_at).getTime()
  const urgent = req.request_type === 'allergy'
  return (
    <div className={`flex items-center gap-2.5 px-3 py-2 rounded-lg bg-zinc-900/60 border ${meta.tone} transition`}>
      <span className={`h-2 w-2 rounded-full ${meta.dot} ${urgent ? 'animate-pulse' : ''} shrink-0`} />
      <span className="bg-amber-300 text-zinc-950 px-1.5 py-0.5 rounded font-bold text-xs leading-none shrink-0 w-9 text-center">
        T{req.table_number ?? '?'}
      </span>
      <Icon className={`h-3.5 w-3.5 ${meta.text} shrink-0`} />
      <span className="text-[13px] text-zinc-200 truncate flex-1 min-w-0">
        <span className={`${meta.text} font-medium`}>{meta.label}</span>
        {req.note && <span className="text-zinc-500 italic"> · "{req.note}"</span>}
      </span>
      <span className="text-[11px] text-zinc-500 font-mono whitespace-nowrap shrink-0 hidden sm:inline">{formatRelative(ms)}</span>
      {req.request_type === 'waiter' && (
        <Button
          onClick={() => onTakeOrder(req)}
          disabled={busy}
          size="sm"
          className="h-7 px-2.5 bg-amber-300/15 hover:bg-amber-300/25 text-amber-200 border border-amber-400/35 font-medium shrink-0 disabled:opacity-50"
        >
          <ChefHat className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Take Order</span>
        </Button>
      )}
      <Button
        onClick={() => onResolve(req.id)}
        disabled={busy}
        size="sm"
        className="h-7 px-2.5 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border border-emerald-500/35 font-medium shrink-0 disabled:opacity-50"
      >
        <CheckCircle2 className="h-3.5 w-3.5 sm:mr-1" /> <span className="hidden sm:inline">Resolve</span>
      </Button>
    </div>
  )
}

// BillRow — compact list row for the Bills tab. Bill requests are visually
// elevated (purple ring + pulse) to flag high priority.
function BillRow({ bill, now, onOpen }) {
  const anchor = bill.last_served_at || bill.opened_at
  const elapsedMs = anchor ? now - new Date(anchor).getTime() : 0
  const minutes = Math.floor(elapsedMs / 60000)
  const isRequested = bill.status === 'bill_requested'

  return (
    <button
      onClick={() => onOpen(bill)}
      className={`w-full text-left flex items-center gap-2.5 px-3 py-2.5 rounded-lg border transition
        ${isRequested
          ? 'bg-purple-500/10 border-purple-500/45 ring-1 ring-purple-500/25 hover:bg-purple-500/15'
          : 'bg-zinc-900/60 border-white/10 hover:bg-zinc-900 hover:border-white/25'}`}
    >
      <span className={`h-2 w-2 rounded-full shrink-0 ${isRequested ? 'bg-purple-400 animate-pulse' : 'bg-zinc-500'}`} />
      <span className="bg-amber-300 text-zinc-950 px-1.5 py-0.5 rounded font-bold text-xs leading-none shrink-0 w-9 text-center">
        T{bill.table_number ?? '?'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-mono tabular-nums text-zinc-100 font-semibold">{eur(bill.totals?.total ?? 0)}</span>
          {isRequested && (
            <span className="text-[10px] text-purple-300 font-bold tracking-wider uppercase">Bill requested</span>
          )}
        </div>
        <p className="text-[11px] text-zinc-500 truncate">
          {bill.customer_name || 'Guest'} · {bill.guests || 0}p · {bill.payment_method || 'cash'}
        </p>
      </div>
      <div className="text-right shrink-0">
        <div className={`text-xs font-mono tabular-nums ${
          isRequested ? 'text-purple-300'
          : minutes >= 40 ? 'text-red-300'
          : minutes >= 20 ? 'text-amber-300'
          : 'text-zinc-400'
        }`}>
          {minutes > 0 ? `${minutes}m` : '<1m'}
        </div>
        <p className="text-[9px] uppercase tracking-[0.15em] text-zinc-600">{isRequested ? 'waiting' : 'dining'}</p>
      </div>
    </button>
  )
}

// ============================================================================
// BillDrawer (unchanged behaviour — preserved from previous version)
// ============================================================================

function BillDrawer({ open, token, bill, onClose, onPaid, refresh, now }) {
  const [detail, setDetail] = useState(null)
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
    } catch { toast.error('Failed to save note') }
    finally { setSavingNote(false) }
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
    } catch { toast.error('Failed to cancel request') }
  }

  const requestBillInApp = async () => {
    try {
      const res = await fetch('/api/guest-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table_id: bill.table_id, request_type: 'bill', note: 'Manually opened by waiter' }),
      })
      if (res.ok) { toast.success('Bill marked as requested'); refresh?.() }
    } catch { toast.error('Failed') }
  }

  const completePayment = async () => {
    if (!confirm(`Confirm payment of ${eur(totals.total)} (${paymentMethod})?`)) return
    setPaying(true)
    try {
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
      } else { toast.error(data.error || 'Payment failed') }
    } catch { toast.error('Payment failed') }
    finally { setPaying(false) }
  }

  return (
    <>
      <button onClick={onClose} className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] animate-in fade-in duration-150" aria-label="Close bill" />
      <aside className="fixed right-0 top-0 bottom-0 z-50 w-full sm:w-[460px] max-w-full bg-zinc-950 border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 text-zinc-100">
        <div className="p-5 border-b border-white/5 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="font-serif text-2xl text-zinc-50">Table {tableNumber}</h2>
              {isRequested && (
                <span className="text-[10px] font-bold tracking-wider uppercase px-2 py-0.5 rounded-md bg-purple-500/15 border border-purple-400/40 text-purple-200">Bill Requested</span>
              )}
            </div>
            <p className="text-sm text-zinc-400 mt-1">{bill.customer_name || 'Guest'} {bill.guests ? `· ${bill.guests} guests` : ''}</p>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <div className="text-right">
              <p className={`font-mono text-2xl tabular-nums ${isRequested ? 'text-purple-300' : 'text-amber-300'}`}>{Math.max(0, Math.floor(elapsedMs / 60000))}m</p>
              <p className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">{isRequested ? 'since request' : 'since served'}</p>
            </div>
            <button onClick={onClose} className="h-9 w-9 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-300 transition"><X className="h-4 w-4" /></button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section className="rounded-xl bg-white/[0.02] border border-white/10 p-4">
            <div className="mb-3">
              <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500">Order Summary</p>
              <p className="text-sm text-zinc-300 mt-0.5 font-mono">{headerOrderLine}</p>
            </div>
            {loading ? <p className="text-sm text-zinc-500">Loading bill…</p>
              : orders.length === 0 ? <p className="text-sm text-zinc-500">No unpaid items.</p>
              : (
                <div className="space-y-2">
                  {orders.flatMap(o => (o.items || []).map((it, idx) => (
                    <div key={`${o.id}-${idx}`} className="flex justify-between items-start gap-3 text-sm">
                      <div className="min-w-0">
                        <p className="text-zinc-200 truncate"><span className="text-zinc-400">{it.quantity}×</span> {it.name}</p>
                        {it.notes && <p className="text-[11px] text-amber-400/80 mt-0.5 italic truncate">"{it.notes}"</p>}
                      </div>
                      <span className="text-zinc-300 font-mono tabular-nums shrink-0">{eur((parseFloat(it.price) || 0) * (parseInt(it.quantity) || 0))}</span>
                    </div>
                  )))}
                </div>
              )}
            <div className="mt-4 pt-4 border-t border-white/10 space-y-1.5 text-sm">
              <div className="flex justify-between text-zinc-400"><span>Subtotal</span><span className="font-mono tabular-nums text-zinc-300">{eur(totals.subtotal)}</span></div>
              <div className="flex justify-between text-zinc-400"><span>VAT (21%)</span><span className="font-mono tabular-nums text-zinc-300">{eur(totals.vat)}</span></div>
              {totals.tips > 0 && <div className="flex justify-between text-zinc-400"><span>Tips</span><span className="font-mono tabular-nums text-emerald-300">{eur(totals.tips)}</span></div>}
              <div className="flex justify-between pt-2 mt-2 border-t border-white/10 text-base">
                <span className="text-zinc-200 font-medium">Total</span>
                <span className="font-mono tabular-nums text-amber-300 font-bold">{eur(totals.total)}</span>
              </div>
            </div>
          </section>
          <section>
            <p className="text-[11px] uppercase tracking-[0.25em] text-zinc-500 mb-2">Payment method</p>
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setMethod('cash')} className={`h-11 rounded-md border text-sm font-medium transition flex items-center justify-center gap-2 ${paymentMethod === 'cash' ? 'bg-amber-300/15 border-amber-300/60 text-amber-200' : 'bg-white/[0.04] border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'}`}><Wallet className="h-4 w-4" /> Cash</button>
              <button onClick={() => setMethod('card')} className={`h-11 rounded-md border text-sm font-medium transition flex items-center justify-center gap-2 ${paymentMethod === 'card' ? 'bg-amber-300/15 border-amber-300/60 text-amber-200' : 'bg-white/[0.04] border-white/10 text-zinc-400 hover:text-zinc-200 hover:border-white/20'}`}><CreditCard className="h-4 w-4" /> Card</button>
            </div>
          </section>
          <Button onClick={completePayment} disabled={paying || orders.length === 0} className="w-full h-12 text-base font-semibold bg-purple-500 hover:bg-purple-400 text-white border-0 shadow-md shadow-purple-500/20">
            <CheckCircle2 className="h-5 w-5 mr-2" /> {paying ? 'Processing…' : 'Payment Completed'}
          </Button>
          <div className="grid gap-2">
            {!isRequested && <Button variant="outline" onClick={requestBillInApp} className="h-11 bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-100"><Mail className="h-4 w-4 mr-2" /> Mark as Bill Requested</Button>}
            {isRequested && <Button variant="outline" onClick={cancelRequest} className="h-11 bg-white/[0.02] border-red-500/30 text-red-300 hover:bg-red-500/10 hover:text-red-200"><XCircle className="h-4 w-4 mr-2" /> Cancel Bill Request</Button>}
          </div>
          <section>
            <Label className="text-[11px] uppercase tracking-[0.25em] text-zinc-500 mb-2 block">Quick note (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add note about this table…" rows={3} className="bg-white/[0.02] border-white/10 text-zinc-100 placeholder:text-zinc-600 focus-visible:ring-amber-400/40" />
            <Button variant="outline" onClick={saveNote} disabled={savingNote} className="mt-2 w-full h-10 bg-white/[0.02] border-white/10 text-zinc-300 hover:bg-white/[0.05] hover:text-zinc-100">{savingNote ? 'Saving…' : 'Save Note'}</Button>
          </section>
        </div>
      </aside>
    </>
  )
}

// ============================================================================
// Main page
// ============================================================================

export default function WaiterPage() {
  const [token, setToken] = useState('')
  const [pwd, setPwd] = useState('')
  const [notifs, setNotifs] = useState([])
  const [guestRequests, setGuestRequests] = useState([])
  const [bills, setBills] = useState([])
  const [now, setNow] = useState(Date.now())
  const [audioOn, setAudioOn] = useState(true)
  const [openBill, setOpenBill] = useState(null)
  const [tab, setTab] = useState('tables') // 'tables' | 'assistance' | 'bills'
  const [resolving, setResolving] = useState(null)
  
  // Waiter ordering interface state
  const [orderInterfaceOpen, setOrderInterfaceOpen] = useState(false)
  const [orderingFor, setOrderingFor] = useState(null) // { table_id, table_number, session_id, request_id }

  const prevPendingIdsRef = useRef(new Set())
  const prevAssistIdsRef = useRef(new Set())
  const audioCtxRef = useRef(null)
  const firstFetchRef = useRef(true)

  // Read persisted token + restore last-active tab.
  useEffect(() => {
    const t = localStorage.getItem('aukstaitija_admin_token') || ''
    if (t) setToken(t)
    const savedTab = localStorage.getItem('aukstaitija_waiter_tab')
    if (savedTab && ['tables', 'assistance', 'bills'].includes(savedTab)) setTab(savedTab)
  }, [])

  useEffect(() => { localStorage.setItem('aukstaitija_waiter_tab', tab) }, [tab])

  // Tick clock every second
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(i)
  }, [])

  // Audio chime — used for both new ready-to-serve and new assistance requests
  const playChime = (variant = 'ready') => {
    if (!audioOn) return
    try {
      if (!audioCtxRef.current) audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)()
      const ctx = audioCtxRef.current
      const start = ctx.currentTime
      const tones = variant === 'assist' ? [880, 660, 880] : [660, 880, 1175]
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
        playChime('ready')
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
    if (!res.ok) return
    const data = await res.json()
    const arr = Array.isArray(data) ? data : []
    // Chime + toast for genuinely new assistance requests (not bill — bills
    // are surfaced visually via the Bills tab pulse).
    const currentIds = new Set(arr.filter(r => r.request_type !== 'bill').map(r => r.id))
    if (prevAssistIdsRef.current.size > 0) {
      const newOnes = []
      currentIds.forEach(id => { if (!prevAssistIdsRef.current.has(id)) newOnes.push(arr.find(r => r.id === id)) })
      if (newOnes.length > 0) {
        playChime('assist')
        const first = newOnes[0]
        const label = ASSIST_META[first.request_type]?.label || 'Assistance'
        toast(`🔔 Table ${first.table_number || '?'} · ${label}`)
      }
    }
    prevAssistIdsRef.current = currentIds
    setGuestRequests(arr)
  }

  const fetchBills = async (tk = token) => {
    if (!tk) return
    const res = await fetch('/api/waiter/bills', { headers: { 'x-admin-token': tk } })
    if (!res.ok) return
    const data = await res.json()
    const arr = Array.isArray(data) ? data : []
    setBills(arr)
    setOpenBill(prev => prev ? (arr.find(b => b.id === prev.id) || null) : prev)
  }

  const refreshAll = () => { fetchNotifs(); fetchGuestRequests(); fetchBills() }

  useEffect(() => {
    if (!token) return
    refreshAll()
    const i = setInterval(refreshAll, 3000)
    return () => clearInterval(i)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token])

  const resolveRequest = async (id) => {
    setResolving(id)
    try {
      const res = await fetch(`/api/guest-requests/${id}`, { method: 'PATCH', headers: { 'x-admin-token': token } })
      if (res.ok) { toast.success('Resolved'); fetchGuestRequests() }
      else toast.error('Failed')
    } finally { setResolving(null) }
  }

  const takeOrder = async (req) => {
    // Fetch table session if exists
    let sessionId = null
    try {
      const res = await fetch(`/api/tables/${req.table_id}`, { headers: { 'x-admin-token': token } })
      if (res.ok) {
        const data = await res.json()
        sessionId = data.active_session?.id || null
      }
    } catch {}
    
    setOrderingFor({
      table_id: req.table_id,
      table_number: req.table_number,
      session_id: sessionId,
      request_id: req.id,
    })
    setOrderInterfaceOpen(true)
  }

  const handleOrderSuccess = async () => {
    // Auto-resolve the "Request Waiter" assistance request
    if (orderingFor?.request_id) {
      await resolveRequest(orderingFor.request_id)
    }
    // Refresh all data
    refreshAll()
    setOrderInterfaceOpen(false)
    setOrderingFor(null)
  }

  const serve = async (id) => {
    const res = await fetch(`/api/waiter/notifications/${id}/served`, { method: 'POST', headers: { 'x-admin-token': token } })
    if (res.ok) { toast.success('✓ Served'); fetchNotifs(); fetchBills() }
    else toast.error('Failed to mark served')
  }

  const login = async (e) => {
    e.preventDefault()
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pwd })
    })
    const data = await res.json()
    if (data.token) { setToken(data.token); localStorage.setItem('aukstaitija_admin_token', data.token) }
    else { toast.error('Invalid password') }
  }

  // Derived collections
  const ready = useMemo(() => notifs.filter(n => n.status === 'pending'), [notifs])
  const readyByTable = useMemo(() => {
    const map = {}
    ready.forEach(n => {
      const tNum = n.table_name?.replace(/^Table\s*/i, '') || n.table_number
      if (!map[tNum]) map[tNum] = []
      map[tNum].push(n)
    })
    return map
  }, [ready])

  const assistance = useMemo(() => {
    // newest-first, allergy bubbles to top
    const arr = guestRequests.filter(r => r.request_type !== 'bill')
    arr.sort((a, b) => {
      const aAllergy = a.request_type === 'allergy' ? 0 : 1
      const bAllergy = b.request_type === 'allergy' ? 0 : 1
      if (aAllergy !== bAllergy) return aAllergy - bAllergy
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
    return arr
  }, [guestRequests])

  // Active Tables — every bill row represents an occupied session.
  // Sort: ready-to-serve → bill_requested → longest dining → newest.
  const tables = useMemo(() => {
    const arr = [...bills]
    arr.sort((a, b) => {
      const aReady = (readyByTable[a.table_number] || []).length > 0 ? 0 : 1
      const bReady = (readyByTable[b.table_number] || []).length > 0 ? 0 : 1
      if (aReady !== bReady) return aReady - bReady
      const aReq = a.status === 'bill_requested' ? 0 : 1
      const bReq = b.status === 'bill_requested' ? 0 : 1
      if (aReq !== bReq) return aReq - bReq
      const aA = a.last_served_at || a.opened_at
      const bA = b.last_served_at || b.opened_at
      return new Date(aA || 0).getTime() - new Date(bA || 0).getTime()
    })
    return arr
  }, [bills, readyByTable])

  // Bills tab — bill_requested first, then by longest waiting.
  const billsSorted = useMemo(() => {
    const arr = [...bills]
    arr.sort((a, b) => {
      const aReq = a.status === 'bill_requested' ? 0 : 1
      const bReq = b.status === 'bill_requested' ? 0 : 1
      if (aReq !== bReq) return aReq - bReq
      return new Date(a.last_served_at || a.opened_at || 0).getTime() - new Date(b.last_served_at || b.opened_at || 0).getTime()
    })
    return arr
  }, [bills])

  const billRequestedCount = useMemo(() => bills.filter(b => b.status === 'bill_requested').length, [bills])

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

  const TABS = [
    { id: 'tables',     label: 'Active Tables',  Icon: LayoutGrid,  count: tables.length,       accent: 'text-amber-300' },
    { id: 'assistance', label: 'Assistance',     Icon: Bell,        count: assistance.length,    accent: 'text-amber-300', pulse: assistance.some(r => r.request_type === 'allergy') },
    { id: 'bills',      label: 'Bills',          Icon: Receipt,     count: bills.length,         accent: 'text-purple-300', pulse: billRequestedCount > 0, pulseCount: billRequestedCount },
  ]

  return (
    <div className="dark min-h-screen text-zinc-100" style={{ background: 'radial-gradient(ellipse 80% 50% at 50% -10%, rgba(212,165,74,0.06), transparent 60%), #0A0A0B' }}>
      {/* ---- Top bar ---- */}
      <header className="sticky top-0 z-30 border-b border-white/5 bg-black/80 backdrop-blur-xl">
        <div className="container mx-auto h-14 px-3 sm:px-4 flex items-center gap-3 max-w-7xl">
          <Link href="/admin" className="text-zinc-400 hover:text-zinc-100 transition shrink-0"><ArrowLeft className="h-4 w-4" /></Link>
          <div className="h-8 w-8 rounded-lg bg-amber-400/15 ring-1 ring-amber-400/30 flex items-center justify-center shrink-0">
            <Utensils className="h-4 w-4 text-amber-300" />
          </div>
          <div className="hidden sm:flex flex-col leading-tight">
            <span className="text-[10px] uppercase tracking-[0.3em] text-amber-300/80">Aukštaitija</span>
            <span className="text-sm text-zinc-100 font-semibold">Waiter Display</span>
          </div>

          <div className="flex-1 flex items-center justify-center gap-3">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-500/10 ring-1 ring-emerald-500/30">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] text-emerald-300 font-semibold">Live</span>
            </div>
            <div className="hidden md:block font-mono text-sm tabular-nums text-zinc-400">
              {new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
            </div>
          </div>

          <Link href="/waiter/new-order">
            <Button size="sm" className="h-8 bg-amber-300 hover:bg-amber-200 text-zinc-950 font-semibold border-0 px-2.5">
              <Plus className="h-4 w-4 sm:mr-1" /> <span className="hidden sm:inline">New Order</span>
            </Button>
          </Link>
          <Link href="/kitchen" className="hidden lg:block">
            <Button variant="outline" size="sm" className="h-8 bg-white/5 border-white/10 text-zinc-200 hover:bg-white/10">
              <ChefHat className="h-4 w-4 mr-1" /> Kitchen
            </Button>
          </Link>
          <button
            onClick={() => setAudioOn(!audioOn)}
            className="h-8 w-8 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center transition shrink-0"
            title="Toggle alerts"
          >
            {audioOn ? <Volume2 className="h-4 w-4 text-amber-300" /> : <BellOff className="h-4 w-4 text-zinc-500" />}
          </button>
          <button
            onClick={() => { setToken(''); localStorage.removeItem('aukstaitija_admin_token') }}
            className="h-8 w-8 rounded-md bg-white/5 hover:bg-red-500/20 hover:text-red-200 border border-white/10 text-zinc-300 flex items-center justify-center transition shrink-0"
            title="Sign out"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>

        {/* Persistent Ready-to-Serve strip — most urgent operational action.
            Always visible regardless of which tab is active so plated food
            never waits at the pass while the waiter is on another tab.    */}
        {ready.length > 0 && (
          <div className="border-t border-white/5 bg-gradient-to-r from-emerald-500/[0.04] via-transparent to-emerald-500/[0.04]">
            <div className="container mx-auto max-w-7xl px-3 sm:px-4 py-2 flex items-center gap-2">
              <div className="shrink-0 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-emerald-300 font-bold">
                <Sparkles className="h-3.5 w-3.5" /> Ready · {ready.length}
              </div>
              <div className="flex-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
                <div className="flex gap-2 min-w-max">
                  {ready.map(n => <ReadyPill key={n.id} notif={n} now={now} onServe={serve} />)}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab bar — always visible */}
        <div className="border-t border-white/5">
          <div className="container mx-auto max-w-7xl px-3 sm:px-4">
            <div className="flex gap-0.5 sm:gap-1">
              {TABS.map(t => {
                const Icon = t.Icon
                const active = tab === t.id
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`relative flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 text-sm font-medium transition border-b-2
                      ${active
                        ? 'border-amber-300 text-zinc-50 bg-white/[0.03]'
                        : 'border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.02]'}`}
                  >
                    <Icon className={`h-4 w-4 ${active ? t.accent : ''}`} />
                    <span>{t.label}</span>
                    <span className={`font-mono text-xs tabular-nums px-1.5 py-0.5 rounded ${active ? 'bg-white/10 text-zinc-100' : 'bg-white/[0.05] text-zinc-500'}`}>
                      {t.count}
                    </span>
                    {t.pulse && (
                      <span className="absolute top-1.5 right-2 flex h-2 w-2">
                        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${t.id === 'bills' ? 'bg-purple-400' : 'bg-rose-400'} opacity-75`} />
                        <span className={`relative inline-flex rounded-full h-2 w-2 ${t.id === 'bills' ? 'bg-purple-500' : 'bg-rose-500'}`} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </header>

      {/* ---- Tab content ---- */}
      <main className="container mx-auto px-3 sm:px-4 py-4 max-w-7xl">
        {/* ACTIVE TABLES */}
        {tab === 'tables' && (
          tables.length === 0 ? (
            <EmptyState Icon={LayoutGrid} title="No tables seated" subtitle="Tables you serve will appear here. Tap one to open the bill." />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
              {tables.map(b => (
                <TableTile
                  key={b.id}
                  bill={b}
                  readyForTable={readyByTable[b.table_number] || []}
                  now={now}
                  onOpenBill={setOpenBill}
                />
              ))}
            </div>
          )
        )}

        {/* ASSISTANCE REQUESTS */}
        {tab === 'assistance' && (
          assistance.length === 0 ? (
            <EmptyState Icon={Bell} title="No assistance requests" subtitle="Customer requests will land here. Newest at the top, allergy alerts pulse red." />
          ) : (
            <div className="space-y-1.5 max-w-3xl">
              {assistance.map(r => (
                <AssistRow key={r.id} req={r} now={now} onResolve={resolveRequest} onTakeOrder={takeOrder} busy={resolving === r.id} />
              ))}
            </div>
          )
        )}

        {/* BILLS */}
        {tab === 'bills' && (
          billsSorted.length === 0 ? (
            <EmptyState Icon={Receipt} title="No open bills" subtitle="Bills appear as soon as you mark a ready order as served." />
          ) : (
            <div className="space-y-1.5 max-w-3xl">
              {billsSorted.map(b => (
                <BillRow key={b.id} bill={b} now={now} onOpen={setOpenBill} />
              ))}
            </div>
          )
        )}

        {/* Subtle legend for table stage colours — only on the Tables tab */}
        {tab === 'tables' && tables.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[10px] text-zinc-500">
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /><span>Ready</span></div>
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-purple-400" /><span>Bill req.</span></div>
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" /><span>20m+</span></div>
            <div className="flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-red-400" /><span>40m+</span></div>
          </div>
        )}
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

      <WaiterOrderInterface
        open={orderInterfaceOpen}
        tableId={orderingFor?.table_id}
        tableNumber={orderingFor?.table_number}
        sessionId={orderingFor?.session_id}
        token={token}
        onClose={() => { setOrderInterfaceOpen(false); setOrderingFor(null) }}
        onSuccess={handleOrderSuccess}
      />
    </div>
  )
}

// Tiny empty-state — operational, not marketing.
function EmptyState({ Icon, title, subtitle }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] py-12 text-center max-w-md mx-auto">
      <Icon className="h-7 w-7 mx-auto text-zinc-600 mb-2 opacity-60" />
      <p className="text-zinc-300 text-sm">{title}</p>
      <p className="text-[11px] text-zinc-600 mt-1">{subtitle}</p>
    </div>
  )
}
