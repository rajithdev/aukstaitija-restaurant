'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { useApp } from '@/lib/AppContext'
import { LayoutDashboard, Utensils, ShoppingBag, CalendarDays, BarChart3, Plus, Edit, Trash2, X, LogOut, ChefHat, Bike, Truck } from 'lucide-react'
import { toast } from 'sonner'
import DispatchModal from '@/components/DispatchModal'

function AdminPage() {
  const { t } = useApp()
  const [token, setToken] = useState('')
  const [pwd, setPwd] = useState('')
  const [tab, setTab] = useState('analytics')
  const [analytics, setAnalytics] = useState(null)
  const [dishes, setDishes] = useState([])
  const [orders, setOrders] = useState([])
  const [reservations, setReservations] = useState([])
  const [editing, setEditing] = useState(null)
  const [showDishForm, setShowDishForm] = useState(false)
  const [dispatchOrder, setDispatchOrder] = useState(null)

  useEffect(() => {
    const t = localStorage.getItem('aukstaitija_admin_token') || ''
    if (t) setToken(t)
  }, [])

  const login = async (e) => {
    e.preventDefault()
    const res = await fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pwd }) })
    const data = await res.json()
    if (data.token) {
      setToken(data.token)
      localStorage.setItem('aukstaitija_admin_token', data.token)
      toast.success('Welcome')
    } else { toast.error('Invalid password') }
  }

  const logout = () => { setToken(''); localStorage.removeItem('aukstaitija_admin_token') }

  const adminFetch = async (url, options = {}) => {
    const res = await fetch(url, { ...options, headers: { ...(options.headers || {}), 'x-admin-token': token, 'Content-Type': 'application/json' } })
    if (res.status === 401) { logout(); return null }
    return res.json()
  }

  const loadAll = async () => {
    const [a, d, o, r] = await Promise.all([
      adminFetch('/api/admin/analytics'),
      adminFetch('/api/dishes'),
      adminFetch('/api/orders'),
      adminFetch('/api/reservations'),
    ])
    if (a) setAnalytics(a)
    if (d) setDishes(d)
    if (o) setOrders(o)
    if (r) setReservations(r)
  }

  useEffect(() => { if (token) loadAll() }, [token])

  const updateOrderStatus = async (id, status) => {
    await adminFetch(`/api/orders/${id}`, { method: 'PUT', body: JSON.stringify({ status }) })
    loadAll()
  }

  const updateReservationStatus = async (id, status) => {
    await adminFetch(`/api/reservations/${id}`, { method: 'PUT', body: JSON.stringify({ status }) })
    loadAll()
  }

  const saveDish = async (dish) => {
    if (dish.id) {
      await adminFetch(`/api/dishes/${dish.id}`, { method: 'PUT', body: JSON.stringify(dish) })
    } else {
      await adminFetch('/api/dishes', { method: 'POST', body: JSON.stringify(dish) })
    }
    setShowDishForm(false); setEditing(null); loadAll(); toast.success('Saved')
  }

  const deleteDish = async (id) => {
    if (!confirm('Delete this dish?')) return
    await adminFetch(`/api/dishes/${id}`, { method: 'DELETE' })
    loadAll()
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Navbar />
        <div className="flex-1 container mx-auto py-20 max-w-md">
          <h1 className="font-serif text-4xl mb-6 text-center">{t('admin.login')}</h1>
          <Card className="p-6">
            <form onSubmit={login} className="space-y-4">
              <div><Label>{t('admin.password')}</Label><Input type="password" value={pwd} onChange={e => setPwd(e.target.value)} className="mt-2" required /></div>
              <Button type="submit" className="w-full h-11">{t('admin.signin')}</Button>
              <p className="text-xs text-muted-foreground text-center">Demo password: <code className="text-primary">admin123</code></p>
            </form>
          </Card>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <p className="text-primary text-xs uppercase tracking-[0.4em] mb-2">Operations</p>
            <h1 className="font-serif text-4xl">{t('admin.title')}</h1>
          </div>
          <div className="flex gap-2">
            <Link href="/admin/floor"><Button variant="outline"><LayoutDashboard className="h-4 w-4 mr-2" /> Floor Map</Button></Link>
            <Link href="/kitchen"><Button variant="outline"><ChefHat className="h-4 w-4 mr-2" /> Kitchen Live</Button></Link>
            <Button variant="outline" onClick={logout}><LogOut className="h-4 w-4 mr-2" /> Logout</Button>
          </div>
        </div>

        <div className="flex gap-2 border-b border-border mb-8 overflow-x-auto">
          {[
            { k: 'analytics', l: t('admin.analytics'), icon: BarChart3 },
            { k: 'dishes', l: t('admin.dishes'), icon: Utensils },
            { k: 'orders', l: t('admin.orders'), icon: ShoppingBag },
            { k: 'reservations', l: t('admin.reservations'), icon: CalendarDays },
          ].map(it => {
            const Icon = it.icon
            return (
              <button key={it.k} onClick={() => setTab(it.k)} className={`px-5 py-3 text-sm flex items-center gap-2 border-b-2 transition ${tab === it.k ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
                <Icon className="h-4 w-4" /> {it.l}
              </button>
            )
          })}
        </div>

        {tab === 'analytics' && analytics && (
          <div className="space-y-6">
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-6"><p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t('admin.revenue')}</p><p className="font-serif text-3xl text-primary">€{analytics.total_revenue.toFixed(2)}</p></Card>
              <Card className="p-6"><p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t('admin.today_rev')}</p><p className="font-serif text-3xl text-primary">€{analytics.today_revenue.toFixed(2)}</p></Card>
              <Card className="p-6"><p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t('admin.orders_count')}</p><p className="font-serif text-3xl">{analytics.total_orders}</p><p className="text-xs text-muted-foreground mt-1">Today: {analytics.today_orders}</p></Card>
              <Card className="p-6"><p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{t('admin.avg')}</p><p className="font-serif text-3xl">€{analytics.avg_order_value.toFixed(2)}</p></Card>
            </div>
            <Card className="p-6">
              <h3 className="font-serif text-2xl mb-4">{t('admin.top')}</h3>
              {analytics.top_dishes.length === 0 ? <p className="text-sm text-muted-foreground">No data yet — place an order to see analytics</p> : (
                <ul className="space-y-2">
                  {analytics.top_dishes.map((d, i) => (
                    <li key={d.name} className="flex justify-between items-center p-3 bg-muted/40 rounded-md">
                      <span className="flex items-center gap-3"><span className="font-serif text-2xl text-primary">#{i+1}</span> {d.name}</span>
                      <span className="text-sm text-muted-foreground">{d.count} sold</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            {analytics.delivery && (
              <Card className="p-6">
                <h3 className="font-serif text-2xl mb-4 flex items-center gap-2"><Bike className="h-5 w-5 text-primary" /> Delivery Performance</h3>
                <div className="grid sm:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Total Delivery Orders</p>
                    <p className="font-serif text-3xl">{analytics.delivery.total_delivery_orders}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">In-house</p>
                    <p className="font-serif text-3xl text-emerald-600 dark:text-emerald-400">{analytics.delivery.provider_counts.in_house}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Wolt</p>
                    <p className="font-serif text-3xl text-sky-600 dark:text-sky-400">{analytics.delivery.provider_counts.wolt}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Bolt Food</p>
                    <p className="font-serif text-3xl text-emerald-500">{analytics.delivery.provider_counts.bolt_food}</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-4">
                  Avg delivery time (received → delivered): <span className="font-semibold text-foreground">{analytics.delivery.avg_delivery_minutes} min</span> over {analytics.delivery.delivered_count} delivered orders.
                </p>
              </Card>
            )}
          </div>
        )}

        {tab === 'dishes' && (
          <div>
            <div className="flex justify-between mb-4">
              <p className="text-sm text-muted-foreground">{dishes.length} dishes</p>
              <Button onClick={() => { setEditing({ name: '', name_lt: '', description: '', description_lt: '', price: 0, category: 'mains', dietary_tags: [], spice_level: 0, available: true, prep_time: 15, bestseller: false, image_url: '', ingredients: [], allergens: [] }); setShowDishForm(true) }}>
                <Plus className="h-4 w-4 mr-1" /> {t('admin.add_dish')}
              </Button>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {dishes.map(d => (
                <Card key={d.id} className="p-4 flex gap-3">
                  <img src={d.image_url} alt={d.name} className="w-24 h-24 object-cover rounded-sm" />
                  <div className="flex-1">
                    <h4 className="font-serif text-lg">{d.name}</h4>
                    <p className="text-xs text-muted-foreground">{d.category} • €{d.price.toFixed(2)} {d.bestseller && '• ★'}</p>
                    <p className="text-xs mt-1">{d.available ? <span className="text-green-600">Available</span> : <span className="text-destructive">Unavailable</span>}</p>
                    <div className="flex gap-2 mt-2">
                      <Button size="sm" variant="outline" onClick={() => { setEditing({ ...d }); setShowDishForm(true) }}><Edit className="h-3 w-3" /></Button>
                      <Button size="sm" variant="outline" onClick={() => deleteDish(d.id)}><Trash2 className="h-3 w-3" /></Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
            {showDishForm && editing && (
              <DishForm dish={editing} onSave={saveDish} onClose={() => { setShowDishForm(false); setEditing(null) }} />
            )}
          </div>
        )}

        {tab === 'orders' && (
          <div className="space-y-3">
            {orders.length === 0 && <p className="text-muted-foreground">No orders yet</p>}
            {orders.map(o => {
              const PROVIDER_LABEL = {
                in_house: { label: 'In-house', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
                wolt: { label: 'Wolt', cls: 'bg-sky-500/15 text-sky-700 dark:text-sky-300' },
                bolt_food: { label: 'Bolt Food', cls: 'bg-emerald-400/15 text-emerald-700 dark:text-emerald-300' },
              }
              const provider = o.delivery_method || o.delivery_provider
              const providerInfo = provider ? PROVIDER_LABEL[provider] : null
              return (
                <Card key={o.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <p className="font-serif text-xl">#{o.order_number}</p>
                        <span className="text-xs uppercase tracking-wider text-muted-foreground">{o.type}</span>
                        {o.table_number && <span className="bg-primary text-primary-foreground text-[10px] px-2 py-0.5 rounded-sm font-bold">TABLE {o.table_number}</span>}
                        {providerInfo && (
                          <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${providerInfo.cls}`}>
                            <Bike className="h-3 w-3 inline mr-0.5" /> {providerInfo.label}
                          </span>
                        )}
                        {o.delivery_status && o.delivery_status !== 'pending' && (
                          <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-muted">{o.delivery_status.replace(/_/g,' ')}</span>
                        )}
                      </div>
                      <p className="text-sm">{o.customer?.name} · {o.customer?.phone}</p>
                      {o.address?.address && <p className="text-xs text-muted-foreground">{o.address.address}, {o.address.city} {o.address.zip} {o.delivery_zone_name && `· ${o.delivery_zone_name}`}</p>}
                      <p className="text-xs text-muted-foreground mt-1">{o.items?.length} items · €{o.total?.toFixed(2)} · {new Date(o.created_at).toLocaleString()}</p>
                      <details className="mt-2 text-xs"><summary className="cursor-pointer text-primary">Items</summary>
                        <ul className="mt-2 space-y-1">{o.items?.map(i => <li key={i.id}>{i.quantity}× {i.name}</li>)}</ul>
                      </details>
                    </div>
                    <div className="flex flex-col gap-2 items-end">
                      <select value={o.status} onChange={e => updateOrderStatus(o.id, e.target.value)} className="h-9 px-3 text-sm bg-background border border-border rounded-md">
                        {['received','preparing','ready','out','delivered','cancelled'].map(s => <option key={s} value={s}>{t(`status.${s}`)}</option>)}
                      </select>
                      {o.type === 'delivery' && ['preparing','ready'].includes(o.status) && !['courier_requested','courier_assigned','picked_up','on_the_way','delivered'].includes(o.delivery_status) && (
                        <Button size="sm" onClick={() => setDispatchOrder(o)}>
                          <Bike className="h-3 w-3 mr-1" /> {o.status === 'preparing' ? 'Call Courier' : 'Dispatch Courier'}
                        </Button>
                      )}
                      {o.type === 'delivery' && ['courier_requested','courier_assigned'].includes(o.delivery_status) && o.status !== 'out' && (
                        <Button size="sm" variant="outline" onClick={async () => { await adminFetch(`/api/orders/${o.id}/picked-up`, { method: 'POST' }); loadAll() }}>
                          <Truck className="h-3 w-3 mr-1" /> Picked up
                        </Button>
                      )}
                      {o.type === 'delivery' && (o.delivery_status === 'picked_up' || o.delivery_status === 'on_the_way') && (
                        <Button size="sm" variant="outline" onClick={async () => { await adminFetch(`/api/orders/${o.id}/delivered`, { method: 'POST' }); loadAll() }}>
                          ✓ Mark Delivered
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        )}

        {tab === 'reservations' && (
          <div className="space-y-3">
            {reservations.length === 0 && <p className="text-muted-foreground">No reservations</p>}
            {reservations.map(r => (
              <Card key={r.id} className="p-4 flex flex-wrap justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-serif text-xl">{r.name}</p>
                    <span className="text-xs text-muted-foreground">#{r.confirmation}</span>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                      r.status === 'confirmed' ? 'bg-blue-500/20 text-blue-600 dark:text-blue-400' :
                      r.status === 'checked_in' ? 'bg-red-500/20 text-red-600 dark:text-red-400' :
                      r.status === 'completed' ? 'bg-green-500/20 text-green-600 dark:text-green-400' :
                      r.status === 'no_show' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-400' :
                      r.status === 'cancelled' ? 'bg-gray-500/20 text-gray-500' :
                      'bg-primary/20 text-primary'
                    }`}>{r.status}</span>
                  </div>
                  <p className="text-sm">{r.date} · {r.time} · {r.guests} guests {r.table_id && <span className="text-primary">· Table {r.table_id.replace('t','')}</span>}</p>
                  <p className="text-xs text-muted-foreground">{r.phone} {r.email && ` · ${r.email}`}</p>
                  {r.special_requests && <p className="text-xs italic mt-1">"{r.special_requests}"</p>}
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {r.status === 'confirmed' && (
                    <Link href="/admin/floor">
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">Check-in →</Button>
                    </Link>
                  )}
                  {r.status === 'confirmed' && (
                    <Button size="sm" variant="outline" onClick={() => updateReservationStatus(r.id, 'no_show')}>Mark No-show</Button>
                  )}
                  {(r.status === 'confirmed' || r.status === 'pending') && (
                    <Button size="sm" variant="outline" onClick={() => updateReservationStatus(r.id, 'cancelled')}>Cancel</Button>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
      {dispatchOrder && (
        <DispatchModal
          order={dispatchOrder}
          token={token}
          onClose={() => setDispatchOrder(null)}
          onDispatched={() => { setDispatchOrder(null); loadAll() }}
        />
      )}
      <Footer />
    </div>
  )
}

function DishForm({ dish, onSave, onClose }) {
  const [d, setD] = useState({ ...dish })
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <Card className="w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-serif text-2xl">{d.id ? 'Edit Dish' : 'Add Dish'}</h3>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><Label>Name (EN)</Label><Input value={d.name} onChange={e => setD({...d, name: e.target.value})} /></div>
          <div><Label>Name (LT)</Label><Input value={d.name_lt} onChange={e => setD({...d, name_lt: e.target.value})} /></div>
          <div className="sm:col-span-2"><Label>Description (EN)</Label><textarea value={d.description} onChange={e => setD({...d, description: e.target.value})} className="w-full mt-1 p-2 bg-background border border-border rounded-md text-sm min-h-[60px]" /></div>
          <div className="sm:col-span-2"><Label>Description (LT)</Label><textarea value={d.description_lt} onChange={e => setD({...d, description_lt: e.target.value})} className="w-full mt-1 p-2 bg-background border border-border rounded-md text-sm min-h-[60px]" /></div>
          <div><Label>Price (EUR)</Label><Input type="number" step="0.01" value={d.price} onChange={e => setD({...d, price: parseFloat(e.target.value)})} /></div>
          <div><Label>Category</Label>
            <select value={d.category} onChange={e => setD({...d, category: e.target.value})} className="mt-1 h-9 w-full px-3 bg-background border border-border rounded-md text-sm">
              {['starters','soups','mains','desserts','drinks'].map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
          <div><Label>Prep time (min)</Label><Input type="number" value={d.prep_time} onChange={e => setD({...d, prep_time: parseInt(e.target.value)})} /></div>
          <div><Label>Spice (0-3)</Label><Input type="number" min={0} max={3} value={d.spice_level} onChange={e => setD({...d, spice_level: parseInt(e.target.value)})} /></div>
          <div className="sm:col-span-2"><Label>Image URL</Label><Input value={d.image_url} onChange={e => setD({...d, image_url: e.target.value})} placeholder="https://..." /></div>
          <div className="sm:col-span-2"><Label>Dietary tags (comma separated: veg, vegan, gluten-free, non-veg)</Label>
            <Input value={(d.dietary_tags || []).join(', ')} onChange={e => setD({...d, dietary_tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})} />
          </div>
          <div className="sm:col-span-2"><Label>Ingredients (comma separated)</Label>
            <Input value={(d.ingredients || []).join(', ')} onChange={e => setD({...d, ingredients: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})} />
          </div>
          <div className="sm:col-span-2"><Label>Allergens (comma separated)</Label>
            <Input value={(d.allergens || []).join(', ')} onChange={e => setD({...d, allergens: e.target.value.split(',').map(s => s.trim()).filter(Boolean)})} />
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!d.available} onChange={e => setD({...d, available: e.target.checked})} /> Available</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!d.bestseller} onChange={e => setD({...d, bestseller: e.target.checked})} /> Bestseller</label>
        </div>
        <div className="flex justify-end gap-2 mt-6">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(d)}>Save</Button>
        </div>
      </Card>
    </div>
  )
}

export default AdminPage
