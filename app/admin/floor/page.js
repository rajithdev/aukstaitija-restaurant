'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ArrowLeft, Users, Utensils, ShoppingBag, Receipt, Brush, X, UserPlus, CheckCircle2, AlertTriangle, Clock, QrCode, Printer, RefreshCcw, LogOut } from 'lucide-react'
import { toast } from 'sonner'

const STATUS_COLORS = {
  available: 'border-green-500 bg-green-500/10 text-green-700 dark:text-green-400',
  reserved: 'border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-400',
  occupied: 'border-red-500 bg-red-500/10 text-red-700 dark:text-red-400',
  cleaning: 'border-yellow-500 bg-yellow-500/10 text-yellow-700 dark:text-yellow-400',
  out_of_service: 'border-gray-500 bg-gray-500/10 text-gray-500',
}
const STATUS_LABELS = {
  available: 'Available', reserved: 'Reserved', occupied: 'Occupied', cleaning: 'Cleaning', out_of_service: 'Out of Service',
}
const STATUS_DOT = {
  available: 'bg-green-500', reserved: 'bg-blue-500', occupied: 'bg-red-500', cleaning: 'bg-yellow-500', out_of_service: 'bg-gray-500',
}

function FloorPage() {
  const router = useRouter()
  const [token, setToken] = useState('')
  const [tables, setTables] = useState([])
  const [selected, setSelected] = useState(null)
  const [showQr, setShowQr] = useState(null)
  const [showWalkin, setShowWalkin] = useState(null)
  const [showBill, setShowBill] = useState(null)

  useEffect(() => {
    const t = localStorage.getItem('aukstaitija_admin_token') || ''
    if (!t) { router.push('/admin'); return }
    setToken(t)
  }, [router])

  const adminFetch = async (url, options = {}) => {
    const res = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json', 'x-admin-token': token, ...(options.headers || {}) } })
    if (res.status === 401) { localStorage.removeItem('aukstaitija_admin_token'); router.push('/admin'); return null }
    return res.json().catch(() => ({}))
  }

  const load = async () => {
    if (!token) return
    const res = await fetch('/api/tables', { headers: { 'x-admin-token': token } })
    const d = await res.json()
    if (Array.isArray(d)) setTables(d)
  }

  useEffect(() => {
    if (!token) return
    load()
    const i = setInterval(load, 8000)
    return () => clearInterval(i)
  }, [token])

  const action = async (tableId, action, body) => {
    const r = await adminFetch(`/api/tables/${tableId}/${action}`, { method: 'POST', body: body ? JSON.stringify(body) : '{}' })
    if (r?.error) toast.error(r.error)
    else toast.success('Done')
    load()
    if (selected) {
      // refresh selected
      const fresh = await fetch(`/api/tables/${tableId}`).then(r => r.json())
      setSelected(fresh)
    }
  }

  const openTable = async (table) => {
    const r = await fetch(`/api/tables/${table.id}`)
    const d = await r.json()
    setSelected(d)
  }

  // Group by section
  const sections = {}
  tables.forEach(t => { (sections[t.section] = sections[t.section] || []).push(t) })

  const stats = {
    available: tables.filter(t => t.status === 'available').length,
    reserved: tables.filter(t => t.status === 'reserved').length,
    occupied: tables.filter(t => t.status === 'occupied').length,
    cleaning: tables.filter(t => t.status === 'cleaning').length,
    out_of_service: tables.filter(t => t.status === 'out_of_service').length,
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border">
        <div className="container mx-auto h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
            <h1 className="font-serif text-2xl">Floor Map</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/qr-sheet"><Button variant="outline"><QrCode className="h-4 w-4 mr-1" /> Print all QR codes</Button></Link>
            <Button variant="outline" onClick={load}><RefreshCcw className="h-4 w-4 mr-1" /> Refresh</Button>
            <Link href="/kitchen"><Button variant="outline">Kitchen</Button></Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-6">
        {/* Status legend */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
          {Object.entries(stats).map(([k, v]) => (
            <Card key={k} className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-3 h-3 rounded-full ${STATUS_DOT[k]}`} />
                <p className="text-xs uppercase tracking-wider text-muted-foreground">{STATUS_LABELS[k]}</p>
              </div>
              <p className="font-serif text-3xl">{v}</p>
            </Card>
          ))}
        </div>

        {/* Sections */}
        {Object.entries(sections).map(([section, ts]) => (
          <div key={section} className="mb-8">
            <h2 className="font-serif text-2xl mb-3 text-muted-foreground">{section}</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-3">
              {ts.map(t => (
                <button key={t.id} onClick={() => openTable(t)}
                  className={`relative p-4 rounded-lg border-2 text-left transition hover:scale-[1.02] ${STATUS_COLORS[t.status] || ''}`}>
                  <p className="font-serif text-3xl">T{t.number}</p>
                  <div className="flex items-center gap-1 text-xs mt-1">
                    <Users className="h-3 w-3" /> {t.capacity}
                  </div>
                  <p className="text-[10px] uppercase tracking-wider mt-1 opacity-80">{STATUS_LABELS[t.status]}</p>
                  {t.active_orders > 0 && (
                    <span className="absolute -top-2 -right-2 bg-primary text-primary-foreground rounded-full text-xs w-6 h-6 flex items-center justify-center font-bold">
                      {t.active_orders}
                    </span>
                  )}
                  {t.upcoming_reservation && t.status === 'reserved' && (
                    <span className="absolute top-2 right-2 text-[9px] bg-blue-500 text-white px-1.5 py-0.5 rounded uppercase tracking-wider">{t.upcoming_reservation.time}</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Selected table modal */}
      {selected && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setSelected(null)}>
          <Card className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-4">
              <div>
                <p className="text-primary text-xs uppercase tracking-[0.4em]">{selected.section}</p>
                <h2 className="font-serif text-4xl">Table {selected.number}</h2>
                <p className="text-sm text-muted-foreground flex items-center gap-3 mt-1">
                  <span><Users className="h-3 w-3 inline mr-1" /> seats {selected.capacity}</span>
                  <span className={`flex items-center gap-1`}>
                    <span className={`w-2 h-2 rounded-full ${STATUS_DOT[selected.status]}`} /> {STATUS_LABELS[selected.status]}
                  </span>
                </p>
              </div>
              <button onClick={() => setSelected(null)}><X className="h-5 w-5" /></button>
            </div>

            {/* Active session */}
            {selected.active_session && (
              <Card className="p-4 mb-4 bg-red-500/5 border-red-500/30">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Active session</p>
                <p className="font-serif text-xl">{selected.active_session.customer_name}</p>
                <p className="text-xs text-muted-foreground">{selected.active_session.guests} guests · since {new Date(selected.active_session.started_at).toLocaleTimeString()} · origin: {selected.active_session.origin}</p>
                {selected.orders?.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{selected.orders.length} orders</p>
                    {selected.orders.map(o => (
                      <div key={o.id} className="text-sm flex justify-between py-1">
                        <span>{o.items.length} items · {o.status}</span>
                        <span>€{o.total?.toFixed(2)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            {/* Upcoming reservations */}
            {selected.upcoming_reservations?.length > 0 && (
              <Card className="p-4 mb-4 bg-blue-500/5 border-blue-500/30">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Upcoming reservations</p>
                {selected.upcoming_reservations.map(r => (
                  <div key={r.id} className="text-sm py-1">
                    {r.date} {r.time} · {r.name} · {r.guests}p
                  </div>
                ))}
              </Card>
            )}

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              {selected.status === 'available' && (
                <>
                  <Button onClick={() => setShowWalkin(selected.id)} className="col-span-2 h-11">
                    <UserPlus className="h-4 w-4 mr-1" /> Seat Walk-in
                  </Button>
                  <Button variant="outline" onClick={() => setShowQr(selected)} className="h-11">
                    <QrCode className="h-4 w-4 mr-1" /> Show QR
                  </Button>
                  <Button variant="outline" onClick={async () => { await adminFetch(`/api/tables/${selected.id}`, { method: 'PUT', body: JSON.stringify({ status: 'out_of_service' }) }); load(); setSelected(null) }} className="h-11">
                    Set Out of Service
                  </Button>
                </>
              )}
              {selected.status === 'occupied' && (
                <>
                  <Button onClick={() => setShowBill(selected.id)} className="h-11">
                    <Receipt className="h-4 w-4 mr-1" /> Generate Bill
                  </Button>
                  <Button variant="outline" onClick={() => action(selected.id, 'close')} className="h-11">
                    <LogOut className="h-4 w-4 mr-1" /> Close (no payment)
                  </Button>
                </>
              )}
              {selected.status === 'cleaning' && (
                <Button onClick={() => action(selected.id, 'cleaned')} className="col-span-2 h-11 bg-green-600 hover:bg-green-700">
                  <Brush className="h-4 w-4 mr-1" /> Cleaning Complete
                </Button>
              )}
              {selected.status === 'reserved' && selected.upcoming_reservations?.[0] && (
                <Button onClick={async () => {
                  await adminFetch(`/api/reservations/${selected.upcoming_reservations[0].id}/checkin`, { method: 'POST', body: JSON.stringify({ table_id: selected.id }) })
                  load(); setSelected(null); toast.success('Checked in')
                }} className="col-span-2 h-11 bg-blue-600 hover:bg-blue-700">
                  <CheckCircle2 className="h-4 w-4 mr-1" /> Check-in {selected.upcoming_reservations[0].name}
                </Button>
              )}
              {selected.status === 'out_of_service' && (
                <Button onClick={async () => { await adminFetch(`/api/tables/${selected.id}`, { method: 'PUT', body: JSON.stringify({ status: 'available' }) }); load(); setSelected(null) }} className="col-span-2 h-11">
                  Set Back Available
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Walk-in modal */}
      {showWalkin && (
        <WalkinModal tableId={showWalkin} onClose={() => setShowWalkin(null)} onDone={() => { setShowWalkin(null); setSelected(null); load() }} token={token} />
      )}

      {/* QR modal */}
      {showQr && (
        <QrModal table={showQr} onClose={() => setShowQr(null)} />
      )}

      {/* Bill modal */}
      {showBill && (
        <BillModal tableId={showBill} token={token} onClose={() => setShowBill(null)} onPaid={() => { setShowBill(null); setSelected(null); load() }} />
      )}
    </div>
  )
}

function WalkinModal({ tableId, onClose, onDone, token }) {
  const [guests, setGuests] = useState(2)
  const [name, setName] = useState('Walk-in')
  const submit = async () => {
    const res = await fetch(`/api/tables/${tableId}/walkin`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ guests, customer_name: name })
    })
    const d = await res.json()
    if (d.ok) { toast.success('Seated!'); onDone() } else { toast.error(d.error || 'Failed') }
  }
  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
        <h3 className="font-serif text-2xl mb-4">Seat Walk-in</h3>
        <div className="space-y-3">
          <div><Label>Customer name</Label><Input value={name} onChange={e => setName(e.target.value)} className="mt-2" /></div>
          <div><Label>Guests</Label>
            <select value={guests} onChange={e => setGuests(parseInt(e.target.value))} className="mt-2 h-9 w-full px-3 bg-background border border-border rounded-md text-sm">
              {[1,2,3,4,5,6,7,8].map(n => <option key={n}>{n}</option>)}
            </select>
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button onClick={submit} className="flex-1">Seat</Button>
          </div>
        </div>
      </Card>
    </div>
  )
}

function QrModal({ table, onClose }) {
  const url = typeof window !== 'undefined' ? `${window.location.origin}/table/${table.id}` : `/table/${table.id}`
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(url)}`
  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
        <h3 className="font-serif text-3xl mb-1">Table {table.number}</h3>
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-4">Scan to order</p>
        <div className="bg-white p-4 rounded-md inline-block">
          <img src={qrUrl} alt="QR Code" className="w-64 h-64" />
        </div>
        <p className="text-xs text-muted-foreground mt-3 break-all">{url}</p>
        <div className="flex gap-2 mt-4">
          <Button variant="outline" onClick={() => window.print()} className="flex-1"><Printer className="h-4 w-4 mr-1" /> Print</Button>
          <Button onClick={onClose} className="flex-1">Close</Button>
        </div>
      </Card>
    </div>
  )
}

function BillModal({ tableId, token, onClose, onPaid }) {
  const [bill, setBill] = useState(null)
  const [paying, setPaying] = useState(false)
  useEffect(() => {
    fetch(`/api/tables/${tableId}/bill`, { headers: { 'x-admin-token': token } }).then(r => r.json()).then(setBill)
  }, [tableId, token])

  const pay = async (method) => {
    setPaying(true)
    const res = await fetch(`/api/tables/${tableId}/pay`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-token': token }, body: JSON.stringify({ payment_method: method }) })
    const d = await res.json()
    setPaying(false)
    if (d.ok) { toast.success('Paid! Table set to cleaning.'); onPaid() }
    else toast.error(d.error || 'Failed')
  }

  if (!bill) return null
  if (bill.error) return <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}><Card className="p-6"><p>{bill.error}</p><Button onClick={onClose} className="mt-3">Close</Button></Card></div>

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <Card className="w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="text-center mb-4">
          <p className="text-primary text-xs uppercase tracking-[0.4em] mb-1">Aukštaitija · Kaunas</p>
          <p className="font-serif text-2xl">Bill — Table {bill.table.number}</p>
          <p className="text-xs text-muted-foreground">Invoice {bill.invoice_number}</p>
          <p className="text-xs text-muted-foreground">{bill.session.customer_name} · {bill.session.guests} guests</p>
        </div>
        <div className="border-y border-border py-4 space-y-1.5 my-4">
          {bill.items.map((i, idx) => (
            <div key={idx} className="flex justify-between text-sm">
              <span>{i.quantity}× {i.name}</span>
              <span>€{(i.price * i.quantity).toFixed(2)}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span>€{bill.subtotal.toFixed(2)}</span></div>
          <div className="flex justify-between text-muted-foreground"><span>VAT (21%)</span><span>€{bill.tax.toFixed(2)}</span></div>
        </div>
        <div className="flex justify-between font-serif text-3xl mt-4 pt-4 border-t border-border">
          <span>Total</span><span className="text-primary">€{bill.total.toFixed(2)}</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-6">
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
        <div className="grid grid-cols-2 gap-2 mt-2">
          <Button onClick={() => pay('cash')} disabled={paying} className="bg-green-600 hover:bg-green-700">Mark Paid (Cash)</Button>
          <Button onClick={() => pay('card')} disabled={paying} className="bg-green-600 hover:bg-green-700">Mark Paid (Card)</Button>
        </div>
      </Card>
    </div>
  )
}

export default FloorPage
