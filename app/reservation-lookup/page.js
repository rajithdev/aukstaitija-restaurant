'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Search, Calendar, Clock, Users, ChevronRight, Mail, Phone, AlertCircle } from 'lucide-react'

const STATUS_LABEL = {
  pending: 'Pending',
  confirmed: 'Confirmed',
  table_assigned: 'Table assigned',
  arrived: 'Arrived',
  checked_in: 'Seated',
  completed: 'Completed',
  cancelled: 'Cancelled',
  no_show: 'No-show',
}

function ReservationLookupPage() {
  const router = useRouter()
  const [mode, setMode] = useState('email') // email | phone
  const [value, setValue] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState(null) // null = not searched yet
  const [error, setError] = useState(null)

  // Pre-fill from URL ?email= / ?phone= so a confirmation email link can
  // bring the user straight to results.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const url = new URL(window.location.href)
    const e = url.searchParams.get('email')
    const p = url.searchParams.get('phone')
    if (e) { setMode('email'); setValue(e) }
    else if (p) { setMode('phone'); setValue(p) }
  }, [])

  const submit = async (e) => {
    e?.preventDefault()
    if (!value.trim()) return
    setLoading(true)
    setError(null)
    setResults(null)
    try {
      const payload = mode === 'email' ? { email: value.trim() } : { phone: value.trim() }
      const res = await fetch('/api/reservations/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Lookup failed')
      }
      const data = await res.json()
      setResults(data.reservations || [])
    } catch (err) {
      setError(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto py-12 max-w-2xl px-4">
        <div className="mb-8 text-center">
          <p className="text-primary text-xs uppercase tracking-[0.4em] mb-2">Find your booking</p>
          <h1 className="font-serif text-4xl md:text-5xl mb-3">Reservation lookup</h1>
          <p className="text-muted-foreground text-sm max-w-md mx-auto">
            Lost your reservation code? Enter the email or phone you used and we'll list every reservation we have.
          </p>
        </div>

        <Card className="p-6 md:p-8 mb-6">
          <form onSubmit={submit} className="space-y-5">
            {/* Mode toggle */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-lg bg-muted/40">
              <button
                type="button"
                onClick={() => setMode('email')}
                className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'email' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Mail className="h-4 w-4" /> Email
              </button>
              <button
                type="button"
                onClick={() => setMode('phone')}
                className={`flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-colors ${mode === 'phone' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <Phone className="h-4 w-4" /> Phone
              </button>
            </div>

            <div>
              <Label htmlFor="lookup-input" className="mb-1.5 block">
                {mode === 'email' ? 'Email address' : 'Phone number'}
              </Label>
              <Input
                id="lookup-input"
                type={mode === 'email' ? 'email' : 'tel'}
                placeholder={mode === 'email' ? 'you@example.com' : '+1 555 111 2222'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
              <p className="text-[11px] text-muted-foreground mt-1.5">
                {mode === 'phone'
                  ? 'We match the last 7 digits — country code formatting is forgiven.'
                  : 'Case-insensitive. We list reservations made with this email.'}
              </p>
            </div>

            <Button type="submit" disabled={loading || !value.trim()} className="w-full">
              {loading ? 'Searching…' : <><Search className="h-4 w-4 mr-2" /> Find reservations</>}
            </Button>
          </form>
        </Card>

        {error && (
          <Card className="p-4 mb-6 border-destructive/40 bg-destructive/5 flex items-start gap-3">
            <AlertCircle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-medium text-destructive">Lookup failed</p>
              <p className="text-xs text-muted-foreground">{error}</p>
            </div>
          </Card>
        )}

        {/* Results */}
        {results !== null && !loading && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-serif text-xl">
                {results.length === 0 ? 'No matches found' : `${results.length} reservation${results.length === 1 ? '' : 's'} found`}
              </h2>
            </div>

            {results.length === 0 ? (
              <Card className="p-6 text-sm text-muted-foreground text-center">
                We couldn't find any reservations under that {mode}. Double-check the value, or
                {' '}<Link href="/reservations" className="text-primary hover:underline">make a new reservation</Link>.
              </Card>
            ) : (
              <div className="space-y-3">
                {results.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => router.push(`/reservation/${r.reservation_code}`)}
                    className="w-full text-left"
                  >
                    <Card className="p-4 hover:border-primary transition-colors group">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-mono text-xs text-primary">{r.reservation_code}</span>
                            <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-accent text-accent-foreground">
                              {STATUS_LABEL[r.status] || r.status}
                            </span>
                          </div>
                          <p className="font-medium truncate">{r.name}</p>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> {r.date}</span>
                            <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {r.time}</span>
                            <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" /> {r.guests}</span>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <p className="text-center text-xs text-muted-foreground mt-8">
          Already know your code? <Link href="/" className="text-primary hover:underline">Visit a reservation directly</Link> at <span className="font-mono">/reservation/RSV-XXXXXX</span>
        </p>
      </div>

      <Footer />
    </div>
  )
}

export default ReservationLookupPage
