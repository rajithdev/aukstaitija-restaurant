'use client'
import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Bike, Copy, Check, X, MapPin, Phone, User, Receipt, MessageSquare } from 'lucide-react'
import { toast } from 'sonner'

const PROVIDERS = [
  { id: 'in_house',  label: 'In-house Courier', sub: 'Use your own riders', cls: 'bg-emerald-500 hover:bg-emerald-600 text-white' },
  { id: 'wolt',      label: 'Wolt',             sub: 'Hand off to Wolt courier', cls: 'bg-sky-500 hover:bg-sky-600 text-white' },
  { id: 'bolt_food', label: 'Bolt Food',        sub: 'Hand off to Bolt Food courier', cls: 'bg-emerald-400 hover:bg-emerald-500 text-emerald-950' },
]

export default function DispatchModal({ order, token, onClose, onDispatched }) {
  const [provider, setProvider] = useState(order.delivery_method || 'in_house')
  const [sending, setSending] = useState(false)
  const [copied, setCopied] = useState(false)

  const items = (order.items || []).map(i => `${i.quantity}× ${i.name}`).join('\n')
  const addr = order.address?.address || ''
  const city = order.address?.city || ''
  const zip = order.address?.zip || ''

  const dispatchInfo = `AUKŠTAITIJA — Order #${order.order_number}
Provider: ${provider}
${'-'.repeat(40)}
CUSTOMER
  Name: ${order.customer?.name || ''}
  Phone: ${order.customer?.phone || ''}
DELIVERY ADDRESS
  ${addr}
  ${city} ${zip}${order.delivery_zone_name ? ` · ${order.delivery_zone_name}` : ''}
${'-'.repeat(40)}
ITEMS
${items}
${'-'.repeat(40)}
TOTAL: €${order.total?.toFixed(2)}
PAYMENT: ${order.payment_method || 'cash'}
${order.notes ? `NOTES:\n  ${order.notes}` : ''}`.trim()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(dispatchInfo)
      setCopied(true)
      toast.success('Copied — paste into the merchant app')
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('Could not copy. Select and copy manually.')
    }
  }

  const dispatch = async () => {
    setSending(true)
    const res = await fetch(`/api/orders/${order.id}/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-token': token },
      body: JSON.stringify({ provider }),
    })
    const data = await res.json()
    setSending(false)
    if (data.ok) {
      toast.success(order.status === 'preparing' ? 'Courier called early — saving you time!' : 'Dispatched! Order moved to courier.')
      onDispatched?.(data.order)
      onClose?.()
    } else {
      toast.error(data.error || 'Dispatch failed')
    }
  }

  const isPredictive = order.status === 'preparing'

  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <Card className="w-full max-w-2xl p-6 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-start mb-4">
          <div>
            <p className="text-primary text-xs uppercase tracking-[0.4em] mb-1">{isPredictive ? 'Call courier early' : 'Dispatch courier'}</p>
            <h3 className="font-serif text-3xl">#{order.order_number}</h3>
            <p className="text-xs text-muted-foreground">
              {order.delivery_zone_name || ''} {order.courier_eta ? `· ~${order.courier_eta}min ETA` : ''}
              {isPredictive && order.prep_time_total ? ` · Prep ~${order.prep_time_total}min` : ''}
            </p>
            {isPredictive && (
              <p className="text-xs text-primary mt-1 font-semibold">
                ⚡ Predictive dispatch — courier travels while food finishes cooking
              </p>
            )}
          </div>
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>

        {/* Provider picker */}
        <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Choose courier</p>
        <div className="grid grid-cols-3 gap-2 mb-5">
          {PROVIDERS.map(p => (
            <button key={p.id} onClick={() => setProvider(p.id)}
              className={`p-3 rounded-md border-2 text-left transition ${provider === p.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/30'}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm">{p.label}</span>
                {provider === p.id && <Check className="h-4 w-4 text-primary" />}
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">{p.sub}</p>
            </button>
          ))}
        </div>

        {/* Order summary for staff */}
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <div className="p-3 rounded-md bg-muted/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1"><User className="h-3 w-3" /> Customer</p>
            <p className="font-medium">{order.customer?.name || '—'}</p>
            <p className="text-sm flex items-center gap-1 text-muted-foreground"><Phone className="h-3 w-3" /> {order.customer?.phone || '—'}</p>
          </div>
          <div className="p-3 rounded-md bg-muted/40">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1"><MapPin className="h-3 w-3" /> Address</p>
            <p className="text-sm">{addr || '—'}</p>
            <p className="text-xs text-muted-foreground">{city} {zip}</p>
          </div>
        </div>

        <div className="p-3 rounded-md bg-muted/40 mb-4">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-1"><Receipt className="h-3 w-3" /> Items ({order.items?.length || 0})</p>
          <ul className="text-sm space-y-1">
            {(order.items || []).map((i, idx) => (
              <li key={idx} className="flex justify-between">
                <span>{i.quantity}× {i.name}</span>
                <span className="text-muted-foreground">€{(i.price * i.quantity).toFixed(2)}</span>
              </li>
            ))}
          </ul>
          <div className="flex justify-between text-base mt-3 pt-2 border-t border-border">
            <span className="font-semibold">Total</span>
            <span className="font-serif text-xl text-primary">€{order.total?.toFixed(2)}</span>
          </div>
        </div>

        {order.notes && (
          <div className="p-3 mb-4 rounded-md bg-amber-500/10 border border-amber-500/30">
            <p className="text-[10px] uppercase tracking-wider text-amber-700 dark:text-amber-300 mb-1 flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Customer notes</p>
            <p className="text-sm italic">{order.notes}</p>
          </div>
        )}

        {/* Dispatch info textarea */}
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Dispatch info — copy & paste into {PROVIDERS.find(p => p.id === provider)?.label} merchant app</p>
        <textarea readOnly value={dispatchInfo} className="w-full h-32 p-3 bg-muted/40 border border-border rounded-md text-xs font-mono mb-3" />

        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={copy} className="h-11">
            {copied ? <><Check className="h-4 w-4 mr-1" /> Copied</> : <><Copy className="h-4 w-4 mr-1" /> Copy Delivery Info</>}
          </Button>
          <Button onClick={dispatch} disabled={sending} className={`h-11 ${PROVIDERS.find(p => p.id === provider)?.cls}`}>
            <Bike className="h-4 w-4 mr-1" /> {sending ? 'Sending…' : (isPredictive ? 'Request Courier' : 'Mark as Sent')}
          </Button>
        </div>
        <p className="text-[10px] text-center text-muted-foreground mt-3">
          Once Wolt/Bolt grants merchant API access, this will create the courier request automatically.
        </p>
      </Card>
    </div>
  )
}
