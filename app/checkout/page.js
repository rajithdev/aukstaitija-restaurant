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
import { Truck, ShoppingBag, Utensils, Banknote, CreditCard } from 'lucide-react'
import { toast } from 'sonner'

function CheckoutInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { t, lang, cart, cartSubtotal, clearCart, tableId, tableNumber, setTableId } = useApp()
  const [type, setType] = useState(tableId ? 'dine-in' : 'pickup')
  const [form, setForm] = useState({ name: '', phone: '', email: '', address: '', city: 'Kaunas', zip: '' })
  const [notes, setNotes] = useState('')
  const [payment, setPayment] = useState('cash')
  const [submitting, setSubmitting] = useState(false)

  const discount = parseFloat(params.get('discount') || '0')
  const coupon = params.get('coupon') || ''

  const tax = +(cartSubtotal * 0.21).toFixed(2)
  const deliveryFee = type === 'delivery' ? 3.50 : 0
  const total = +(cartSubtotal + tax + deliveryFee - discount).toFixed(2)

  useEffect(() => { if (cart.length === 0) router.push('/menu') }, [cart, router])
  useEffect(() => { if (tableId) setType('dine-in') }, [tableId])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name) { toast.error('Name is required'); return }
    if (!tableId && !form.phone) { toast.error('Phone is required'); return }
    if (type === 'delivery' && !form.address) { toast.error('Address required for delivery'); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          type: tableId ? 'dine-in' : type,
          table_id: tableId || null,
          customer: { name: form.name, phone: form.phone, email: form.email },
          address: type === 'delivery' ? { address: form.address, city: form.city, zip: form.zip } : null,
          notes,
          payment_method: payment,
          discount,
          coupon,
        })
      })
      const data = await res.json()
      if (data.id) {
        toast.success('Order sent to kitchen!')
        clearCart()
        router.push(`/order/${data.id}`)
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
              <div><Label>{t('checkout.phone')} *</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required /></div>
              <div className="sm:col-span-2"><Label>{t('checkout.email')}</Label><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
              {type === 'delivery' && (
                <>
                  <div className="sm:col-span-2"><Label>{t('checkout.address')} *</Label><Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Vilniaus g. 24, apt 5" /></div>
                  <div><Label>{t('checkout.city')}</Label><Input value={form.city} onChange={e => setForm({ ...form, city: e.target.value })} /></div>
                  <div><Label>{t('checkout.zip')}</Label><Input value={form.zip} onChange={e => setForm({ ...form, zip: e.target.value })} /></div>
                </>
              )}
            </Card>

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
