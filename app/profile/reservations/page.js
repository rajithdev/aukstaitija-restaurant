'use client'
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useApp } from '@/lib/AppContext'
import { toast } from 'sonner'
import ReservationTimeline, {
  STATUS_HEADLINES, isTableRevealed,
} from '@/components/ReservationTimeline'
import {
  Bell, BellOff, Clock, MapPin, Users, Calendar,
  Flag, ChevronLeft, Link2, ChevronRight,
} from 'lucide-react'

function formatRelative(dt) {
  if (!dt) return ''
  const diff = (Date.now() - new Date(dt).getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return new Date(dt).toLocaleDateString()
}

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

function ReservationCard({ reservation, onUpdate }) {
  const tableRevealed = isTableRevealed(reservation.status)
  const interrupted = ['cancelled', 'no_show'].includes(reservation.status)
  const headline = STATUS_HEADLINES[reservation.status] || 'Reservation'

  // Pull table number from id (`t4` → `T4`). Section comes from notification meta
  // when present, otherwise from the embedded table doc if backend ever attaches it.
  const tableLabel = reservation.table_id
    ? `T${reservation.table_id.replace(/^t/, '')}`
    : null
  const sectionLabel = reservation.table_section || reservation.section || null

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-border bg-gradient-to-br from-primary/5 to-transparent">
        <h3 className="font-serif text-2xl">{headline}</h3>

        {/* Pending / Confirmed: show basic info. Table Assigned: hide here —
            the premium table card below replaces this content. */}
        {!tableRevealed && !interrupted && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5 text-primary" />
              {reservation.date}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-primary" />
              {formatTime12h(reservation.time)}
            </span>
            <span className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-primary" />
              {reservation.guests} {reservation.guests === 1 ? 'guest' : 'guests'}
            </span>
          </div>
        )}

        {interrupted && (
          <p className="mt-3 text-sm text-muted-foreground">
            {reservation.date} · {formatTime12h(reservation.time)} · {reservation.guests} {reservation.guests === 1 ? 'guest' : 'guests'}
          </p>
        )}
      </div>

      {/* Timeline */}
      <div className="p-6 border-b border-border">
        <ReservationTimeline reservation={reservation} />
      </div>

      {/* Premium table card — replaces status content once a table is assigned. */}
      {tableRevealed && tableLabel && (
        <div className="p-6 border-b border-border bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
          <p className="text-[10px] uppercase tracking-[0.4em] text-primary mb-4">Your Table</p>
          <p className="font-serif text-4xl text-primary leading-none mb-5">Table {tableLabel}</p>
          <div className="grid grid-cols-3 gap-4 pt-4 border-t border-primary/15">
            {sectionLabel ? (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> Section
                </p>
                <p className="font-medium">{sectionLabel}</p>
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

      {/* Footer — only the reservation code + tracker link. */}
      {reservation.reservation_code && (
        <div className="p-4 px-6 flex items-center justify-between gap-3 flex-wrap">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Code <span className="font-mono text-foreground">{reservation.reservation_code}</span>
          </p>
          <Link
            href={`/reservation/${reservation.reservation_code}`}
            className="text-xs text-primary hover:underline inline-flex items-center gap-1"
          >
            Open live tracker <ChevronRight className="h-3 w-3" />
          </Link>
        </div>
      )}
    </Card>
  )
}

function NotificationCenter({ notifications, unreadCount, onMarkRead, onMarkAllRead, loading }) {
  const hasUnread = unreadCount > 0
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className={`h-5 w-5 ${hasUnread ? 'text-primary' : 'text-muted-foreground'}`} />
            {hasUnread && (
              <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground rounded-full text-[10px] w-4 h-4 flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <div>
            <h2 className="font-serif text-lg">Notifications</h2>
            <p className="text-xs text-muted-foreground">
              {hasUnread ? `${unreadCount} unread` : 'All caught up'}
            </p>
          </div>
        </div>
        {hasUnread && (
          <Button variant="ghost" size="sm" onClick={onMarkAllRead}>
            Mark all read
          </Button>
        )}
      </div>

      <div className="max-h-[420px] overflow-y-auto">
        {loading ? (
          <p className="p-6 text-sm text-muted-foreground text-center">Loading…</p>
        ) : notifications.length === 0 ? (
          <div className="p-8 text-center">
            <BellOff className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">
              You're all caught up. We'll notify you the moment your table is assigned.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map(n => (
              <li
                key={n.id}
                className={`p-4 transition-colors ${!n.read ? 'bg-primary/5 hover:bg-primary/10' : 'hover:bg-accent/30'}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 h-2 w-2 rounded-full shrink-0 ${!n.read ? 'bg-primary' : 'bg-transparent'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-medium text-sm">{n.title}</p>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">
                        {formatRelative(n.created_at)}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">{n.message}</p>
                    {!n.read && (
                      <button
                        onClick={() => onMarkRead(n.id)}
                        className="mt-2 text-xs text-primary hover:underline"
                      >
                        Mark as read
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function ProfileReservationsPage() {
  const router = useRouter()
  const { user, authChecked } = useApp()
  const [reservations, setReservations] = useState([])
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loadingNotif, setLoadingNotif] = useState(true)
  const [loadingRes, setLoadingRes] = useState(true)
  // Guest reservations matching this user's email/phone that haven't been
  // claimed yet. Surfaces the "We found your previous reservations" prompt.
  const [linkable, setLinkable] = useState([])
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkDismissed, setLinkDismissed] = useState(false)

  useEffect(() => {
    if (authChecked && !user) router.replace('/login?next=/profile/reservations')
  }, [user, authChecked, router])

  const loadReservations = useCallback(async () => {
    setLoadingRes(true)
    try {
      const res = await fetch('/api/users/me/reservations', { credentials: 'include' })
      if (res.ok) setReservations(await res.json())
    } finally {
      setLoadingRes(false)
    }
  }, [])

  const loadNotifications = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setNotifications(data.notifications || [])
        setUnreadCount(data.unread_count || 0)
      }
    } finally {
      setLoadingNotif(false)
    }
  }, [])

  const loadLinkable = useCallback(async () => {
    try {
      const res = await fetch('/api/users/me/linkable-reservations', { credentials: 'include' })
      if (res.ok) {
        const data = await res.json()
        setLinkable(data.reservations || [])
      }
    } catch {}
  }, [])

  useEffect(() => {
    if (!user) return
    loadReservations()
    loadNotifications()
    loadLinkable()
    // Live-refresh every 10s so freshly-assigned tables and incoming
    // notifications appear without the user having to reload.
    const id = setInterval(() => {
      loadReservations()
      loadNotifications()
    }, 10000)
    return () => clearInterval(id)
  }, [user, loadReservations, loadNotifications, loadLinkable])

  const markRead = async (id) => {
    await fetch(`/api/notifications/${id}/read`, { method: 'POST', credentials: 'include' })
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
    setUnreadCount(c => Math.max(0, c - 1))
  }

  const markAllRead = async () => {
    const res = await fetch('/api/notifications/read-all', { method: 'POST', credentials: 'include' })
    if (res.ok) {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })))
      setUnreadCount(0)
      toast.success('All notifications marked as read')
    }
  }

  const linkReservations = async () => {
    if (linkable.length === 0) return
    setLinkBusy(true)
    try {
      const res = await fetch('/api/users/me/link-reservations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reservation_ids: linkable.map(r => r.id) }),
      })
      const data = await res.json()
      if (res.ok && data.linked > 0) {
        toast.success(`Linked ${data.linked} reservation${data.linked === 1 ? '' : 's'} to your account`)
        setLinkable([])
        await loadReservations()
      } else {
        toast.error(data.error || 'No reservations linked')
      }
    } catch {
      toast.error('Could not link reservations')
    } finally {
      setLinkBusy(false)
    }
  }

  // Hydrate reservation cards with section info pulled from the matching
  // table-assigned notification (the backend stores section in meta).
  const reservationsWithSection = useMemo(() => {
    return reservations.map(r => {
      const note = notifications.find(n => n.reservation_id === r.id && n.type === 'reservation_table_assigned')
      if (note?.meta?.section && !r.table_section) {
        return { ...r, table_section: note.meta.section }
      }
      return r
    })
  }, [reservations, notifications])

  const upcoming = useMemo(() => {
    return reservationsWithSection.filter(r => {
      const past = new Date(`${r.date}T${r.time}`).getTime() < Date.now() - 4 * 60 * 60 * 1000
      return !past && !['cancelled', 'no_show', 'completed'].includes(r.status)
    })
  }, [reservationsWithSection])

  const past = useMemo(() => {
    return reservationsWithSection.filter(r => {
      const isPast = new Date(`${r.date}T${r.time}`).getTime() < Date.now() - 4 * 60 * 60 * 1000
      return isPast || ['cancelled', 'no_show', 'completed'].includes(r.status)
    })
  }, [reservationsWithSection])

  if (!user) return null

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto py-12 max-w-5xl px-4">
        {/* Heading */}
        <div className="flex items-center gap-3 mb-2">
          <Link href="/profile" className="text-muted-foreground hover:text-primary inline-flex items-center gap-1 text-sm">
            <ChevronLeft className="h-4 w-4" /> Back to profile
          </Link>
        </div>
        <div className="mb-10">
          <p className="text-primary text-xs uppercase tracking-[0.4em] mb-2">My reservations</p>
          <h1 className="font-serif text-4xl md:text-5xl">Your dining timeline</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">
            Track each booking from request to seated. Your table number appears here the moment our manager assigns it.
          </p>
        </div>

        {/* Linkable-reservations prompt */}
        {!linkDismissed && linkable.length > 0 && (
          <Card className="mb-8 border-primary/40 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent">
            <div className="p-5 flex items-start gap-4">
              <div className="p-3 rounded-full bg-primary/15 text-primary shrink-0">
                <Link2 className="h-5 w-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-serif text-lg mb-1">We found your previous reservations</h3>
                <p className="text-sm text-muted-foreground mb-3">
                  We spotted {linkable.length} reservation{linkable.length === 1 ? '' : 's'} matching your email or phone that aren't linked to your account yet. Link them so they show up here forever.
                </p>
                <ul className="space-y-1 mb-4 text-xs text-muted-foreground">
                  {linkable.slice(0, 3).map(r => (
                    <li key={r.id} className="flex items-center gap-2">
                      <span className="font-mono text-primary/80">{r.reservation_code || r.confirmation}</span>
                      <span>·</span>
                      <span>{r.date} at {r.time}</span>
                      <span>·</span>
                      <span>{r.guests} {r.guests === 1 ? 'guest' : 'guests'}</span>
                    </li>
                  ))}
                  {linkable.length > 3 && (
                    <li className="text-muted-foreground/70">+ {linkable.length - 3} more</li>
                  )}
                </ul>
                <div className="flex gap-2 flex-wrap">
                  <Button onClick={linkReservations} disabled={linkBusy} size="sm">
                    {linkBusy ? 'Linking…' : `Link ${linkable.length} reservation${linkable.length === 1 ? '' : 's'}`}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setLinkDismissed(true)}>
                    Not now
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        )}

        {/* Notification center */}
        <div className="mb-10">
          <NotificationCenter
            notifications={notifications}
            unreadCount={unreadCount}
            onMarkRead={markRead}
            onMarkAllRead={markAllRead}
            loading={loadingNotif}
          />
        </div>

        {/* Upcoming reservations */}
        <section className="mb-12">
          <h2 className="font-serif text-2xl mb-4 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Upcoming
          </h2>
          {loadingRes ? (
            <Card className="p-6"><p className="text-sm text-muted-foreground">Loading…</p></Card>
          ) : upcoming.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-sm text-muted-foreground mb-3">
                No upcoming reservations yet.
              </p>
              <Link href="/reservations">
                <Button>Book a table</Button>
              </Link>
            </Card>
          ) : (
            <div className="space-y-6">
              {upcoming.map(r => (
                <ReservationCard key={r.id} reservation={r} onUpdate={loadReservations} />
              ))}
            </div>
          )}
        </section>

        {/* Past reservations */}
        {past.length > 0 && (
          <section>
            <h2 className="font-serif text-2xl mb-4 flex items-center gap-2 text-muted-foreground">
              <Flag className="h-5 w-5" />
              Past
            </h2>
            <div className="space-y-4">
              {past.slice(0, 10).map(r => (
                <Card key={r.id} className="p-5 opacity-80">
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <p className="text-[10px] uppercase tracking-[0.3em] text-muted-foreground mb-1">
                        #{r.confirmation}
                      </p>
                      <p className="font-medium">{r.date} at {r.time}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.guests} {r.guests === 1 ? 'guest' : 'guests'} · {r.seating_preference || 'No preference'}
                      </p>
                    </div>
                    <span className="text-xs uppercase tracking-wider px-3 py-1 rounded-full bg-accent text-accent-foreground">
                      {r.status?.replace('_', ' ')}
                    </span>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        )}
      </div>
      <Footer />
    </div>
  )
}

export default ProfileReservationsPage
