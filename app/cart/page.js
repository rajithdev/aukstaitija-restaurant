'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import RequestWaiterButton from '@/components/RequestWaiterButton'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApp } from '@/lib/AppContext'
import { Plus, Minus, Trash2, ShoppingBag, Utensils, Banknote, CreditCard } from 'lucide-react'
import { toast } from 'sonner'

function CartPage() {
  const router = useRouter()
  const { t, lang, cart, updateQty, removeFromCart, cartSubtotal, clearCart, tableId, tableNumber, hydrated } = useApp()
  const [coupon, setCoupon] = useState('')
  const [discount, setDiscount] = useState(0)
  const [couponMsg, setCouponMsg] = useState('')
  const [form, setForm] = useState({ name: '' })
  const [notes, setNotes] = useState('')
  const [payment, setPayment] = useState('pay_at_table')
  const [tip, setTip] = useState(0)
  const [tipPercent, setTipPercent] = useState(0)
  const [customTip, setCustomTip] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [redirectingToOrder, setRedirectingToOrder] = useState(false)

  const tax = +(cartSubtotal * 0.21).toFixed(2)
  const tipAmount = tip
  const total = +(cartSubtotal + tax - discount + tipAmount).toFixed(2)

  // Bounce to /menu only when the cart is empty AND we're not redirecting
  useEffect(() => {
    if (hydrated && cart.length === 0 && !redirectingToOrder) router.push('/menu')
  }, [cart, router, hydrated, redirectingToOrder])

  const applyCoupon = () => {
    if (coupon.toUpperCase() === 'KAUNAS10') { setDiscount(+(cartSubtotal * 0.1).toFixed(2)); setCouponMsg('-10%') }
    else if (coupon.toUpperCase() === 'WELCOME5') { setDiscount(5); setCouponMsg('-€5') }
    else { setDiscount(0); setCouponMsg('Invalid code') }
  }

  const selectTip = (percent) => {
    if (percent === 'custom') {
      setTipPercent('custom')
      setTip(parseFloat(customTip) || 0)
    } else {
      setTipPercent(percent)
      const amount = +(cartSubtotal * (percent / 100)).toFixed(2)
      setTip(amount)
      setCustomTip('')
    }
  }

  const handleCustomTip = (value) => {
    setCustomTip(value)
    const amount = parseFloat(value) || 0
    setTip(amount)
    setTipPercent('custom')
  }

  const submit = async (e) => {
    e.preventDefault()
    // Name is optional for dine-in QR ordering
    setSubmitting(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cart,
          type: 'dine-in',
          table_id: tableId || null,
          customer: { name: form.name || 'Guest' },
          notes,
          payment_method: payment,
          discount,
          coupon,
          tip: tipAmount,
        })
      })
      const data = await res.json()
      if (data.id) {
        setRedirectingToOrder(true)
        toast.success('Order sent to kitchen!')
        router.push(`/order/${data.order_number || data.id}`)
        clearCart()
      } else {
        toast.error(data.error || 'Failed')
      }
    } finally { setSubmitting(false) }
  }

  if (cart.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto py-32 text-center">
          <ShoppingBag className="h-16 w-16 mx-auto text-muted-foreground mb-6" />
          <h1 className="font-serif text-4xl mb-4">{t('cart.empty')}</h1>
          <Link href="/menu"><Button size="lg">{t('cart.browse')}</Button></Link>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto py-10">
        <h1 className="font-serif text-5xl mb-4">Your Order</h1>
        {tableId && (
          <div className="mb-8 inline-flex items-center gap-3 bg-primary/15 border border-primary/30 px-6 py-3 rounded-full">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm">Dine-in at <strong className="font-serif text-lg">Table {tableNumber}</strong></span>
          </div>
        )}
        <form onSubmit={submit} className="grid lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-6">
            {/* Cart Items */}
            <div className="space-y-4">
              {cart.map(item => (
                <Card key={item.id} className="p-4 flex gap-4 bg-card">
                  <img src={item.image_url} alt={item.name} className="w-24 h-24 object-cover rounded-sm" />
                  <div className="flex-1">
                    <h3 className="font-serif text-xl">{lang === 'lt' ? item.name_lt : item.name}</h3>
                    <p className="text-sm text-muted-foreground">€{item.price.toFixed(2)} each</p>
                    {item.notes && <p className="text-xs text-muted-foreground italic mt-1">"{item.notes}"</p>}
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center border border-border rounded-md">
                        <button type="button" onClick={() => updateQty(item.id, item.quantity - 1)} className="w-8 h-8 hover:bg-accent"><Minus className="h-3 w-3 mx-auto" /></button>
                        <span className="w-10 text-center text-sm">{item.quantity}</span>
                        <button type="button" onClick={() => updateQty(item.id, item.quantity + 1)} className="w-8 h-8 hover:bg-accent"><Plus className="h-3 w-3 mx-auto" /></button>
                      </div>
                      <p className="font-serif text-xl text-primary">€{(item.price * item.quantity).toFixed(2)}</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => removeFromCart(item.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
                </Card>
              ))}
            </div>

            {/* Optional Name Field - Collapsed by default */}
            <Card className="p-6 bg-card">
              <details className="group">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium text-muted-foreground">Add your name (optional)</Label>
                    <span className="text-xs text-muted-foreground group-open:hidden">Expand</span>
                    <span className="text-xs text-muted-foreground hidden group-open:inline">Collapse</span>
                  </div>
                </summary>
                <div className="mt-3">
                  <Input 
                    value={form.name} 
                    onChange={e => setForm({ ...form, name: e.target.value })} 
                    placeholder="Your name"
                    className="h-11"
                  />
                  <p className="text-xs text-muted-foreground mt-2">Optional: Add your name so staff can address you personally.</p>
                </div>
              </details>
            </Card>

            {/* Order Notes */}
            <Card className="p-6 bg-card">
              <Label className="text-sm font-medium mb-3 block">Special Requests</Label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Any allergies, preferences, or special requests? (optional)"
                className="w-full h-24 px-3 py-2 bg-background border border-border rounded-md text-sm resize-none"
              />
            </Card>

            {/* Payment Preference */}
            <Card className="p-6 bg-card">
              <Label className="text-sm font-medium mb-3 block">Payment Method</Label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPayment('pay_at_table')}
                  className={`p-4 rounded-md border text-sm flex items-center gap-2 justify-center ${payment === 'pay_at_table' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}
                >
                  <Utensils className="h-4 w-4" /> Pay at Table
                </button>
                <button
                  type="button"
                  onClick={() => setPayment('cash')}
                  className={`p-4 rounded-md border text-sm flex items-center gap-2 justify-center ${payment === 'cash' ? 'border-primary bg-primary/10 text-primary' : 'border-border'}`}
                >
                  <Banknote className="h-4 w-4" /> Cash
                </button>
              </div>
            </Card>
          </div>

          {/* Sticky Summary */}
          <Card className="p-6 h-fit sticky top-24 bg-card">
            <h3 className="font-serif text-2xl mb-4">Order Summary</h3>
            
            {/* Pricing */}
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between"><span>Subtotal</span><span>€{cartSubtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>VAT (21%)</span><span>€{tax.toFixed(2)}</span></div>
              {discount > 0 && <div className="flex justify-between text-primary"><span>Discount</span><span>-€{discount.toFixed(2)}</span></div>}
            </div>

            {/* Coupon */}
            <div className="flex gap-2 mb-4">
              <input value={coupon} onChange={e => setCoupon(e.target.value)} placeholder="Coupon code" className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md" />
              <Button type="button" variant="outline" onClick={applyCoupon} size="sm">Apply</Button>
            </div>
            {couponMsg && <p className="text-xs text-muted-foreground mb-4">{couponMsg}</p>}

            {/* Tip Section */}
            <div className="border-t border-border pt-4 mb-4">
              <Label className="text-sm font-medium mb-3 block">Add a Tip (Optional)</Label>
              <div className="grid grid-cols-4 gap-2 mb-3">
                {[
                  { label: 'No Tip', value: 0 },
                  { label: '5%', value: 5 },
                  { label: '10%', value: 10 },
                  { label: '15%', value: 15 },
                ].map(option => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => selectTip(option.value)}
                    className={`px-3 py-2 text-xs rounded-md border transition-colors ${
                      tipPercent === option.value 
                        ? 'border-primary bg-primary/10 text-primary font-semibold' 
                        : 'border-border hover:bg-accent'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
              <Input
                type="number"
                step="0.01"
                value={customTip}
                onChange={e => handleCustomTip(e.target.value)}
                placeholder="Custom amount"
                className="h-9 text-sm"
              />
              {tip > 0 && (
                <p className="text-xs text-muted-foreground mt-2">Tip: €{tip.toFixed(2)}</p>
              )}
            </div>

            {/* Total */}
            <div className="border-t border-border pt-4 mb-4 flex justify-between font-serif text-xl">
              <span>Total</span><span className="text-primary">€{total.toFixed(2)}</span>
            </div>

            {/* Place Order */}
            <Button 
              type="submit" 
              size="lg" 
              className="w-full h-12" 
              disabled={submitting}
            >
              {submitting ? 'Placing Order...' : 'Place Order'}
            </Button>
          </Card>
        </form>
      </div>
      <Footer />
      <RequestWaiterButton />
    </div>
  )
}

export default CartPage
