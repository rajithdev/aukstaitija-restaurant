'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Card } from '@/components/ui/card'
import { useApp } from '@/lib/AppContext'
import { CheckCircle2, ChefHat, Clock, Truck, PackageCheck, Bike, Map } from 'lucide-react'

const STAGES_DELIVERY = [
  { key: 'received', label: 'Order received', icon: Clock },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready', label: 'Ready for courier', icon: PackageCheck },
  { key: 'courier_assigned', label: 'Courier assigned', icon: Bike },
  { key: 'on_the_way', label: 'On the way', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: CheckCircle2 },
]

const STAGES_NON_DELIVERY = [
  { key: 'received', label: 'Order received', icon: Clock },
  { key: 'preparing', label: 'Preparing', icon: ChefHat },
  { key: 'ready', label: 'Ready', icon: PackageCheck },
  { key: 'delivered', label: 'Completed', icon: CheckCircle2 },
]

const PROVIDER_BADGE = {
  in_house: { label: 'In-house Courier', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  wolt: { label: 'Wolt', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  bolt_food: { label: 'Bolt Food', color: 'bg-emerald-400/15 text-emerald-700 dark:text-emerald-300' },
}

function progressIndex(order, stages) {
  if (order.status === 'cancelled') return -1
  if (order.type === 'delivery') {
    const dStatus = order.delivery_status
    if (order.status === 'delivered' || dStatus === 'delivered') return stages.length - 1
    if (dStatus === 'on_the_way') return 4
    if (dStatus === 'courier_assigned') return 3
    if (order.status === 'ready') return 2
    if (order.status === 'preparing') return 1
    return 0
  } else {
    if (order.status === 'delivered') return stages.length - 1
    if (order.status === 'ready') return 2
    if (order.status === 'preparing') return 1
    return 0
  }
}

function OrderTrack() {
  const params = useParams()
  const { t, lang } = useApp()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState(false)

  const fetchOrder = async () => {
    const res = await fetch(`/api/orders/${params.id}`)
    const data = await res.json()
    if (data.error) setError(true)
    else setOrder(data)
  }

  useEffect(() => {
    fetchOrder()
    const i = setInterval(fetchOrder, 5000)
    return () => clearInterval(i)
  }, [params.id])

  if (error) return (
    <div className="min-h-screen bg-background"><Navbar /><div className="container py-32 text-center text-muted-foreground">Order not found</div></div>
  )
  if (!order) return <div className="min-h-screen bg-background"><Navbar /></div>

  const isDelivery = order.type === 'delivery'
  const stages = isDelivery ? STAGES_DELIVERY : STAGES_NON_DELIVERY
  const currentIdx = progressIndex(order, stages)
  const providerBadge = isDelivery ? PROVIDER_BADGE[order.delivery_method || order.delivery_provider || 'in_house'] : null
  const headlineLabel = currentIdx >= 0 ? stages[currentIdx].label : 'Cancelled'

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto py-10">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-primary text-xs uppercase tracking-[0.4em] mb-3">Order #{order.order_number}</p>
            <h1 className="font-serif text-5xl mb-3">{headlineLabel}</h1>
            {isDelivery && providerBadge && (
              <div className="inline-flex items-center gap-2 mt-1">
                <span className={`text-xs uppercase tracking-wider px-3 py-1 rounded-full ${providerBadge.color}`}>
                  <Bike className="h-3 w-3 inline mr-1" /> {providerBadge.label}
                </span>
                {order.courier_eta && <span className="text-xs text-muted-foreground">~{order.courier_eta} min ETA</span>}
                {order.delivery_zone_name && <span className="text-xs text-muted-foreground">· {order.delivery_zone_name}</span>}
              </div>
            )}
          </div>

          {/* Vertical timeline */}
          <Card className="p-8 mb-6 bg-card">
            <ol className="relative border-l-2 border-border ml-3 space-y-6">
              {stages.map((s, i) => {
                const Icon = s.icon
                const reached = i <= currentIdx
                const isCurrent = i === currentIdx
                return (
                  <li key={s.key} className="ml-6">
                    <div className={`absolute -left-3 w-6 h-6 rounded-full flex items-center justify-center ${reached ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'} ${isCurrent ? 'ring-4 ring-primary/30 animate-pulse' : ''}`}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <p className={`text-sm font-medium ${reached ? 'text-foreground' : 'text-muted-foreground'}`}>{s.label}</p>
                    {isCurrent && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {s.key === 'preparing' && 'Our kitchen is preparing your order…'}
                        {s.key === 'ready' && (isDelivery ? 'Waiting for the courier' : 'Pickup ready when you arrive')}
                        {s.key === 'courier_assigned' && `${providerBadge?.label || 'Courier'} is on the way to pick up your food`}
                        {s.key === 'on_the_way' && 'Your food is en route — almost there!'}
                        {s.key === 'delivered' && 'Enjoy your meal!'}
                      </p>
                    )}
                  </li>
                )
              })}
            </ol>
          </Card>

          {/* Courier tracking link */}
          {isDelivery && order.courier_tracking_url && (
            <a href={order.courier_tracking_url} target="_blank" rel="noreferrer" className="block">
              <Card className="p-4 mb-6 bg-card border-primary/40 hover:bg-accent/30 transition">
                <div className="flex items-center gap-3">
                  <Map className="h-5 w-5 text-primary" />
                  <span className="text-sm">Track courier in {providerBadge?.label}</span>
                </div>
              </Card>
            </a>
          )}

          {/* Items */}
          <Card className="p-6 bg-card">
            <h3 className="font-serif text-2xl mb-4">Order Details</h3>
            <div className="space-y-2 text-sm mb-4">
              {order.items.map(i => (
                <div key={i.id} className="flex justify-between">
                  <span>{i.quantity}× {lang === 'lt' ? i.name_lt : i.name}</span>
                  <span>€{(i.price * i.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-4 space-y-1 text-sm text-muted-foreground">
              <div className="flex justify-between"><span>Subtotal</span><span>€{order.subtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>VAT (21%)</span><span>€{order.tax.toFixed(2)}</span></div>
              {order.delivery_fee > 0 && <div className="flex justify-between"><span>Delivery</span><span>€{order.delivery_fee.toFixed(2)}</span></div>}
              {order.discount > 0 && <div className="flex justify-between text-primary"><span>Discount</span><span>-€{order.discount.toFixed(2)}</span></div>}
            </div>
            <div className="flex justify-between font-serif text-xl mt-4 pt-4 border-t border-border">
              <span>Total</span><span className="text-primary">€{order.total.toFixed(2)}</span>
            </div>
            <p className="mt-4 text-xs text-muted-foreground">Payment: {order.payment_method === 'cash' ? 'Cash on delivery / Pay at restaurant' : order.payment_method}</p>
          </Card>

          <p className="text-center text-xs text-muted-foreground mt-6">This page updates live every 5 seconds.</p>
          <div className="text-center mt-4">
            <Link href="/menu" className="text-sm text-primary hover:underline">Order again →</Link>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default OrderTrack
