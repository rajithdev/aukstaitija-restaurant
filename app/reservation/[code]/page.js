'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import ReservationTimeline, {
  STATUS_HEADLINES, STATUS_SUBTEXT, isTableRevealed,
} from '@/components/ReservationTimeline'
import {
  Calendar, Clock, Users, MapPin, RefreshCw, Search, Copy, Check,
  AlertCircle, Home, Edit2, X,
} from 'lucide-react'
import { toast } from 'sonner'

const REFRESH_MS = 5000 // Live tracker requirement: refresh every 5s

function formatTimeAgo(dt) {
  if (!dt) return ''
  const diff = Math.max(0, (Date.now() - new Date(dt).getTime()) / 1000)
  if (diff < 5) return 'just now'
  if (diff < 60) return `${Math.floor(diff)}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

// Customer-facing status pill — collapses operational stages
// (arrived / checked_in / completed) into "Table Assigned" so the customer
// only ever sees the 3-stage simplified flow.
function StatusPill({ status }) {
  const collapsed = ['arrived', 'checked_in', 'completed'].includes(status)
    ? 'table_assigned'
    : status
  const palette = {
    pending: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    confirmed: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    table_assigned: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    cancelled: 'bg-zinc-500/20 text-zinc-400 border-zinc-500/30',
    no_show: 'bg-red-500/20 text-red-400 border-red-500/30',
  }[collapsed] || 'bg-muted text-muted-foreground border-border'
  return (
    <span className={`px-3 py-1 text-[10px] uppercase tracking-[0.25em] rounded-full border ${palette}`}>
      {(collapsed || 'pending').replace('_', ' ')}
    </span>
  )
}

// Convert "20:00" → "8:00 PM"
function formatTime12h(timeStr) {
  if (!timeStr) return ''
  const [hStr, mStr] = String(timeStr).split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10) || 0
  if (Number.isNaN(h)) return timeStr
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`
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
  const [showCancelModal, setShowCancelModal] = useState(false)
  const [cancelling, setCancelling] = useState(false)

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

  // Calculate cutoff times
  const getTimeUntilReservation = (res) => {
    if (!res || !res.date || !res.time) return null
    const resTime = new Date(`${res.date}T${res.time}:00`)
    return resTime.getTime() - Date.now()
  }

  const canEdit = (res) => {
    const timeUntil = getTimeUntilReservation(res)
    if (!timeUntil) return false
    // 2 hours = 7200000 ms
    return timeUntil > 2 * 60 * 60 * 1000 && !['cancelled', 'no_show', 'completed'].includes(res.status)
  }

  const canCancel = (res) => {
    const timeUntil = getTimeUntilReservation(res)
    if (!timeUntil) return false
    // 1 hour = 3600000 ms
    return timeUntil > 60 * 60 * 1000 && !['cancelled', 'no_show', 'completed'].includes(res.status)
  }

  const handleCancel = async () => {
    setCancelling(true)
    try {
      const res = await fetch(`/api/reservations/by-code/${encodeURIComponent(code)}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || 'Failed to cancel reservation')
        return
      }
      toast.success('Your reservation has been cancelled successfully.')
      setShowCancelModal(false)
      fetchReservation()
    } catch (e) {
      toast.error('Failed to cancel reservation')
    } finally {
      setCancelling(false)
    }
  }

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
  const subtext = STATUS_SUBTEXT[reservation.status] || null
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
            
            {/* Premium subtext for reassurance */}
            {subtext && !interrupted && (
              <p className="mt-3 text-sm text-muted-foreground leading-relaxed max-w-xl">
                {subtext}
              </p>
            )}

            {/* Pending / Confirmed: show only the basic reservation info.
                Table Assigned: status content is replaced by the premium
                table card below — we hide the basic info row here so the
                customer's eye lands on the table reveal. */}
            {!tableShown && !interrupted && (
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-5 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4 text-primary" />
                  {reservation.date}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-primary" />
                  {formatTime12h(reservation.time)}
                </span>
                <span className="flex items-center gap-1.5">
                  <Users className="h-4 w-4 text-primary" />
                  {reservation.guests} {reservation.guests === 1 ? 'guest' : 'guests'}
                </span>
              </div>
            )}

            {interrupted && (
              <p className="mt-4 text-sm text-muted-foreground">
                {reservation.date} · {formatTime12h(reservation.time)} · {reservation.guests} {reservation.guests === 1 ? 'guest' : 'guests'}
              </p>
            )}
          </div>

          {/* Timeline */}
          <div className="p-6 md:p-8 border-t border-border">
            <ReservationTimeline reservation={reservation} />
          </div>

          {/* Premium table card — replaces status content once a table is assigned. */}
          {tableShown && tableLabel && (
            <div className="p-6 md:p-8 border-t border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
              <p className="text-[10px] uppercase tracking-[0.4em] text-primary mb-5">Your Table</p>
              <div className="flex items-baseline gap-4 mb-6">
                <span className="font-serif text-5xl md:text-6xl text-primary leading-none">
                  Table {tableLabel}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-4 pt-5 border-t border-primary/15">
                {reservation.table_section ? (
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> Section
                    </p>
                    <p className="font-medium">{reservation.table_section}</p>
                  </div>
                ) : (
                  <div />
                )}
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Time
                  </p>
                  <p className="font-medium">{formatTime12h(reservation.time)}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                    <Users className="h-3 w-3" /> Guests
                  </p>
                  <p className="font-medium">
                    {reservation.guests} {reservation.guests === 1 ? 'Guest' : 'Guests'}
                  </p>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* Customer self-service actions */}
        {!interrupted && (
          <div className="flex flex-wrap gap-3 justify-center mb-6">
            {canEdit(reservation) ? (
              <Link href={`/reservations?edit=${code}`}>
                <Button variant="outline" size="lg" className="border-primary/30 text-primary hover:bg-primary/10">
                  <Edit2 className="h-4 w-4 mr-2" /> Edit Reservation
                </Button>
              </Link>
            ) : reservation.status !== 'cancelled' && (
              <div className="text-center max-w-md">
                <Button variant="outline" size="lg" disabled className="opacity-50">
                  <Edit2 className="h-4 w-4 mr-2" /> Edit Reservation
                </Button>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
                  For last-minute changes, please contact the restaurant directly so we can assist you personally.
                </p>
              </div>
            )}
            
            {canCancel(reservation) ? (
              <Button 
                variant="ghost" 
                size="lg"
                onClick={() => setShowCancelModal(true)}
                className="text-muted-foreground hover:text-destructive hover:bg-destructive/10"
              >
                <X className="h-4 w-4 mr-2" /> Cancel Reservation
              </Button>
            ) : reservation.status !== 'cancelled' && (
              <Button variant="ghost" size="lg" disabled className="opacity-50">
                <X className="h-4 w-4 mr-2" /> Cancel Reservation
              </Button>
            )}
          </div>
        )}

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

        {/* Cancellation Confirmation Modal */}
        <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">Cancel Reservation</DialogTitle>
              <DialogDescription className="text-base leading-relaxed pt-2">
                Your reservation will be released immediately and your table will become available for other guests.
              </DialogDescription>
            </DialogHeader>
            <div className="bg-muted/40 rounded-lg p-4 my-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div className="text-sm text-muted-foreground leading-relaxed">
                  This action cannot be undone. You'll need to make a new reservation if you change your mind.
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2 sm:gap-0">
              <Button 
                variant="outline" 
                onClick={() => setShowCancelModal(false)}
                disabled={cancelling}
              >
                Keep Reservation
              </Button>
              <Button 
                variant="destructive" 
                onClick={handleCancel}
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling...' : 'Confirm Cancellation'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

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
