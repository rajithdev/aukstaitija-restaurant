'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/AppContext'
import { toast } from 'sonner'
import { Repeat, Eye, ShoppingBag } from 'lucide-react'

const ACTIVE_STATUSES = new Set(['received', 'preparing', 'ready', 'out'])

function OrdersPage() {
  const router = useRouter()
  const { user, authChecked, addToCart } = useApp()
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('active')

  useEffect(() => {
    if (authChecked && !user) router.replace('/login?next=/orders')
  }, [user, authChecked, router])

  useEffect(() => {
    if (!user) return
    fetch('/api/users/me/orders', { credentials: 'include' })
      .then(r => r.ok ? r.json() : [])
      .then(setOrders)
      .finally(() => setLoading(false))
  }, [user])

  const activeOrders = orders.filter(o => ACTIVE_STATUSES.has(o.status))
  const pastOrders = orders.filter(o => !ACTIVE_STATUSES.has(o.status))

  const reorder = (order) => {
    if (!order.items || order.items.length === 0) return
    order.items.forEach(i => addToCart({ id: i.id, name: i.name, name_lt: i.name_lt, price: i.price, image_url: i.image_url || i.image }, i.quantity))
    toast.success(`${order.items.length} item(s) added to your cart`)
    router.push('/cart')
  }

  const list = tab === 'active' ? activeOrders : pastOrders

  if (!user) return null

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto py-12 max-w-4xl">
        <p className="text-primary text-xs uppercase tracking-[0.4em] mb-2">Order history</p>
        <h1 className="font-serif text-5xl mb-6">My orders</h1>

        <div className="flex gap-2 mb-6">
          <Button variant={tab === 'active' ? 'default' : 'outline'} onClick={() => setTab('active')}>Active ({activeOrders.length})</Button>
          <Button variant={tab === 'past' ? 'default' : 'outline'} onClick={() => setTab('past')}>Past ({pastOrders.length})</Button>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading…</p>
        ) : list.length === 0 ? (
          <Card className="p-8 text-center">
            <ShoppingBag className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground mb-4">{tab === 'active' ? 'No orders in progress' : 'No past orders yet'}</p>
            <Link href="/menu"><Button>Browse menu</Button></Link>
          </Card>
        ) : (
          <div className="space-y-3">
            {list.map(o => (
              <Card key={o.id} className="p-5">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <p className="font-serif text-2xl">#{o.order_number}</p>
                      <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded bg-primary/10 text-primary">{o.status}</span>
                      <span className="text-xs uppercase tracking-wider text-muted-foreground">{o.type}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{new Date(o.created_at).toLocaleString()}</p>
                    <div className="text-sm mt-2 text-muted-foreground">
                      {o.items?.slice(0, 3).map(i => `${i.quantity}× ${i.name}`).join(', ')}
                      {o.items?.length > 3 ? `, +${o.items.length - 3} more` : ''}
                    </div>
                    <p className="font-semibold mt-1">€{o.total?.toFixed(2)}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/order/${o.order_number}`}><Button variant="outline" size="sm"><Eye className="h-4 w-4 mr-1" />View</Button></Link>
                    <Button size="sm" onClick={() => reorder(o)}><Repeat className="h-4 w-4 mr-1" />Reorder</Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      <Footer />
    </div>
  )
}

export default OrdersPage
