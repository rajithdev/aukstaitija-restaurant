'use client'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useApp } from '@/lib/AppContext'
import { Plus, Minus, Trash2, ShoppingBag } from 'lucide-react'
import { useState } from 'react'

function CartPage() {
  const { t, lang, cart, updateQty, removeFromCart, cartSubtotal } = useApp()
  const [coupon, setCoupon] = useState('')
  const [discount, setDiscount] = useState(0)
  const [couponMsg, setCouponMsg] = useState('')

  const tax = +(cartSubtotal * 0.21).toFixed(2)
  const total = +(cartSubtotal + tax - discount).toFixed(2)

  const applyCoupon = () => {
    if (coupon.toUpperCase() === 'KAUNAS10') { setDiscount(+(cartSubtotal * 0.1).toFixed(2)); setCouponMsg('-10%') }
    else if (coupon.toUpperCase() === 'WELCOME5') { setDiscount(5); setCouponMsg('-€5') }
    else { setDiscount(0); setCouponMsg('Invalid code') }
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
        <h1 className="font-serif text-5xl mb-10">{t('cart.title')}</h1>
        <div className="grid lg:grid-cols-3 gap-10">
          <div className="lg:col-span-2 space-y-4">
            {cart.map(item => (
              <Card key={item.id} className="p-4 flex gap-4 bg-card">
                <img src={item.image_url} alt={item.name} className="w-24 h-24 object-cover rounded-sm" />
                <div className="flex-1">
                  <h3 className="font-serif text-xl">{lang === 'lt' ? item.name_lt : item.name}</h3>
                  <p className="text-sm text-muted-foreground">€{item.price.toFixed(2)} each</p>
                  {item.notes && <p className="text-xs text-muted-foreground italic mt-1">"{item.notes}"</p>}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center border border-border rounded-md">
                      <button onClick={() => updateQty(item.id, item.quantity - 1)} className="w-8 h-8 hover:bg-accent"><Minus className="h-3 w-3 mx-auto" /></button>
                      <span className="w-10 text-center text-sm">{item.quantity}</span>
                      <button onClick={() => updateQty(item.id, item.quantity + 1)} className="w-8 h-8 hover:bg-accent"><Plus className="h-3 w-3 mx-auto" /></button>
                    </div>
                    <p className="font-serif text-xl text-primary">€{(item.price * item.quantity).toFixed(2)}</p>
                  </div>
                </div>
                <button onClick={() => removeFromCart(item.id)} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /></button>
              </Card>
            ))}
          </div>

          <Card className="p-6 h-fit sticky top-24 bg-card">
            <h3 className="font-serif text-2xl mb-4">Summary</h3>
            <div className="space-y-2 text-sm mb-4">
              <div className="flex justify-between"><span>{t('cart.subtotal')}</span><span>€{cartSubtotal.toFixed(2)}</span></div>
              <div className="flex justify-between"><span>{t('cart.tax')}</span><span>€{tax.toFixed(2)}</span></div>
              {discount > 0 && <div className="flex justify-between text-primary"><span>Discount</span><span>-€{discount.toFixed(2)}</span></div>}
            </div>
            <div className="flex gap-2 mb-4">
              <input value={coupon} onChange={e => setCoupon(e.target.value)} placeholder={t('cart.coupon')} className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md" />
              <Button variant="outline" onClick={applyCoupon}>{t('cart.apply')}</Button>
            </div>
            {couponMsg && <p className="text-xs text-muted-foreground mb-4">{couponMsg} — try KAUNAS10 or WELCOME5</p>}
            <div className="border-t border-border pt-4 mb-4 flex justify-between font-serif text-xl">
              <span>{t('cart.total')}</span><span className="text-primary">€{total.toFixed(2)}</span>
            </div>
            <Link href={`/checkout?discount=${discount}&coupon=${coupon}`}>
              <Button size="lg" className="w-full h-12">Place Order</Button>
            </Link>
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default CartPage
