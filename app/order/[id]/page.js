'use client'
import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import RequestWaiterButton from '@/components/RequestWaiterButton'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/AppContext'
import { CheckCircle2, ChefHat, Clock, Truck, PackageCheck, Bike, Map, Utensils, Soup, Hand, Sparkles, X } from 'lucide-react'

// Stage definitions are language-agnostic — each has a stable `key` plus the
// translation `path` under track_stage.<kind>.<key>. Display labels come from
// the i18n layer at render time so EN/LT switching is instant.
const STAGES_DELIVERY = [
  { key: 'received', icon: Clock },
  { key: 'preparing', icon: ChefHat },
  { key: 'courier_requested', icon: Bike },
  { key: 'ready', icon: PackageCheck },
  { key: 'picked_up', icon: Truck },
  { key: 'delivered', icon: CheckCircle2 },
]

const STAGES_PICKUP = [
  { key: 'received', icon: Clock },
  { key: 'preparing', icon: ChefHat },
  { key: 'ready', icon: PackageCheck },
  { key: 'delivered', icon: CheckCircle2 },
]

const STAGES_DINEIN = [
  { key: 'received', icon: Clock },
  { key: 'in_kitchen', icon: Soup },
  { key: 'ready', icon: Utensils },
]

const PROVIDER_BADGE = {
  in_house: { label: 'In-house Courier', color: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  wolt: { label: 'Wolt', color: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
  bolt_food: { label: 'Bolt Food', color: 'bg-emerald-400/15 text-emerald-700 dark:text-emerald-300' },
}

// Heuristic for the "kitchen actively cooking" look: once accepted_at is more
// than 45 seconds in the past we consider the order to have moved from
// "Confirmed" to "In the kitchen" so the dine-in timeline doesn't sit on
// "Confirmed" while staff are clearly cooking.
const COOKING_BUMP_MS = 45 * 1000

function progressIndex(order, kind) {
  if (order.status === 'cancelled') return -1
  if (kind === 'delivery') {
    const dStatus = order.delivery_status
    if (order.status === 'delivered' || dStatus === 'delivered') return 5
    if (dStatus === 'picked_up' || dStatus === 'on_the_way' || order.status === 'out') return 4
    if (order.status === 'ready') return 3
    if (dStatus === 'courier_requested' || dStatus === 'courier_assigned') return 2
    if (order.status === 'preparing') return 1
    return 0
  }
  if (kind === 'dinein') {
    // Simplified 3-stage flow: received → in_kitchen → ready
    if (order.serve_status === 'served' || order.status === 'delivered' || order.status === 'ready') return 2
    if (order.status === 'preparing') return 1
    return 0
  }
  // pickup
  if (order.status === 'delivered') return 3
  if (order.status === 'ready') return 2
  if (order.status === 'preparing') return 1
  return 0
}

function OrderTrack() {
  const params = useParams()
  const { t, lang } = useApp()
  const [order, setOrder] = useState(null)
  const [error, setError] = useState(false)
  const [showReservationPromo, setShowReservationPromo] = useState(true)

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
  const isDineIn = !isDelivery && (order.order_type === 'dine_in' || order.type === 'dine-in' || !!order.table_id)
  const kind = isDelivery ? 'delivery' : (isDineIn ? 'dinein' : 'pickup')
  const stages = kind === 'delivery' ? STAGES_DELIVERY : kind === 'dinein' ? STAGES_DINEIN : STAGES_PICKUP
  const currentIdx = progressIndex(order, kind)
  const providerBadge = isDelivery ? PROVIDER_BADGE[order.delivery_method || order.delivery_provider || 'in_house'] : null
  const courierAlreadyRequested = isDelivery && ['courier_requested', 'courier_assigned', 'picked_up', 'on_the_way', 'delivered'].includes(order.delivery_status)
  const isReadyWaitingCourier = isDelivery && order.status === 'ready' && order.delivery_status !== 'picked_up' && order.delivery_status !== 'on_the_way' && order.delivery_status !== 'delivered'

  let headlineLabel
  if (currentIdx < 0) {
    headlineLabel = t('track_stage.cancelled') || 'Cancelled'
  } else if (isDelivery) {
    headlineLabel = isReadyWaitingCourier && !courierAlreadyRequested
      ? t('track_stage.headline_calling_courier')
      : isReadyWaitingCourier && courierAlreadyRequested
        ? t('track_stage.headline_waiting_courier')
        : t(`track_stage.${kind}.${stages[currentIdx].key}`)
  } else if (isDineIn && order.waiter_picked_up_at && order.serve_status !== 'served' && order.status === 'ready') {
    // Waiter is walking the plate to the table — surface that in the headline.
    headlineLabel = t('track_stage.dinein.plated_hint_on_way')
  } else {
    headlineLabel = t(`track_stage.${kind}.${stages[currentIdx].key}`)
  }

  // Pick a per-stage hint based on the current key. Delivery's "ready" stage
  // has two variants depending on whether the courier has been called. For
  // Warm, reassuring hint text for dine-in stages
  const hintFor = (s) => {
    if (kind === 'delivery' && s.key === 'ready') {
      return courierAlreadyRequested
        ? t('track_stage.delivery.ready_hint_waiting')
        : t('track_stage.delivery.ready_hint_calling')
    }
    if (kind === 'delivery' && s.key === 'courier_requested') {
      const provider = providerBadge?.label || 'Courier'
      const tpl = t('track_stage.delivery.courier_requested_hint')
      return tpl.replace(/^Courier|^Kurjeris/, provider)
    }
    if (kind === 'dinein') {
      if (s.key === 'received') return 'We have your order.'
      if (s.key === 'in_kitchen') return 'Our chefs are preparing your dishes.'
      if (s.key === 'ready') return 'Your food is ready and on the way to your table.'
    }
    return t(`track_stage.${kind}.${s.key}_hint`)
  }

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
            {isDineIn && order.table_number && (
              <div className="inline-flex items-center gap-2 mt-1">
                <span className="text-xs uppercase tracking-wider px-3 py-1 rounded-full bg-primary/15 text-primary">
                  <Utensils className="h-3 w-3 inline mr-1" /> {t('track_stage.table')} {order.table_number}
                </span>
              </div>
            )}
            {!isDelivery && !isDineIn && (
              <div className="inline-flex items-center gap-2 mt-1">
                <span className="text-xs uppercase tracking-wider px-3 py-1 rounded-full bg-muted text-muted-foreground">
                  <PackageCheck className="h-3 w-3 inline mr-1" /> {t('track_stage.pickup_badge')}
                </span>
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
                // Use custom label for "ready" stage in dine-in, otherwise use translation
                const label = (kind === 'dinein' && s.key === 'ready') 
                  ? 'Food ready — on the way to your table'
                  : t(`track_stage.${kind}.${s.key}`)
                return (
                  <li key={s.key} className="ml-6">
                    <div className={`absolute -left-3 w-6 h-6 rounded-full flex items-center justify-center ${reached ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'} ${isCurrent ? 'ring-4 ring-primary/30 animate-pulse' : ''}`}>
                      <Icon className="h-3 w-3" />
                    </div>
                    <p className={`text-sm font-medium ${reached ? 'text-foreground' : 'text-muted-foreground'}`}>{label}</p>
                    {isCurrent && (
                      <p className="text-xs text-muted-foreground mt-0.5">{hintFor(s)}</p>
                    )}
                  </li>
                )
              })}
            </ol>
          </Card>

          {/* Subtle Reservation Promotion - Concierge Style */}
          {showReservationPromo && isDineIn && (
            <Card className="relative p-6 mb-6 bg-gradient-to-br from-amber-950/30 via-zinc-900/50 to-zinc-900/50 border-amber-500/20 overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500/5 to-transparent opacity-50" />
              <button
                onClick={() => setShowReservationPromo(false)}
                className="absolute top-3 right-3 p-1 rounded-full hover:bg-zinc-800/50 text-zinc-500 hover:text-zinc-400 transition-colors z-10"
                aria-label="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
              
              <div className="relative">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-amber-500/15 flex items-center justify-center">
                    <Sparkles className="h-5 w-5 text-amber-400" />
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif text-xl text-zinc-100 mb-1.5">Planning another visit?</h3>
                    <p className="text-sm text-zinc-400 leading-relaxed mb-4">
                      Reserve your next table online anytime for a seamless dining experience.
                    </p>
                    
                    {/* Optional highlights */}
                    <div className="flex flex-wrap gap-3 mb-5">
                      <span className="flex items-center gap-1.5 text-xs text-amber-300/90">
                        <Sparkles className="h-3 w-3" />
                        Window seating
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-amber-300/90">
                        <Sparkles className="h-3 w-3" />
                        Romantic dinners
                      </span>
                      <span className="flex items-center gap-1.5 text-xs text-amber-300/90">
                        <Sparkles className="h-3 w-3" />
                        Weekend reservations
                      </span>
                    </div>
                    
                    {/* CTAs */}
                    <div className="flex flex-wrap gap-3">
                      <Link href="/reservations">
                        <Button className="bg-amber-600 hover:bg-amber-500 text-white shadow-lg shadow-amber-500/20 h-9">
                          Reserve a Table
                        </Button>
                      </Link>
                      <Link href="/reservation-lookup">
                        <Button variant="ghost" className="text-zinc-400 hover:text-zinc-300 hover:bg-zinc-800/50 h-9">
                          Browse Reservations
                        </Button>
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}

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
      <RequestWaiterButton />
    </div>
  )
}

export default OrderTrack
