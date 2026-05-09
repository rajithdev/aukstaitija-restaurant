'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useApp } from '@/lib/AppContext'
import { Search } from 'lucide-react'

function TrackPage() {
  const { t } = useApp()
  const router = useRouter()
  const [value, setValue] = useState('')
  const [err, setErr] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    const key = value.trim()
    if (!key) {
      setErr('Please enter your order number')
      return
    }
    setLoading(true)
    try {
      // Verify it exists first so we can give a friendly error instead of redirecting to a broken page.
      const res = await fetch(`/api/orders/${encodeURIComponent(key)}`)
      if (res.status === 404) {
        setErr(t('track.not_found') || 'Order not found — please check your order number')
        setLoading(false)
        return
      }
      const data = await res.json()
      // Prefer the canonical order_number in the URL when available
      router.push(`/order/${data.order_number || data.id || key}`)
    } catch {
      setErr('Could not look up order — please try again')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto py-20 max-w-md">
        <p className="text-primary text-xs uppercase tracking-[0.4em] mb-3 text-center">Live tracking</p>
        <h1 className="font-serif text-5xl mb-3 text-center">{t('track.title') || 'Track your order'}</h1>
        <p className="text-sm text-muted-foreground text-center mb-8">
          Just placed an order? You're auto-redirected to live tracking. Use the form below if you closed the page.
        </p>
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <Input
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="Enter your order number (e.g. AK020909)"
              className="h-12 text-base"
              autoFocus
            />
            <Button type="submit" className="w-full h-11" disabled={loading}>
              <Search className="h-4 w-4 mr-2" />
              {loading ? 'Looking up…' : (t('track.track') || 'Track order')}
            </Button>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <p className="text-xs text-muted-foreground text-center">
              Your order number was shown on the confirmation page and starts with <code className="text-primary">AK</code>.
            </p>
          </form>
        </Card>
      </div>
      <Footer />
    </div>
  )
}

export default TrackPage
