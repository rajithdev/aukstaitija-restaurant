// © 2025 Rajith Raja — Velora Systems. All rights reserved. Unauthorised copying or redistribution is prohibited.
'use client'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { X, Search, Plus, Minus, Trash2, ChefHat, User } from 'lucide-react'
import { toast } from 'sonner'

/**
 * WaiterOrderInterface — Fast, POS-style order builder for waiter-assisted dining.
 * Opens when waiter clicks "Take Order" on an assistance request.
 * 
 * Design: Dense, tablet-optimized, minimal clicks, operationally efficient.
 */
export default function WaiterOrderInterface({ open, tableId, tableNumber, sessionId, onClose, onSuccess, token }) {
  const [dishes, setDishes] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [cart, setCart] = useState([])
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)

  // Fetch menu data
  useEffect(() => {
    if (!open) return
    fetch('/api/categories').then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d : []))
  }, [open])

  useEffect(() => {
    if (!open) return
    const qs = new URLSearchParams({ search, category }).toString()
    fetch(`/api/dishes?${qs}`).then(r => r.json()).then(d => setDishes(Array.isArray(d) ? d : []))
  }, [open, search, category])

  // Reset state when closed
  useEffect(() => {
    if (!open) {
      setSearch('')
      setCategory('all')
      setCart([])
    }
  }, [open])

  const addToCart = (dish) => {
    const existing = cart.find(i => i.id === dish.id && !i.notes)
    if (existing) {
      setCart(cart.map(i => i.id === dish.id && !i.notes ? { ...i, quantity: i.quantity + 1 } : i))
    } else {
      setCart([...cart, {
        id: dish.id,
        name: dish.name,
        price: dish.price,
        quantity: 1,
        notes: '',
        prep_time: dish.prep_time || 15,
      }])
    }
  }

  const updateQuantity = (index, delta) => {
    const newCart = [...cart]
    newCart[index].quantity = Math.max(1, newCart[index].quantity + delta)
    setCart(newCart)
  }

  const updateNotes = (index, notes) => {
    const newCart = [...cart]
    newCart[index].notes = notes
    setCart(newCart)
  }

  const removeItem = (index) => {
    setCart(cart.filter((_, i) => i !== index))
  }

  const subtotal = cart.reduce((s, i) => s + (i.price * i.quantity), 0)
  const total = +(subtotal * 1.21).toFixed(2) // includes 21% VAT

  const sendToKitchen = async () => {
    if (cart.length === 0) return
    setSending(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': token,
        },
        body: JSON.stringify({
          table_id: tableId,
          order_source: 'waiter',
          items: cart.map(i => ({
            id: i.id,
            name: i.name,
            price: i.price,
            quantity: i.quantity,
            notes: i.notes,
            prep_time: i.prep_time,
          })),
          merge_active: true, // Merge into existing received order if any
        }),
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('Order sent to kitchen', {
          description: `Table ${tableNumber} · ${cart.reduce((s, i) => s + i.quantity, 0)} items`,
        })
        onSuccess?.()
        onClose?.()
      } else {
        toast.error('Failed to send order', { description: data.error || 'Please try again' })
      }
    } catch (err) {
      toast.error('Failed to send order', { description: err.message })
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <>
      {/* Backdrop */}
      <button
        onClick={onClose}
        className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
        aria-label="Close"
      />

      {/* Drawer */}
      <aside className="fixed inset-y-0 right-0 z-[80] w-full sm:w-[95vw] md:w-[90vw] lg:w-[85vw] xl:w-[1200px] max-w-full bg-zinc-950 border-l border-white/10 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="shrink-0 h-14 px-4 border-b border-white/10 flex items-center justify-between bg-zinc-900/80">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-lg bg-amber-400/15 ring-1 ring-amber-400/30 flex items-center justify-center">
              <ChefHat className="h-4 w-4 text-amber-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-100">Waiter Order · Table {tableNumber}</h2>
              <p className="text-[10px] text-zinc-500">
                {sessionId ? '🟢 Customer session active' : 'Walk-in order'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="h-9 w-9 rounded-md bg-white/5 hover:bg-white/10 border border-white/10 flex items-center justify-center text-zinc-300 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Main content: Menu + Cart */}
        <div className="flex-1 flex overflow-hidden">
          {/* Menu section — 60% width */}
          <div className="flex-1 flex flex-col overflow-hidden border-r border-white/10">
            {/* Search + Categories */}
            <div className="shrink-0 p-3 border-b border-white/10 space-y-2 bg-zinc-900/40">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search dishes..."
                  className="pl-8 h-9 text-sm bg-white/[0.02] border-white/10 text-zinc-100"
                />
              </div>
              <div className="flex gap-1.5 overflow-x-auto scrollbar-hide -mx-1 px-1">
                <button
                  onClick={() => setCategory('all')}
                  className={`shrink-0 px-3 h-7 rounded-md text-[11px] font-medium transition ${
                    category === 'all'
                      ? 'bg-amber-300/15 text-amber-200 border border-amber-400/40'
                      : 'bg-white/[0.02] text-zinc-400 border border-white/5 hover:bg-white/[0.05] hover:text-zinc-200'
                  }`}
                >
                  All
                </button>
                {categories.map(c => (
                  <button
                    key={c.id}
                    onClick={() => setCategory(c.id)}
                    className={`shrink-0 px-3 h-7 rounded-md text-[11px] font-medium transition whitespace-nowrap ${
                      category === c.id
                        ? 'bg-amber-300/15 text-amber-200 border border-amber-400/40'
                        : 'bg-white/[0.02] text-zinc-400 border border-white/5 hover:bg-white/[0.05] hover:text-zinc-200'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Dishes grid */}
            <div className="flex-1 overflow-y-auto p-3">
              {loading ? (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                  {[...Array(6)].map((_, i) => (
                    <div key={i} className="h-28 rounded-lg bg-white/[0.02] animate-pulse" />
                  ))}
                </div>
              ) : dishes.length === 0 ? (
                <div className="text-center py-16 text-zinc-500 text-sm">No dishes found</div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                  {dishes.map(d => (
                    <button
                      key={d.id}
                      onClick={() => addToCart(d)}
                      className="group text-left bg-zinc-900/60 hover:bg-zinc-900 border border-white/10 hover:border-amber-400/40 rounded-lg p-2.5 transition"
                    >
                      <div className="flex items-start gap-2">
                        <img
                          src={d.image_url}
                          alt={d.name}
                          className="w-16 h-16 object-cover rounded-md shrink-0"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-medium text-zinc-100 truncate mb-0.5">{d.name}</h4>
                          <p className="text-[10px] text-zinc-500 line-clamp-1">{d.category}</p>
                          <div className="flex items-center justify-between mt-1">
                            <span className="text-sm font-mono tabular-nums text-amber-300">€{d.price.toFixed(2)}</span>
                            <Plus className="h-3.5 w-3.5 text-zinc-500 group-hover:text-amber-300 transition" />
                          </div>
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Cart section — 40% width */}
          <div className="w-[40%] flex flex-col bg-zinc-900/40">
            <div className="shrink-0 px-4 py-3 border-b border-white/10">
              <h3 className="text-sm font-semibold text-zinc-100">Order Items</h3>
              <p className="text-[10px] text-zinc-500 mt-0.5">
                {cart.reduce((s, i) => s + i.quantity, 0)} items
              </p>
            </div>

            {/* Cart items */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {cart.length === 0 ? (
                <div className="text-center py-16 text-zinc-500 text-xs">
                  <User className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  No items added yet
                </div>
              ) : (
                cart.map((item, index) => (
                  <div key={index} className="bg-zinc-800/60 border border-white/5 rounded-lg p-2.5 space-y-2">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-medium text-zinc-100 truncate">{item.name}</h4>
                        <p className="text-xs font-mono tabular-nums text-zinc-400">€{item.price.toFixed(2)}</p>
                      </div>
                      <button
                        onClick={() => removeItem(index)}
                        className="shrink-0 p-1 rounded hover:bg-red-500/20 text-zinc-500 hover:text-red-300 transition"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {/* Quantity controls */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => updateQuantity(index, -1)}
                        disabled={item.quantity <= 1}
                        className="h-7 w-7 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-center text-zinc-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="flex-1 text-center text-sm font-mono tabular-nums text-zinc-200">{item.quantity}</span>
                      <button
                        onClick={() => updateQuantity(index, 1)}
                        className="h-7 w-7 rounded bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 flex items-center justify-center text-zinc-300 transition"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                      <span className="ml-auto text-xs font-mono tabular-nums text-zinc-300">
                        €{(item.price * item.quantity).toFixed(2)}
                      </span>
                    </div>

                    {/* Notes */}
                    <Textarea
                      value={item.notes}
                      onChange={(e) => updateNotes(index, e.target.value)}
                      placeholder="Special requests..."
                      rows={2}
                      className="text-xs bg-white/[0.02] border-white/10 text-zinc-200 placeholder:text-zinc-600"
                    />
                  </div>
                ))
              )}
            </div>

            {/* Total + Send */}
            <div className="shrink-0 p-4 border-t border-white/10 space-y-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-zinc-400">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">€{subtotal.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-zinc-400">
                  <span>VAT (21%)</span>
                  <span className="font-mono tabular-nums">€{(total - subtotal).toFixed(2)}</span>
                </div>
                <div className="flex justify-between pt-2 border-t border-white/10 text-base">
                  <span className="text-zinc-200 font-semibold">Total</span>
                  <span className="font-mono tabular-nums text-amber-300 font-bold">€{total.toFixed(2)}</span>
                </div>
              </div>
              <Button
                onClick={sendToKitchen}
                disabled={cart.length === 0 || sending}
                className="w-full h-12 bg-amber-300 hover:bg-amber-200 text-zinc-950 font-semibold border-0 shadow-md shadow-amber-500/20 text-base"
              >
                <ChefHat className="h-5 w-5 mr-2" />
                {sending ? 'Sending...' : 'Send to Kitchen'}
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </>
  )
}
