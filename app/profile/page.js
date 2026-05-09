'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useApp } from '@/lib/AppContext'
import { toast } from 'sonner'
import { User, MapPin, Heart, Calendar, ShoppingBag, Trash2, Plus, ChevronRight, ListOrdered } from 'lucide-react'

const ACTIVE_STATUSES = new Set(['received', 'preparing', 'ready', 'out'])

function ProfilePage() {
  const router = useRouter()
  const { user, authChecked, refreshUser, logout, addToCart } = useApp()
  const [orders, setOrders] = useState([])
  const [reservations, setReservations] = useState([])
  const [favorites, setFavorites] = useState([])
  const [addresses, setAddresses] = useState([])
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ name: '', phone: '' })

  useEffect(() => {
    if (authChecked && !user) router.replace('/login?next=/profile')
  }, [user, authChecked, router])

  useEffect(() => {
    if (!user) return
    setForm({ name: user.name || '', phone: user.phone || '' })
    Promise.all([
      fetch('/api/users/me/orders', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/users/me/reservations', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/users/me/favorites', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
      fetch('/api/users/me/addresses', { credentials: 'include' }).then(r => r.ok ? r.json() : []),
    ]).then(([o, r, f, a]) => {
      setOrders(o)
      setReservations(r)
      setFavorites(f)
      setAddresses(a)
    })
  }, [user])

  const activeOrders = orders.filter(o => ACTIVE_STATUSES.has(o.status))
  const pastOrders = orders.filter(o => !ACTIVE_STATUSES.has(o.status))
  const upcomingRes = reservations.filter(r => new Date(`${r.date}T${r.time}`).getTime() > Date.now() && r.status !== 'cancelled')
  const pastRes = reservations.filter(r => new Date(`${r.date}T${r.time}`).getTime() <= Date.now() || r.status === 'cancelled')

  const saveProfile = async () => {
    try {
      const res = await fetch('/api/users/me', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) throw new Error('Failed to update')
      await refreshUser()
      setEditing(false)
      toast.success('Profile updated')
    } catch (e) { toast.error(e.message) }
  }

  const removeAddress = async (id) => {
    const res = await fetch(`/api/users/me/addresses/${id}`, { method: 'DELETE', credentials: 'include' })
    if (res.ok) { setAddresses(await res.json()); toast.success('Address removed') }
  }

  const reorder = (order) => {
    if (!order.items || order.items.length === 0) return
    order.items.forEach(i => addToCart({ id: i.id, name: i.name, name_lt: i.name_lt, price: i.price, image_url: i.image_url || i.image }, i.quantity))
    toast.success(`${order.items.length} item(s) added to your cart`)
    router.push('/cart')
  }

  const removeFavorite = async (id) => {
    await fetch('/api/users/me/favorites', {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dish_id: id }),
    })
    setFavorites(favorites.filter(f => f.id !== id))
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto py-12 max-w-5xl">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <p className="text-primary text-xs uppercase tracking-[0.4em] mb-2">My profile</p>
            <h1 className="font-serif text-5xl">Welcome, {user.name?.split(' ')[0] || 'guest'}</h1>
            <p className="text-sm text-muted-foreground mt-1">{user.email}</p>
          </div>
          <div className="flex gap-2">
            <Link href="/orders"><Button variant="outline"><ListOrdered className="h-4 w-4 mr-2" />My orders</Button></Link>
            <Button variant="outline" onClick={async () => { await logout(); router.push('/') }}>Log out</Button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <Card className="p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Active orders</p><p className="font-serif text-3xl">{activeOrders.length}</p></Card>
          <Card className="p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Total orders</p><p className="font-serif text-3xl">{orders.length}</p></Card>
          <Card className="p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Favorites</p><p className="font-serif text-3xl">{favorites.length}</p></Card>
          <Card className="p-4"><p className="text-xs uppercase tracking-wider text-muted-foreground">Reservations</p><p className="font-serif text-3xl">{reservations.length}</p></Card>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Account info */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-2xl flex items-center gap-2"><User className="h-5 w-5 text-primary" />Account</h2>
              {!editing ? (
                <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>Edit</Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => { setEditing(false); setForm({ name: user.name || '', phone: user.phone || '' }) }}>Cancel</Button>
                  <Button size="sm" onClick={saveProfile}>Save</Button>
                </div>
              )}
            </div>
            {!editing ? (
              <div className="space-y-2 text-sm">
                <div><span className="text-muted-foreground">Name: </span>{user.name}</div>
                <div><span className="text-muted-foreground">Email: </span>{user.email}</div>
                <div><span className="text-muted-foreground">Phone: </span>{user.phone || <span className="text-muted-foreground italic">not set</span>}</div>
              </div>
            ) : (
              <div className="space-y-3">
                <div><Label>Name</Label><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
                <div><Label>Phone</Label><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+370…" /></div>
              </div>
            )}
          </Card>

          {/* Active orders */}
          <Card className="p-6">
            <h2 className="font-serif text-2xl flex items-center gap-2 mb-4"><ShoppingBag className="h-5 w-5 text-primary" />Active orders</h2>
            {activeOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing in progress. Hungry? <Link href="/menu" className="text-primary font-semibold">Browse menu</Link></p>
            ) : (
              <div className="space-y-3">
                {activeOrders.slice(0, 3).map(o => (
                  <Link key={o.id} href={`/order/${o.order_number}`} className="flex items-center justify-between p-3 border border-border rounded-md hover:border-primary transition-colors">
                    <div>
                      <p className="font-semibold">#{o.order_number}</p>
                      <p className="text-xs text-muted-foreground capitalize">{o.type} · {o.status} · {o.items?.length || 0} item(s)</p>
                    </div>
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ))}
              </div>
            )}
          </Card>

          {/* Saved addresses */}
          <Card className="p-6 md:col-span-2">
            <h2 className="font-serif text-2xl flex items-center gap-2 mb-4"><MapPin className="h-5 w-5 text-primary" />Saved addresses</h2>
            {addresses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved addresses yet — we’ll save the address from your next delivery order automatically.</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-3">
                {addresses.map(a => (
                  <div key={a.id} className="p-3 border border-border rounded-md flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-semibold text-sm">{a.label || 'Home'}</p>
                      <p className="text-xs text-muted-foreground">{a.address}{a.city ? `, ${a.city}` : ''} {a.zip || ''}</p>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => removeAddress(a.id)} aria-label="Remove"><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Favorites */}
          <Card className="p-6 md:col-span-2">
            <h2 className="font-serif text-2xl flex items-center gap-2 mb-4"><Heart className="h-5 w-5 text-primary" />Favorites</h2>
            {favorites.length === 0 ? (
              <p className="text-sm text-muted-foreground">No favorites yet. Tap the heart on any dish to save it here.</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {favorites.map(f => (
                  <div key={f.id} className="p-3 border border-border rounded-md flex items-center gap-3">
                    {f.image_url && <img src={f.image_url} alt={f.name} className="w-14 h-14 rounded-md object-cover" />}
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm truncate">{f.name}</p>
                      <p className="text-xs text-primary">€{f.price?.toFixed(2)}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Button size="sm" onClick={() => { addToCart(f, 1); toast.success('Added to cart') }}><Plus className="h-3 w-3" /></Button>
                      <Button variant="ghost" size="icon" onClick={() => removeFavorite(f.id)} aria-label="Remove"><Heart className="h-4 w-4 fill-primary text-primary" /></Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Reservations */}
          <Card className="p-6 md:col-span-2">
            <h2 className="font-serif text-2xl flex items-center gap-2 mb-4"><Calendar className="h-5 w-5 text-primary" />Reservations</h2>
            {upcomingRes.length === 0 && pastRes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No reservations yet. <Link href="/reservations" className="text-primary font-semibold">Book a table</Link></p>
            ) : (
              <>
                {upcomingRes.length > 0 && (
                  <>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Upcoming</p>
                    <div className="space-y-2 mb-4">
                      {upcomingRes.map(r => (
                        <div key={r.id} className="p-3 border border-border rounded-md flex items-center justify-between">
                          <div>
                            <p className="font-semibold text-sm">{r.date} at {r.time}</p>
                            <p className="text-xs text-muted-foreground">{r.guests} guests · {r.confirmation}</p>
                          </div>
                          <span className="text-xs uppercase tracking-wider px-2 py-1 rounded bg-primary/10 text-primary">{r.status}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
                {pastRes.length > 0 && (
                  <>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Past</p>
                    <div className="space-y-2">
                      {pastRes.slice(0, 5).map(r => (
                        <div key={r.id} className="p-3 border border-border/60 rounded-md flex items-center justify-between text-muted-foreground">
                          <div>
                            <p className="font-semibold text-sm">{r.date} at {r.time}</p>
                            <p className="text-xs">{r.guests} guests · {r.confirmation}</p>
                          </div>
                          <span className="text-xs uppercase tracking-wider">{r.status}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </Card>
        </div>
      </div>
      <Footer />
    </div>
  )
}

export default ProfilePage
