'use client'
import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useApp } from '@/lib/AppContext'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import {
  Utensils,
  MapPin,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Bell,
  Sparkles,
  Loader2,
} from 'lucide-react'
import { toast } from 'sonner'

function TableQrPage() {
  const params = useParams()
  const router = useRouter()
  const { setTableId } = useApp()

  // Hydration state — { loading, table, session, error, created }
  const [state, setState] = useState({ loading: true, table: null, session: null, error: null, created: false })

  // Waiter request UI state (after tapping "Request Waiter")
  // 'idle' | 'sending' | 'on_the_way'
  const [waiterState, setWaiterState] = useState('idle')

  // Detected order state — when the waiter (or the customer) creates an
  // order for this session we transition through 'detected' → redirect.
  const [orderState, setOrderState] = useState({ status: 'watching', order: null })

  // Poll lifecycle refs
  const pollRef = useRef(null)
  const redirectedRef = useRef(false)

  // 1. Auto-start the table session on QR scan (idempotent).
  useEffect(() => {
    fetch(`/api/tables/${params.id}/start-session`, { method: 'POST', cache: 'no-store' })
      .then(r => r.json())
      .then(d => {
        if (d.error) {
          setState({ loading: false, error: d.error })
          return
        }
        setTableId(d.table.id, d.table.number)
        setState({ loading: false, table: d.table, session: d.session, created: d.created })
      })
      .catch(() => setState({ loading: false, error: 'Network error' }))
  }, [params.id])

  // 2. Poll /active-order — when an order materialises for this table's
  //    session (regardless of whether the waiter or the customer created it)
  //    we transition to the "Your order has been placed" state and redirect
  //    to the existing order tracking dashboard at /order/<id>.
  useEffect(() => {
    if (state.loading || state.error) return

    const check = async () => {
      try {
        const r = await fetch(`/api/tables/${params.id}/active-order`, { cache: 'no-store' })
        if (!r.ok) return
        const d = await r.json()
        if (d.order && !redirectedRef.current) {
          redirectedRef.current = true
          setOrderState({ status: 'detected', order: d.order })
          // Brief "order placed" celebration before redirect — gives the
          // customer context for the screen change.
          setTimeout(() => {
            router.replace(`/order/${d.order.id}`)
          }, 1600)
        }
      } catch { /* transient — keep polling */ }
    }

    check()
    pollRef.current = setInterval(check, 5000)
    // Re-check immediately when the tab is brought back to the foreground
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [state.loading, state.error, params.id, router])

  // 3. "Request Waiter" — fire-and-forget POST to /guest-requests, then
  //    optimistically show the "Waiter is on their way" state.
  const handleRequestWaiter = async () => {
    if (waiterState !== 'idle') return
    setWaiterState('sending')
    try {
      const r = await fetch('/api/guest-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_id: params.id,
          request_type: 'waiter',
          note: 'Customer tapped "Request Waiter" from the welcome screen',
        }),
      })
      if (!r.ok) throw new Error('Failed')
      setWaiterState('on_the_way')
      toast.success('Waiter notified — they are on their way')
    } catch {
      setWaiterState('idle')
      toast.error('Could not reach the kitchen. Please wave to your server.')
    }
  }

  // -------- RENDER STATES --------

  if (state.loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto bg-primary/15 rounded-full flex items-center justify-center mb-4">
            <Utensils className="h-8 w-8 text-primary animate-pulse" />
          </div>
          <p className="text-muted-foreground">Welcoming you to your table…</p>
        </div>
      </div>
    )
  }

  if (state.error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center">
          <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-3" />
          <h1 className="font-serif text-2xl mb-2">We couldn't seat you</h1>
          <p className="text-sm text-muted-foreground mb-6">{state.error}</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={() => router.push('/menu')}>Browse menu anyway</Button>
            <Button onClick={() => router.push('/')}>Home</Button>
          </div>
        </Card>
      </div>
    )
  }

  // Brief celebration screen between "order detected" and the redirect to
  // the live tracking dashboard. Keeps the transition feeling intentional
  // rather than abrupt.
  if (orderState.status === 'detected') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-10 max-w-md w-full text-center luxury-shadow border-primary/30">
          <div className="w-20 h-20 mx-auto bg-primary/15 rounded-full flex items-center justify-center mb-5">
            <CheckCircle2 className="h-10 w-10 text-primary" />
          </div>
          <p className="text-primary text-xs uppercase tracking-[0.4em] mb-2">Confirmed</p>
          <h1 className="font-serif text-4xl mb-3">Your order has been placed</h1>
          <p className="text-muted-foreground mb-6">
            Order <span className="font-mono text-primary">#{orderState.order?.order_number}</span> is now in the kitchen.
          </p>
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening live tracking…
          </div>
        </Card>
      </div>
    )
  }

  const { table, created } = state

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 sm:p-6">
      <Card className="p-6 sm:p-8 max-w-md w-full text-center luxury-shadow">
        <div className="w-20 h-20 mx-auto bg-primary/15 rounded-full flex items-center justify-center mb-5">
          {created ? <CheckCircle2 className="h-10 w-10 text-primary" /> : <Utensils className="h-10 w-10 text-primary" />}
        </div>
        <p className="text-primary text-xs uppercase tracking-[0.4em] mb-2">Welcome to</p>
        <h1 className="font-serif text-4xl sm:text-5xl mb-2">Aukštaitija</h1>
        <p className="text-muted-foreground text-sm sm:text-base mb-6">Modern Lithuanian Fine Dining · Kaunas</p>

        <div className="py-4 border-y border-border my-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">You are seated at</p>
          <p className="font-serif text-6xl sm:text-7xl gold-gradient my-2">Table {table.number}</p>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-1">
            <MapPin className="h-3 w-3" /> {table.section} · seats {table.capacity}
          </p>
        </div>

        <div className="flex items-center justify-center gap-2 text-sm text-green-600 dark:text-green-400 mb-6">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
          </span>
          {created ? 'Your table is now reserved for you' : 'Session resumed — welcome back'}
        </div>

        {/* Hybrid CTA pair — primary "Open Menu", secondary "Request Waiter".
            Equal width, stacked vertically for thumb-comfortable mobile UX.    */}
        <div className="space-y-3">
          <Button
            size="lg"
            className="w-full h-12 text-base"
            onClick={() => router.push('/menu')}
          >
            <Utensils className="h-4 w-4 mr-2" />
            Open Menu
            <ArrowRight className="h-4 w-4 ml-1" />
          </Button>

          {waiterState === 'on_the_way' ? (
            <div className="w-full h-12 rounded-md border border-primary/40 bg-primary/10 flex items-center justify-center gap-2 text-sm text-primary">
              <Sparkles className="h-4 w-4" />
              Your server is on the way to Table {table.number}
            </div>
          ) : (
            <Button
              variant="outline"
              size="lg"
              className="w-full h-12 text-base border-primary/40 hover:bg-primary/10 hover:text-primary hover:border-primary/60"
              onClick={handleRequestWaiter}
              disabled={waiterState === 'sending'}
            >
              {waiterState === 'sending' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Notifying server…
                </>
              ) : (
                <>
                  <Bell className="h-4 w-4 mr-2" />
                  Request Waiter
                </>
              )}
            </Button>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-5 leading-relaxed">
          Prefer the traditional experience? Tap <strong className="text-foreground">Request Waiter</strong> and we'll take your order at the table.<br />
          Your live order tracker opens automatically once we send it to the kitchen.
        </p>
      </Card>
    </div>
  )
}

export default TableQrPage
