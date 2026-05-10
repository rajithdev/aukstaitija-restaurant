'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import ReservationTimeline, {
  STATUS_HEADLINES, isTableRevealed,
} from '@/components/ReservationTimeline'
import {
  Calendar, Clock, Users, MapPin, Sparkles, RefreshCw, Search, Copy, Check,
  AlertCircle, Home,
} from 'lucide-react'

const REFRESH_MS = 5000 // Live tracker requirement: refresh every 5s

function formatTimeAgo(dt) {
  if (!dt) return ''
  const diff = Math.max(0, (Date.now() - new Date(dt).getTime()) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

function StatusPill({ status }) {
  const palette = {
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    confirmed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    table_assigned: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    arrived: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    checked_in: 'bg-rose-500/20 text-rose-400 border-rose-500/30',
    completed: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
    cancelled: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    no_show: 'bg-red-500/20 text-red-400 border-red-500/30',
  }[status] || 'bg-muted text-muted-foreground border-border'
  return (
    <span className={`px-3 py-1 text-[10px] uppercase tracking-[0.25em] rounded-full border ${palette}`}>
      {(status || 'pending').replace('_', ' ')}
    </span>
  )
}

function CopyButton({ value }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 1500)
      }}
      className="ml-2 p-1.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
      title="Copy code"
      aria-label="Copy reservation code"
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function ReservationTrackerPage() {
  const { code } = useParams()
  const [reservation, setReservation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const previousStatus = useRef(null)
  const [statusJustChanged, setStatusJustChanged] = useState(false)

  const fetchReservation = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    setRefreshing(true)
    try {
      const res = await fetch(`/api/reservations/by-code/${encodeURIComponent(code)}`)
      if (res.status === 404) {
        setError('not_found')
        setReservation(null)
        return
      }
      if (!res.ok) throw new Error('Failed to load reservation')
      const data = await res.json()
      setReservation(data)
      setError(null)
      setLastUpdated(new Date())
      // Detect a status transition so we can flash a celebratory pulse
      // on the timeline when the manager assigns a table while the user
      // is watching the page.
      if (previousStatus.current && previousStatus.current !== data.status) {
        setStatusJustChanged(true)
        setTimeout(() => setStatusJustChanged(false), 4000)
      }
      previousStatus.current = data.status
    } catch (e) {
      if (!silent) setError('network')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [code])

  // Persist the latest viewed code so a guest who navigates here directly
  // (e.g. from a confirmation email) doesn't lose access on refresh.
  useEffect(() => {
    if (!code) return
    try { localStorage.setItem('latest_reservation_code', code) } catch {}
  }, [code])

  // Initial load + 5s polling for live status. Stops polling once the
  // reservation reaches a terminal state to avoid wasted requests.
  useEffect(() => {
    if (!code) return
    fetchReservation()
    const id = setInterval(() => {
      const terminal = reservation && ['completed', 'cancelled', 'no_show'].includes(reservation.status)
      if (!terminal) fetchReservation(true)
    }, REFRESH_MS)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, reservation?.status])

  if (loading && !reservation) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto py-20 max-w-3xl px-4">
          <Card className="p-12 text-center">
            <RefreshCw className="h-6 w-6 mx-auto text-primary animate-spin mb-3" />
            <p className="text-sm text-muted-foreground">Loading your reservation…</p>
          </Card>
        </div>
        <Footer />
      </div>
    )
  }

  if (error === 'not_found') {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto py-20 max-w-2xl px-4">
          <Card className="p-10 text-center">
            <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-4" />
            <h1 className="font-serif text-3xl mb-2">We couldn't find that reservation</h1>
            <p className="text-sm text-muted-foreground mb-6">
              The code <span className="font-mono text-foreground">{code}</span> doesn't match any reservation in our system.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              <Link href="/reservation-lookup">
                <Button>
                  <Search className="h-4 w-4 mr-2" /> Find by phone or email
                </Button>
              </Link>
              <Link href="/reservations">
                <Button variant="outline">Make a reservation</Button>
              </Link>
              <Link href="/">
                <Button variant="ghost">
                  <Home className="h-4 w-4 mr-2" /> Home
                </Button>
              </Link>
            </div>
          </Card>
        </div>
        <Footer />
      </div>
    )
  }

  if (error === 'network') {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto py-20 max-w-2xl px-4">
          <Card className="p-10 text-center">
            <AlertCircle className="h-10 w-10 mx-auto text-destructive mb-4" />
            <h1 className="font-serif text-3xl mb-2">Connection issue</h1>
            <p className="text-sm text-muted-foreground mb-6">
              We couldn't reach our servers. Please check your connection and try again.
            </p>
            <Button onClick={() => fetchReservation()}>
              <RefreshCw className="h-4 w-4 mr-2" /> Retry
            </Button>
          </Card>
        </div>
        <Footer />
      </div>
    )
  }

  if (!reservation) return null

  const tableShown = isTableRevealed(reservation.status)
  const tableLabel = reservation.table_number ? `T${reservation.table_number}` : null
  const headline = STATUS_HEADLINES[reservation.status] || 'Reservation status'
  const interrupted = ['cancelled', 'no_show'].includes(reservation.status)
  const terminal = ['completed', 'cancelled', 'no_show'].includes(reservation.status)

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto py-12 max-w-3xl px-4">
        {/* Heading */}
        <div className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-primary text-xs uppercase tracking-[0.4em] mb-2">Reservation tracker</p>
            <h1 className="font-serif text-3xl md:text-4xl">{reservation.name}'s table</h1>
            <div className="mt-2 inline-flex items-center bg-muted/40 px-3 py-1.5 rounded-md">
              <span className="text-xs uppercase tracking-wider text-muted-foreground mr-2">Code</span>
              <span className="font-mono text-sm">{reservation.reservation_code || code}</span>
              <CopyButton value={reservation.reservation_code || code} />
            </div>
          </div>
          <StatusPill status={reservation.status} />
        </div>

        {/* Live indicator */}
        {!terminal && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-6">
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full rounded-full bg-emerald-400 ${refreshing ? 'animate-ping opacity-75' : 'opacity-50'}`} />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Live · refreshes every 5s
            {lastUpdated && <span className="ml-2">Last update: {formatTimeAgo(lastUpdated)}</span>}
            <button
              onClick={() => fetchReservation()}
              className="ml-auto text-primary hover:underline inline-flex items-center gap-1"
            >
              <RefreshCw className={`h-3 w-3 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        )}

        {/* Status hero card */}
        <Card className={`overflow-hidden mb-6 ${statusJustChanged ? 'ring-2 ring-primary animate-pulse' : ''}`}>
          <div className="p-6 md:p-8 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
            <h2 className="font-serif text-2xl md:text-3xl">{headline}</h2>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <Calendar className="h-4 w-4 text-primary" />
                {reservation.date}
              </span>
              <span className="flex items-center gap-1.5">
                <Clock className="h-4 w-4 text-primary" />
                {reservation.time}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4 text-primary" />
                {reservation.guests} {reservation.guests === 1 ? 'guest' : 'guests'}
              </span>
            </div>

            {!tableShown && !interrupted && (
              <div className="mt-5 px-4 py-3 rounded-md border border-dashed border-primary/40 bg-primary/5 text-sm text-primary flex items-start gap-2">
                <Sparkles className="h-4 w-4 mt-0.5 shrink-0" />
                <span>
                  Your table will be revealed here the moment our manager assigns one.
                  This page updates automatically — feel free to leave it open.
                </span>
              </div>
            )}
          </div>

          {/* Timeline */}
          <div className="p-6 md:p-8 border-t border-border">
            <ReservationTimeline reservation={reservation} />
          </div>

          {/* Reveal block */}
          {tableShown && tableLabel && (
            <div className="p-6 md:p-8 border-t border-border bg-primary/5">
              <p className="text-[10px] uppercase tracking-[0.3em] text-primary mb-4">Your table</p>
              <div className="grid sm:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Table</p>
                  <p className="font-serif text-3xl text-primary">{tableLabel}</p>
                </div>
                {reservation.table_section && (
                  <div>
                    <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Section
                    </p>
                    <p className="font-medium">{reservation.table_section}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Time
                  </p>
                  <p className="font-medium">{reservation.time}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <Users className="h-3 w-3" /> Party
                  </p>
                  <p className="font-medium">
                    {reservation.guests} {reservation.guests === 1 ? 'guest' : 'guests'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Footer details */}
          <div className="p-6 md:p-8 border-t border-border grid sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Seating preference</p>
              <p>{reservation.seating_preference || 'No preference'}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Occasion</p>
              <p>{reservation.occasion || 'Casual dining'}</p>
            </div>
            {(reservation.special_requests || reservation.notes) && (
              <div className="sm:col-span-2">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Notes</p>
                <p className="italic text-muted-foreground">"{reservation.special_requests || reservation.notes}"</p>
              </div>
            )}
            {reservation.confirmation && (
              <div className="sm:col-span-2 pt-2 border-t border-border/60">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Internal confirmation: <span className="font-mono">{reservation.confirmation}</span>
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* Helpful actions */}
        <div className="flex flex-wrap gap-2 justify-center">
          <Link href="/reservation-lookup">
            <Button variant="ghost" size="sm">
              <Search className="h-4 w-4 mr-2" /> Find another reservation
            </Button>
          </Link>
          <Link href="/menu">
            <Button variant="ghost" size="sm">Browse menu</Button>
          </Link>
        </div>

        {!reservation.has_user && (
          <p className="text-center text-xs text-muted-foreground mt-6 max-w-md mx-auto">
            <Link href="/signup" className="text-primary hover:underline">Create an account</Link>
            {' '}to keep all your reservations in one place — we'll match by your email or phone.
          </p>
        )}
      </div>

      <Footer />
    </div>
  )
}

export default ReservationTrackerPage
