'use client'
import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApp } from '@/lib/AppContext'
import { Truck, ShoppingBag, Utensils, Banknote, CreditCard, MapPin, Bike, Clock, Check } from 'lucide-react'
import { toast } from 'sonner'

const PROVIDERS = [
  { id: 'in_house', label: 'In-house Courier', sub: 'Our own riders, fastest for Kaunas centre', color: 'border-emerald-500 bg-emerald-500/10' },
  { id: 'wolt', label: 'Wolt', sub: 'We hand over your order to a Wolt courier', color: 'border-sky-500 bg-sky-500/10' },
  { id: 'bolt_food', label: 'Bolt Food', sub: 'We hand over your order to a Bolt Food courier', color: 'border-emerald-400 bg-emerald-400/10' },
]

function CheckoutInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { t, lang, cart, cartSubtotal, clearCart, tableId, tableNumber, setTableId, hydrated, user } = useApp()
  const [type, setType] = useState(tableId ? 'dine-in' : 'pickup')
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', city: 'Kaunas', zip: '' })
  const [notes, setNotes] = useState('')
  const [payment, setPayment] = useState('cash')
  const [submitting, setSubmitting] = useState(false)
  const [redirectingToOrder, setRedirectingToOrder] = useState(false)
  const [zones, setZones] = useState([])
  const [zoneId, setZoneId] = useState('')
  const [provider, setProvider] = useState('in_house')
  const [savedAddresses, setSavedAddresses] = useState([])
  const [selectedAddressId, setSelectedAddressId] = useState('new')

  const discount = parseFloat(params.get('discount') || '0')
  const coupon = params.get('coupon') || ''

  const tax = +(cartSubtotal * 0.21).toFixed(2)
  const selectedZone = zones.find(z => z.id === zoneId)
  const deliveryFee = type === 'delivery' ? (selectedZone?.fee ?? 3.50) : 0
  const total = +(cartSubtotal + tax + deliveryFee - discount).toFixed(2)

  // Bounce to /menu only when the cart is empty AND we're not in the middle of redirecting
  // the customer to their newly-created order page (which clears the cart on the way).
  useEffect(() => {
    if (hydrated && cart.length === 0 && !redirectingToOrder) router.push('/menu')
  }, [cart, router, hydrated, redirectingToOrder])
  useEffect(() => { if (tableId) setType('dine-in') }, [tableId])
  useEffect(() => {
    fetch('/api/delivery-zones').then(r => r.json()).then(d => {
      const arr = Array.isArray(d) ? d : []
      setZones(arr)
      if (arr.length > 0 && !zoneId) setZoneId(arr[0].id)
    })
  }, [])

  // Auto-fill the form from the logged-in user (only for non-dine-in flows so we
  // never accidentally lock the QR diner into using their account contact info).
  useEffect(() => {
    if (!user || tableId) return
    setForm(f => ({
      ...f,
      name: f.name || user.name || '',
      phone: f.phone || user.phone || '',
      email: f.email || user.email || '',
    }))
    // Pull saved addresses for the dropdown
    fetch('/api/users/me/addresses', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(list => {
        setSavedAddresses(list)
        // Auto-pick the most recent address when nothing is set yet
        if (list.length > 0) {
          const mostRecent = [...list].sort((a, b) =>
            new Date(b.last_used_at || b.created_at || 0).getTime() -
            new Date(a.last_used_at || a.created_at || 0).getTime()
          )[0]
          setSelectedAddressId(mostRecent.id)
          setForm(f => (f.address ? f : { ...f, address: mostRecent.address, city: mostRecent.city || 'Kaunas', zip: mostRecent.zip || '' }))
          if (mostRecent.delivery_zone_id) setZoneId(mostRecent.delivery_zone_id)
        }
      })
  }, [user, tableId])

  // When user picks a saved address from the dropdown, copy fields into the form
  const applySavedAddress = (id) => {
    setSelectedAddressId(id)
    if (id === 'new') {
      setForm(f => ({ ...f, address: '', city: 'Kaunas', zip: '' }))
      return
    }
    const a = savedAddresses.find(x => x.id === id)
    if (!a) return
    setForm(f => ({ ...f, address: a.address, city: a.city || 'Kaunas', zip: a.zip || '' }))
    if (a.delivery_zone_id) setZoneId(a.delivery_zone_id)
  }

  // Auto-detect zone from postal code
  useEffect(() => {
    if (!form.zip || zones.length === 0) return
    const match = zones.find(z => (z.postal_codes || []).includes(form.zip))
    if (match) setZoneId(match.id)
  }, [form.zip, zones])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name) { toast.error('Name is required'); return }
    if (!tableId && !form.phone) { toast.error('Phone is required'); return }
    if (type === 'delivery' && !form.address) { toast.error('Address required for delivery'); return }
    if (type === 'delivery' && !zoneId) { toast.error('Please select a delivery zone'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          type: tableId ? 'dine-in' : type,
          table_id: tableId || null,
          customer: { name: form.name, phone: form.phone, email: form.email },
          address: type === 'delivery' ? { address: form.address, city: form.city, zip: form.zip } : null,
          delivery_method: type === 'delivery' ? provider : null,
          delivery_zone_id: type === 'delivery' ? zoneId : null,
          notes,
          payment_method: payment,
          discount,
          coupon,
        })
      })
      const data = await res.json()
      if (data.id) {
        // Lock the cart-empty bouncer BEFORE clearing cart, so we head to the
        // order page instead of being redirected to /menu when the cart empties.
        setRedirectingToOrder(true)
        toast.success('Order sent to kitchen!')
        // Navigate first so the URL changes immediately, then clear the cart.
        router.push(`/order/${data.order_number || data.id}`)
        clearCart()
      } else {
        toast.error(data.error || 'Failed')
      }
    } finally { setSubmitting(false) }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto py-10">
        <h1 className="font-serif text-5xl mb-4">{t('checkout.title')}</h1>
        {tableId && (
          <div className="mb-8 inline-flex items-center gap-3 bg-primary/15 border border-primary/30 px-6 py-3 rounded-full">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm">Dine-in at <strong className="font-serif text-lg">Table {tableNumber}</strong> — order will be sent directly to the kitchen</span>
          </div>
        )}
        <form onSubmit={submit} className="grid lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-6">
            {/* Guest login banner — shown only to non-logged-in customers, never on QR dine-in */}
            {!user && !tableId && (
              <Card className="p-4 border-primary/30 bg-primary/5 flex flex-col sm:flex-row items-start sm:items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-semibold">Have an account?</p>
                  <p className="text-xs text-muted-foreground">Log in to auto-fill your details and link this order to your history. You can also continue as a guest below.</p>
                </div>
                <div className="flex gap-2">
                  <a href="/login?next=/checkout"><Button variant="outline" size="sm" type="button">Log in</Button></a>
                  <a href="/signup?next=/checkout"><Button size="sm" type="button">Sign up</Button></a>
                </div>
              </Card>
            )}
            {user && !tableId && (
              <p className="text-xs text-muted-foreground">Signed in as <strong>{user.email}</strong> — your details have been pre-filled.</p>
            )}

            {/* Type */}
            {!tableId && (
            <Card className="p-6 bg-card">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t('checkout.type')}</Label>
              <div className="grid grid-cols-3 gap-3 mt-3">
                {[
                  { v: 'pickup', l: t('checkout.pickup'), icon: ShoppingBag },
                  { v: 'delivery', l: t('checkout.delivery'), icon: Truck },
                  { v: 'dine-in', l: t('checkout.dinein'), icon: Utensils },
                ].map(o => {
                  const Icon = o.icon
                  return (
                    <button key={o.v} type="button" onClick={() => setType(o.v)} className={`p-4 rounded-md border text-sm flex flex-col items-center gap-2 ${type === o.v ? 'border-primary bg-primary/10' : 'border-border'}`}>
                      <Icon className="h-5 w-5" /> {o.l}
                    </button>
                  )
                })}
              </div>
            </Card>
            )}

            {/* Customer info */}
            <Card className="p-6 bg-card grid sm:grid-cols-2 gap-4">
              <div><Label>{t('checkout.name')} *</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></div>
              <div><Label>{t('checkout.phone')} {tableId ? '' : '*'}</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required={!tableId} /></div>
              <div className="sm:col-span-2"><Label>{t('checkout.email')}</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              {type === 'delivery' && (
                <>
                  {user && savedAddresses.length > 0 && (
                    <div className="sm:col-span-2">
                      <Label>Saved addresses</Label>
                      <select
                        value={selectedAddressId}
                        onChange={e => applySavedAddress(e.target.value)}
                        className="w-full mt-1 h-10 px-3 bg-background border border-border rounded-md text-sm"
                      >
                        {savedAddresses.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.label || 'Home'} — {a.address}{a.city ? `, ${a.city}` : ''}
                          </option>
                        ))}
                        <option value="new">+ Use a new address</option>
                      </select>
                    </div>
                  )}
                  <div className="sm:col-span-2"><Label>{t('checkout.address')} *</Label><Input value={form.address} onChange={e => { setForm({ ...form, address: e.target.value }); setSelectedAddressId('new') }} placeholder="Vilniaus g. 24, apt 5" /></div>
                  <div><Label>{t('checkout.city')}</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                  <div><Label>{t('checkout.zip')}</Label><Input value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} placeholder="44280" /></div>
                </>
              )}
            </Card>

            {/* Delivery zone & provider */}
            {type === 'delivery' && !tableId && (
              <Card className="p-6 bg-card">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2"><MapPin className="h-3 w-3" /> Delivery zone</Label>
                <div className="grid sm:grid-cols-3 gap-3 mt-3">
                  {zones.map(z => (
                    <button key={z.id} type="button" onClick={() => setZoneId(z.id)}
                      className={`p-4 rounded-md border text-left transition ${zoneId === z.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-accent/30'}`}>
                      <div className="flex items-baseline justify-between mb-1">
                        <span className="font-serif text-lg">{z.name}</span>
                        <span className="font-serif text-xl text-primary">€{z.fee.toFixed(2)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-1"><Clock className="h-3 w-3" /> ~{z.eta_minutes} min</p>
                    </button>
                  ))}
                </div>
                {zones.length === 0 && <p className="text-sm text-muted-foreground mt-3">No active delivery zones.</p>}

                <Label className="text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2 mt-6"><Bike className="h-3 w-3" /> Courier service</Label>
                <p className="text-xs text-muted-foreground mt-1 mb-3">Choose how we'll get your food to you. We handle pickup & quality, the courier handles the ride.</p>
                <div className="grid sm:grid-cols-3 gap-3">
                  {PROVIDERS.map(p => (
                    <button key={p.id} type="button" onClick={() => setProvider(p.id)}
                      className={`p-4 rounded-md border text-left transition ${provider === p.id ? p.color + ' border-2' : 'border-border hover:bg-accent/30'}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">{p.label}</span>
                        {provider === p.id && <Check className="h-4 w-4 text-primary" />}
                      </div>
                      <p className="text-[11px] text-muted-foreground leading-snug">{p.sub}</p>
                    </button>
                  ))}
                </div>
              </Card>
            )}

            {/* Notes */}
            <Card className="p-6 bg-card">
              <Label>{t('checkout.notes')}</Label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full mt-2 p-3 bg-background border border-border rounded-md text-sm min-h-[80px]" />
            </Card>

            {/* Payment */}
            <Card className="p-6 bg-card">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">{t('checkout.payment')}</Label>
              <div className="mt-3 space-y-2">
                <button type="button" onClick={() => setPayment('cash')} className={`w-full p-4 rounded-md border text-left flex items-center gap-3 ${payment === 'cash' ? 'border-primary bg-primary/10' : 'border-border'}`}>
                  <Banknote className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">{t('checkout.cash')}</p>
                    <p className="text-xs text-muted-foreground">Pay in cash or card on arrival</p>
                  </div>
                </button>
                <div className="w-full p-4 rounded-md border border-dashed border-border text-muted-foreground flex items-center gap-3 opacity-60">
                  <CreditCard className="h-5 w-5" />
                  <div>
                    <p className="text-sm">Stripe / PayPal / Revolut — coming soon</p>
                  </div>
                </div>
              </div>
            </Card>
          </div>

          <Card className="p-6 h-fit sticky top-24 bg-card">
            <h3 className="font-serif text-2xl mb-4">Summary</h3>
            <div className="space-y-2 text-sm mb-4 max-h-60 overflow-y-auto">
              {cart.map(i => (
                <div key={i.id} className="flex justify-between">
                  <span>{i.quantity}× {lang === 'lt' ? i.name_lt : i.name}</span>
                  <span>€{(i.price * i.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
            <div className="border-t border-border pt-4 space-y-2 text-sm">
              <div className="flex justify-between"><span>{t('cart.subtotal')}</span><span>€{cartSubtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>{t('cart.tax')}</span><span>€{tax.toFixed(2)}</span></div>
              {deliveryFee > 0 && <div className="flex justify-between"><span>{t('cart.delivery')}</span><span>€{deliveryFee.toFixed(2)}</span></div>}
              {discount > 0 && <div className="flex justify-between text-primary"><span>Discount</span><span>-€{discount.toFixed(2)}</span></div>}
            </div>
            <div className="flex justify-between font-serif text-2xl mt-4 pt-4 border-t border-border">
              <span>{t('cart.total')}</span><span className="text-primary">€{total.toFixed(2)}</span>
            </div>
            <Button type="submit" size="lg" className="w-full h-12 mt-6" disabled={submitting}>
              {submitting ? t('checkout.placing') : t('checkout.place')}
            </Button>
          </Card>
        </form>
      </div>
      <Footer />
    </div>
  )
}

function CheckoutPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <CheckoutInner />
    </Suspense>
  )
}

export default CheckoutPage
