'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowLeft, CheckCircle2, Receipt, Clock, Users, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'

export default function WaiterTablePanel() {
  const params = useParams()
  const router = useRouter()
  const [token, setToken] = useState('')
  const [table, setTable] = useState(null)
  const [orders, setOrders] = useState([])
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [closing, setClosing] = useState(false)

  useEffect(() => {
    const tk = localStorage.getItem('aukstaitija_admin_token')
    if (!tk) {
      router.push('/admin')
      return
    }
    setToken(tk)
    fetchTableSession(tk)
  }, [params.tableId])

  const fetchTableSession = async (tk) => {
    try {
      // Single source of truth: GET /api/tables/:id/bill
      // Returns { table, session, orders (all unpaid dine-in orders for the
      // active session/table — any kitchen status), totals, debug }.
      const billRes = await fetch(`/api/tables/${params.tableId}/bill`, {
        headers: { 'x-admin-token': tk }
      })
      if (!billRes.ok) {
        const errText = await billRes.text().catch(() => '')
        console.error(`❌ Bill fetch failed: HTTP ${billRes.status} — ${errText}`)
        toast.error('Failed to load table bill')
        return
      }
      const bill = await billRes.json()
      setTable(bill.table || null)
      setSession(bill.session || null)
      setOrders(Array.isArray(bill.orders) ? bill.orders : [])

      // Debug logging — exactly as required by the bill-fix spec
      console.log('🧾 [Bill] table_id:', bill.debug?.table_id)
      console.log('🧾 [Bill] active_session_id:', bill.debug?.active_session_id)
      console.log('🧾 [Bill] fetched order count:', bill.debug?.fetched_count)
      console.log('🧾 [Bill] fetched statuses:', bill.debug?.statuses)
      console.log('🧾 [Bill] payment statuses:', bill.debug?.payment_statuses)
      console.log('🧾 [Bill] unpaid totals:', bill.debug?.unpaid_totals)
    } catch (e) {
      console.error('❌ Error fetching table bill:', e)
      toast.error('Failed to load table bill')
    } finally {
      setLoading(false)
    }
  }

  const completePayment = async () => {
    if (!confirm('Mark payment as completed and close this table session?')) return
    setClosing(true)
    try {
      const res = await fetch(`/api/tables/${params.tableId}/complete-payment`, {
        method: 'POST',
        headers: { 'x-admin-token': token },
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        console.log('✅ [complete-payment]', data)
        toast.success(
          `Payment completed — €${(data.paid_total ?? 0).toFixed(2)} · ${data.orders_closed ?? 0} order(s) closed. Table is now available.`
        )
        router.push('/waiter')
      } else {
        console.error('❌ [complete-payment] failed:', data)
        toast.error(data?.error || 'Failed to complete payment')
      }
    } catch (e) {
      console.error('❌ [complete-payment] exception:', e)
      toast.error('Failed to complete payment')
    } finally {
      setClosing(false)
    }
  }

  if (loading) {
    return (
      <div className="dark min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-zinc-400">Loading table session...</div>
      </div>
    )
  }

  const subtotal = orders.reduce((sum, order) => {
    const orderTotal = (order.items || []).reduce((orderSum, item) => {
      return orderSum + (item.price * item.quantity)
    }, 0)
    return sum + orderTotal
  }, 0)

  const tax = subtotal * 0.21
  const tips = orders.reduce((sum, order) => sum + (order.tip || 0), 0)
  const total = subtotal + tax + tips

  console.log('💰 Bill Summary:', {
    orders: orders.length,
    subtotal: `€${subtotal.toFixed(2)}`,
    tax: `€${tax.toFixed(2)}`,
    tips: `€${tips.toFixed(2)}`,
    total: `€${total.toFixed(2)}`,
  })

  return (
    <div className="dark min-h-screen bg-zinc-950 text-zinc-100">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-black/70 backdrop-blur-xl">
        <div className="container mx-auto h-16 px-6 flex items-center gap-4">
          <Link href="/waiter">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" /> Back
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="font-serif text-2xl">Table {table?.number} — Bill Summary</h1>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-6 py-8 max-w-2xl">
        {/* Table Info Card */}
        <Card className="p-6 mb-6 bg-zinc-900/50 border-zinc-800">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Receipt className="h-6 w-6 text-amber-400" />
                </div>
                <div>
                  <h2 className="text-3xl font-bold text-amber-300">Table {table?.number}</h2>
                  <p className="text-sm text-zinc-500">{table?.section || 'Main'} Section</p>
                </div>
              </div>
            </div>
            {session && (
              <div className="text-right">
                <div className="flex items-center gap-2 text-zinc-400 text-sm">
                  <Clock className="h-4 w-4" />
                  <span>
                    {Math.floor((Date.now() - new Date(session.started_at).getTime()) / 60000)} min
                  </span>
                </div>
                <p className="text-xs text-zinc-500 mt-1">Session duration</p>
              </div>
            )}
          </div>
        </Card>

        {/* Orders List */}
        <div className="space-y-4 mb-6">
          {orders.map(order => (
            <Card key={order.id} className="p-4 bg-zinc-900/50 border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-zinc-500">Order #{order.order_number}</span>
                <span className={`text-xs px-2 py-1 rounded ${
                  order.status === 'ready' ? 'bg-emerald-500/20 text-emerald-300' :
                  order.status === 'served' ? 'bg-blue-500/20 text-blue-300' :
                  'bg-amber-500/20 text-amber-300'
                }`}>
                  {order.status}
                </span>
              </div>
              
              <div className="space-y-2">
                {(order.items || []).map((item, idx) => (
                  <div key={idx} className="flex justify-between text-sm">
                    <div className="flex-1">
                      <span className="text-zinc-300">{item.quantity}× {item.name}</span>
                      {item.notes && (
                        <div className="flex items-center gap-1 text-xs text-amber-400 mt-1">
                          <AlertTriangle className="h-3 w-3" />
                          <span>{item.notes}</span>
                        </div>
                      )}
                    </div>
                    <span className="text-zinc-400">€{(item.price * item.quantity).toFixed(2)}</span>
                  </div>
                ))}
              </div>

              {order.notes && (
                <div className="mt-3 pt-3 border-t border-zinc-800">
                  <p className="text-xs text-zinc-500">Order notes:</p>
                  <p className="text-sm text-zinc-400 italic">"{order.notes}"</p>
                </div>
              )}
            </Card>
          ))}

          {orders.length === 0 && (
            <Card className="p-8 bg-zinc-900/50 border-zinc-800 text-center">
              <p className="text-zinc-500">No active orders for this table</p>
            </Card>
          )}
        </div>

        {/* Bill Summary */}
        <Card className="p-6 bg-gradient-to-br from-amber-950/30 to-zinc-900/50 border-amber-500/20">
          <h3 className="font-serif text-xl mb-4 text-amber-300">Bill Summary</h3>
          
          <div className="space-y-2 text-sm mb-4">
            <div className="flex justify-between">
              <span className="text-zinc-400">Subtotal</span>
              <span className="text-zinc-300">€{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-400">VAT (21%)</span>
              <span className="text-zinc-300">€{tax.toFixed(2)}</span>
            </div>
            {tips > 0 && (
              <div className="flex justify-between">
                <span className="text-zinc-400">Tips</span>
                <span className="text-emerald-400">€{tips.toFixed(2)}</span>
              </div>
            )}
          </div>

          <div className="border-t border-amber-500/20 pt-4 mb-6">
            <div className="flex justify-between items-center">
              <span className="font-serif text-xl text-zinc-100">Total</span>
              <span className="font-serif text-3xl text-amber-300">€{total.toFixed(2)}</span>
            </div>
          </div>

          {/* Payment Completed Button */}
          <Button
            onClick={completePayment}
            disabled={closing || orders.length === 0}
            className="w-full h-14 text-lg font-semibold bg-gradient-to-br from-emerald-600 to-emerald-700 hover:from-emerald-500 hover:to-emerald-600 text-white"
          >
            <CheckCircle2 className="h-5 w-5 mr-2" />
            {closing ? 'Processing...' : 'Payment Completed'}
          </Button>

          <p className="text-xs text-zinc-500 text-center mt-3">
            This will close the session and make the table available
          </p>
        </Card>
      </div>
    </div>
  )
}
