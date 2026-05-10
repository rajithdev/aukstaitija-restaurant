'use client'
import { useState, useMemo, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { 
  Calendar, Users, Clock, MapPin, DoorClosed, Home, Volume2, LogIn, Sparkles,
  Heart, Briefcase, Gift, UtensilsCrossed, Wine, PartyPopper, Check, X, 
  UserCheck, Table as TableIcon, AlertCircle, ChevronRight, TrendingUp, CalendarClock,
  Timer, AlarmClock, Bell,
} from 'lucide-react'
import { toast } from 'sonner'

const SEATING_ICONS = {
  'Window side': MapPin,
  'Main hall': Home,
  'Private room': DoorClosed,
  'Quiet area': Volume2,
  'Near entrance': LogIn,
  'No preference': Sparkles,
}

const OCCASION_ICONS = {
  'Casual dining': UtensilsCrossed,
  'Romantic dinner': Heart,
  'Business meeting': Briefcase,
  'Birthday celebration': Gift,
  'Anniversary': Wine,
  'Special event': PartyPopper,
}

const STATUS_STYLES = {
  pending: { bg: 'bg-amber-500/20', text: 'text-amber-400', border: 'border-amber-500/30', label: 'Pending' },
  confirmed: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30', label: 'Confirmed' },
  table_assigned: { bg: 'bg-cyan-500/20', text: 'text-cyan-300', border: 'border-cyan-500/30', label: 'Table Assigned' },
  arrived: { bg: 'bg-purple-500/20', text: 'text-purple-400', border: 'border-purple-500/30', label: 'Arrived' },
  checked_in: { bg: 'bg-rose-500/20', text: 'text-rose-400', border: 'border-rose-500/30', label: 'Seated' },
  completed: { bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30', label: 'Completed' },
  cancelled: { bg: 'bg-zinc-500/20', text: 'text-zinc-500', border: 'border-zinc-500/30', label: 'Cancelled' },
  no_show: { bg: 'bg-red-500/20', text: 'text-red-400', border: 'border-red-500/30', label: 'No-show' },
}

// Convert "20:00" to "8:00 PM"
function formatTime12h(timeStr) {
  if (!timeStr) return ''
  const [hStr, mStr] = timeStr.split(':')
  const h = parseInt(hStr, 10)
  const m = parseInt(mStr, 10) || 0
  const period = h >= 12 ? 'PM' : 'AM'
  const hour = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${hour}:${m.toString().padStart(2, '0')} ${period}`
}

// Returns relative time string for an upcoming reservation, or null if past/today-irrelevant
function relativeFromNow(date, time) {
  if (!date || !time) return null
  const target = new Date(`${date}T${time}:00`)
  if (isNaN(target.getTime())) return null
  const diffMs = target.getTime() - Date.now()
  if (diffMs <= 0) return null
  const totalMins = Math.round(diffMs / 60000)
  if (totalMins < 60) return `${totalMins}m`
  const h = Math.floor(totalMins / 60)
  const m = totalMins % 60
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

// Returns true if the reservation date is today
function isSameDay(dateStr) {
  if (!dateStr) return false
  const today = new Date().toISOString().split('T')[0]
  return dateStr === today
}

// ---------- Assignment countdown helpers ----------------------------------
// Statuses where the timer is active and the manager still owes a table
// assignment decision. Once the table is assigned (or the reservation is
// closed/cancelled/no-show) the timer becomes 'na'.
const TIMER_ACTIVE_STATUSES = new Set(['pending', 'confirmed'])
// Statuses where the reservation is already past the assignment phase and
// should sink to the bottom of the Today board.
const TIMER_DONE_STATUSES = new Set([
  'table_assigned', 'arrived', 'checked_in', 'completed', 'cancelled', 'no_show',
])
const ASSIGN_LEAD_MIN = 30  // assignment target = reservation_time − 30 min

// Returns the assignment-timer info for a reservation evaluated at `now`.
// state ∈ {'idle','soon','due','overdue','na'}:
//   na      — reservation outside actionable window (not today, status done…)
//   idle    — > 60 minutes until target (neutral chip)
//   soon    — 30–60 min until target (soft amber)
//   due     — inside the T-30 window (gold/orange)
//   overdue — past the target with no table yet (red)
function computeAssignmentTimer(reservation, now = Date.now()) {
  if (!reservation || !reservation.date || !reservation.time) {
    return { state: 'na' }
  }
  if (!TIMER_ACTIVE_STATUSES.has(reservation.status)) {
    return { state: 'na' }
  }
  const target = new Date(`${reservation.date}T${reservation.time}:00`).getTime()
  if (Number.isNaN(target)) return { state: 'na' }
  const assignAt = target - ASSIGN_LEAD_MIN * 60_000
  const minutesToTarget = Math.round((assignAt - now) / 60_000)

  let state
  if (minutesToTarget < 0) state = 'overdue'
  else if (minutesToTarget <= ASSIGN_LEAD_MIN) state = 'due'
  else if (minutesToTarget <= 60) state = 'soon'
  else state = 'idle'

  return {
    state,
    minutesToTarget,
    targetTimestamp: assignAt,
    reservationTimestamp: target,
  }
}

// Pretty-print "1h 20m" / "45m" / "12 min" — driven by minutes count.
function formatDurationMinutes(mins, { suffix = '' } = {}) {
  const abs = Math.abs(mins)
  if (abs < 60) return `${abs}m${suffix}`
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (m === 0) return `${h}h${suffix}`
  return `${h}h ${m}m${suffix}`
}

// Tailwind tones for each timer state. Kept in one place so the chip,
// banner, and card-edge accents stay in sync.
const TIMER_TONE = {
  idle:    { ring: 'ring-zinc-700/40',  bg: 'bg-zinc-800/40',           text: 'text-zinc-300',     accent: '' },
  soon:    { ring: 'ring-amber-500/30', bg: 'bg-amber-500/10',          text: 'text-amber-200',    accent: 'border-l-2 border-amber-500/40' },
  due:     { ring: 'ring-orange-500/40',bg: 'bg-gradient-to-r from-orange-500/15 to-amber-500/10', text: 'text-orange-200', accent: 'border-l-2 border-orange-400' },
  overdue: { ring: 'ring-red-500/50',   bg: 'bg-red-500/15',            text: 'text-red-200',      accent: 'border-l-2 border-red-500' },
}

function ReservationDashboard({ reservations = [], token, onUpdate }) {
  const [filter, setFilter] = useState('today')
  const [assigningTable, setAssigningTable] = useState(null)
  const [availableTables, setAvailableTables] = useState([])

  // ---- Live assignment-countdown ticker --------------------------------
  // Re-renders every 30 s so the "Assign in 1h 20m" chips stay accurate
  // without re-fetching from the server. 30 s is plenty for minute-grained
  // labels and keeps the component cheap.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // Track which reservations have already been toasted so the same
  // "table assignment due" alert doesn't fire on every tick.
  const toastedDueRef = useRef(new Set())
  useEffect(() => {
    for (const r of reservations) {
      if (!TIMER_ACTIVE_STATUSES.has(r.status)) continue
      const t = computeAssignmentTimer(r, now)
      if (t.state === 'due' || t.state === 'overdue') {
        if (!toastedDueRef.current.has(r.id)) {
          toastedDueRef.current.add(r.id)
          toast(`Table assignment needed for ${r.name}`, {
            description: `${formatTime12h(r.time)} · ${r.guests} ${r.guests === 1 ? 'guest' : 'guests'}`,
            icon: <AlarmClock className="h-4 w-4 text-orange-300" />,
          })
        }
      } else if (t.state === 'idle' || t.state === 'soon') {
        // Leaving the due/overdue window (rare — typically only happens after
        // the table is assigned and status changes); allow the alert to fire
        // again if the reservation re-enters the window later.
        toastedDueRef.current.delete(r.id)
      }
    }
  }, [reservations, now])

  const adminFetch = async (url, options = {}) => {
    const res = await fetch(url, { 
      ...options, 
      headers: { ...(options.headers || {}), 'x-admin-token': token, 'Content-Type': 'application/json' } 
    })
    return res.json()
  }

  const updateReservation = async (id, updates) => {
    try {
      const res = await adminFetch(`/api/reservations/${id}`, { 
        method: 'PUT', 
        body: JSON.stringify(updates) 
      })
      if (res.error) {
        toast.error(res.error)
      } else {
        toast.success('Reservation updated')
        onUpdate()
      }
    } catch (err) {
      toast.error('Update failed')
    }
  }

  const openAssignTable = async (reservation) => {
    setAssigningTable(reservation)
    const data = await adminFetch(`/api/reservations/${reservation.id}/available-tables`)
    setAvailableTables(data.available || [])
  }

  const assignTable = async (tableId) => {
    // Backend will set status='table_assigned' (and confirmed_at if needed),
    // and fire the in-app + email + SMS notifications. We just send table_id.
    await updateReservation(assigningTable.id, { table_id: tableId })
    setAssigningTable(null)
    setAvailableTables([])
  }

  // Filter logic
  const filtered = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const cutoffNow = new Date()
    
    let result = reservations

    if (filter === 'today') {
      result = result.filter(r => r.date === today)
    } else if (filter === 'upcoming') {
      result = result.filter(r => new Date(r.date) >= cutoffNow)
    } else if (filter === 'confirmed') {
      result = result.filter(r => r.status === 'confirmed')
    } else if (filter === 'pending') {
      result = result.filter(r => r.status === 'pending')
    } else if (filter === 'arrived') {
      result = result.filter(r => r.status === 'arrived')
    } else if (filter === 'cancelled') {
      result = result.filter(r => r.status === 'cancelled' || r.status === 'no_show')
    }

    // ---- Sort -----------------------------------------------------------
    // Today view ranks by assignment urgency so overdue / due reservations
    // float to the top. Other filters keep the simple chronological order.
    if (filter === 'today') {
      const STATE_RANK = { overdue: 0, due: 1, soon: 2, idle: 3, na: 4 }
      const isDoneStatus = (s) => TIMER_DONE_STATUSES.has(s)
      return [...result].sort((a, b) => {
        const aDone = isDoneStatus(a.status)
        const bDone = isDoneStatus(b.status)
        if (aDone !== bDone) return aDone ? 1 : -1 // already-handled rows sink
        const ta = computeAssignmentTimer(a, now)
        const tb = computeAssignmentTimer(b, now)
        const ra = STATE_RANK[ta.state] ?? 4
        const rb = STATE_RANK[tb.state] ?? 4
        if (ra !== rb) return ra - rb
        // Within the same urgency tier, earlier reservation time wins.
        const dateA = new Date(`${a.date}T${a.time}`).getTime()
        const dateB = new Date(`${b.date}T${b.time}`).getTime()
        return dateA - dateB
      })
    }

    return [...result].sort((a, b) => {
      const dateA = new Date(`${a.date}T${a.time}`)
      const dateB = new Date(`${b.date}T${b.time}`)
      return dateA - dateB
    })
  }, [reservations, filter, now])

  // Group by time for timeline view
  const timeline = useMemo(() => {
    const groups = {}
    filtered.forEach(r => {
      const key = `${r.date} ${r.time}`
      if (!groups[key]) groups[key] = []
      groups[key].push(r)
    })
    return Object.entries(groups).map(([key, items]) => ({ key, items }))
  }, [filtered])

  // Occupancy predictor
  const occupancy = useMemo(() => {
    const today = new Date().toISOString().split('T')[0]
    const todayReservations = reservations.filter(r => 
      r.date === today && !['cancelled', 'no_show', 'completed'].includes(r.status)
    )
    
    const byHour = {}
    todayReservations.forEach(r => {
      const hour = r.time.split(':')[0]
      byHour[hour] = (byHour[hour] || 0) + 1
    })
    
    return Object.entries(byHour)
      .map(([hour, count]) => ({ hour: `${hour}:00`, count }))
      .sort((a, b) => a.hour.localeCompare(b.hour))
  }, [reservations])

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: 'today', label: 'Today', icon: Calendar },
          { key: 'upcoming', label: 'Upcoming', icon: ChevronRight },
          { key: 'confirmed', label: 'Confirmed', icon: Check },
          { key: 'pending', label: 'Pending', icon: Clock },
          { key: 'arrived', label: 'Arrived', icon: UserCheck },
          { key: 'cancelled', label: 'Cancelled', icon: X },
        ].map(f => {
          const Icon = f.icon
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-all ${
                filter === f.key
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-400'
                  : 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:bg-zinc-800 hover:border-zinc-600'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="text-sm font-medium">{f.label}</span>
            </button>
          )
        })}
      </div>

      {/* Occupancy Predictor */}
      {filter === 'today' && occupancy.length > 0 && (
        <Card className="p-6 bg-gradient-to-br from-amber-500/10 to-amber-600/5 border-amber-500/30">
          <div className="flex items-center gap-3 mb-4">
            <TrendingUp className="h-5 w-5 text-amber-400" />
            <h3 className="font-semibold text-amber-100">Today's Occupancy Forecast</h3>
          </div>
          <div className="flex flex-wrap gap-4">
            {occupancy.map(slot => (
              <div key={slot.hour} className="flex flex-col items-center">
                <div className="text-2xl font-bold text-amber-400">{slot.count}</div>
                <div className="text-xs text-zinc-400">{slot.hour}</div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Timeline View */}
      {filtered.length === 0 && (
        <Card className="p-12 bg-zinc-900/30 border-zinc-800 text-center">
          <AlertCircle className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
          <p className="text-zinc-500">No reservations found for this filter</p>
        </Card>
      )}

      {timeline.map(({ key, items }) => (
        <div key={key} className="space-y-3">
          <div className="flex items-center gap-3 px-2">
            <Clock className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-zinc-300 uppercase tracking-wider">{key}</h3>
            <div className="flex-1 h-px bg-zinc-800"></div>
            <span className="text-xs text-zinc-500">{items.length} booking{items.length !== 1 ? 's' : ''}</span>
          </div>

          <div className="grid gap-4">
            {items.map(r => {
              const status = STATUS_STYLES[r.status] || STATUS_STYLES.pending
              const SeatingIcon = SEATING_ICONS[r.seating_preference] || Sparkles
              const OccasionIcon = OCCASION_ICONS[r.occasion] || UtensilsCrossed
              const timer = computeAssignmentTimer(r, now)
              const tone = TIMER_TONE[timer.state] || TIMER_TONE.idle
              
              // Format reservation date prominently
              const resDate = r.date ? new Date(r.date + 'T00:00:00') : null
              const dayName = resDate ? resDate.toLocaleDateString('en-US', { weekday: 'short' }) : ''
              const dateFormatted = resDate ? resDate.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' }) : r.date
              
              // Calculate time until reservation
              const reservationTime = r.date && r.time ? new Date(`${r.date}T${r.time}:00`) : null
              const resTimeMs = reservationTime ? reservationTime.getTime() - now : null
              const resTimeMins = resTimeMs ? Math.round(resTimeMs / 60000) : null
              
              let timeUntilBadge = null
              let timeUntilBadgeColor = 'bg-zinc-800/40 text-zinc-400'
              
              if (resTimeMins !== null && resTimeMins > 0) {
                if (resTimeMins < 30) {
                  timeUntilBadge = 'Starting now'
                  timeUntilBadgeColor = 'bg-red-500/20 text-red-300'
                } else if (resTimeMins < 60) {
                  timeUntilBadge = `In ${resTimeMins}m`
                  timeUntilBadgeColor = 'bg-orange-500/20 text-orange-300'
                } else {
                  const h = Math.floor(resTimeMins / 60)
                  const m = resTimeMins % 60
                  timeUntilBadge = m === 0 ? `In ${h}h` : `In ${h}h ${m}m`
                  timeUntilBadgeColor = 'bg-emerald-500/20 text-emerald-300'
                }
              } else if (resTimeMins !== null && resTimeMins <= 0) {
                timeUntilBadge = 'Overdue'
                timeUntilBadgeColor = 'bg-red-500/20 text-red-300'
              }

              return (
                <Card key={r.id} className={`p-6 bg-zinc-900/50 border-zinc-800 hover:border-zinc-700 transition-all group ${tone.accent}`}>
                  <div className="flex flex-col lg:flex-row gap-6">
                    {/* Left: Reservation Details */}
                    <div className="flex-1 space-y-4">
                      {/* Top: Date/Time Header - PROMINENT */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="flex items-center gap-3 mb-1">
                              <Calendar className="h-5 w-5 text-amber-400" />
                              <div>
                                <div className="text-lg font-semibold text-zinc-100">{dayName}, {dateFormatted}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <Clock className="h-5 w-5 text-amber-400" />
                              <div className="text-2xl font-bold text-amber-300">{formatTime12h(r.time)}</div>
                              {timeUntilBadge && (
                                <span className={`px-2.5 py-1 rounded-md text-xs font-semibold uppercase tracking-wide ${timeUntilBadgeColor}`}>
                                  {timeUntilBadge}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        
                        {r.table_id && (
                          <div className="px-4 py-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                            <div className="flex items-center gap-2">
                              <TableIcon className="h-5 w-5 text-amber-400" />
                              <span className="font-mono text-lg font-semibold text-amber-300">Table {r.table_id.replace('t', '')}</span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Customer Name & Status */}
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-2xl font-semibold text-zinc-100">{r.name}</h3>
                          <span className={`text-xs uppercase tracking-wider px-2.5 py-1 rounded-full border ${status.bg} ${status.text} ${status.border}`}>
                            {status.label}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-500 uppercase tracking-wider">#{r.confirmation}</p>
                      </div>

                      {/* Guest Count & Contact */}
                      <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm text-zinc-300">
                        <span className="flex items-center gap-2">
                          <Users className="h-4 w-4 text-amber-400" />
                          <span className="font-medium">{r.guests} {r.guests === 1 ? 'guest' : 'guests'}</span>
                        </span>
                        {r.phone && (
                          <span className="flex items-center gap-2">
                            <span className="text-amber-400">•</span>
                            <span>{r.phone}</span>
                          </span>
                        )}
                      </div>

                      {/* Assignment Reminder - Show for pending/confirmed only */}
                      {timer.state !== 'na' && timer.minutesToTarget !== undefined && (
                        <div className={`p-4 rounded-lg border ${tone.bg} ${tone.ring} border`}>
                          <div className="flex items-center gap-3">
                            <Bell className={`h-5 w-5 ${tone.text}`} />
                            <div>
                              <div className="text-sm font-semibold text-zinc-100">
                                {timer.state === 'overdue' ? 'Table assignment overdue!' : (() => {
                                  // Calculate assignment time (reservation time - 30 min)
                                  const [hStr, mStr] = r.time.split(':')
                                  let h = parseInt(hStr, 10)
                                  let m = parseInt(mStr, 10)
                                  m -= 30
                                  if (m < 0) {
                                    m += 60
                                    h -= 1
                                    if (h < 0) h += 24
                                  }
                                  const assignTime = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
                                  return `Assign table by ${formatTime12h(assignTime)}`
                                })()}
                              </div>
                              <div className={`text-xs ${tone.text}`}>
                                {timer.state === 'overdue' 
                                  ? `${Math.abs(timer.minutesToTarget)} minutes late` 
                                  : `${formatDurationMinutes(timer.minutesToTarget)} before reservation`}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Preferences - Compact */}
                      <div className="flex flex-wrap gap-3">
                        <div className="flex items-center gap-2 px-2.5 py-1 bg-zinc-800/50 rounded text-xs">
                          <SeatingIcon className="h-3.5 w-3.5 text-amber-400" />
                          <span className="text-zinc-400">{r.seating_preference}</span>
                        </div>
                        <div className="flex items-center gap-2 px-2.5 py-1 bg-zinc-800/50 rounded text-xs">
                          <OccasionIcon className="h-3.5 w-3.5 text-amber-400" />
                          <span className="text-zinc-400">{r.occasion}</span>
                        </div>
                      </div>

                      {/* Notes - If present */}
                      {(r.special_requests || r.notes) && (
                        <div className="pt-3 border-t border-zinc-800">
                          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Notes</p>
                          <p className="text-sm text-zinc-400 italic">"{r.special_requests || r.notes}"</p>
                        </div>
                      )}
                    </div>

                    {/* Right: Action Buttons */}
                    <div className="flex flex-col gap-2 lg:min-w-[220px]">
                      {!r.table_id && r.status !== 'cancelled' && r.status !== 'no_show' && (
                        <Button 
                          size="lg" 
                          onClick={() => openAssignTable(r)}
                          className="bg-amber-600 hover:bg-amber-500 text-white font-semibold"
                        >
                          <TableIcon className="h-4 w-4 mr-2" />
                          Assign Table
                        </Button>
                      )}

                      {(r.status === 'confirmed' || r.status === 'table_assigned') && (
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => updateReservation(r.id, { status: 'arrived' })}
                          className="border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                          disabled={!r.table_id}
                          title={!r.table_id ? 'Assign a table first' : ''}
                        >
                          <UserCheck className="h-4 w-4 mr-2" />
                          Mark Arrived
                        </Button>
                      )}

                      {r.status === 'arrived' && r.table_id && (
                        <Link href="/admin/floor">
                          <Button 
                            size="sm" 
                            className="w-full bg-rose-600 hover:bg-rose-500 text-white"
                          >
                            <TableIcon className="h-4 w-4 mr-2" />
                            Seat Guest
                          </Button>
                        </Link>
                      )}

                      {!['cancelled', 'no_show', 'completed'].includes(r.status) && (
                        <>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => updateReservation(r.id, { status: 'no_show' })}
                            className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                          >
                            No-show
                          </Button>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => updateReservation(r.id, { status: 'cancelled' })}
                            className="border-zinc-700 text-zinc-400 hover:bg-zinc-800"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>
              )
            })}
          </div>
        </div>
      ))}

      {/* Assign Table Modal */}
      {assigningTable && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-zinc-900 border-zinc-800 p-6">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-2xl font-serif text-zinc-100">Assign Table</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  {assigningTable.name} • {assigningTable.guests} guests • {assigningTable.seating_preference}
                </p>
              </div>
              <button 
                onClick={() => { setAssigningTable(null); setAvailableTables([]) }}
                className="p-2 hover:bg-zinc-800 rounded-lg transition"
              >
                <X className="h-5 w-5 text-zinc-400" />
              </button>
            </div>

            {availableTables.length === 0 && (
              <div className="text-center py-12">
                <AlertCircle className="h-12 w-12 text-zinc-600 mx-auto mb-3" />
                <p className="text-zinc-500">No available tables for this time slot</p>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-3">
              {availableTables.map(table => {
                const upcoming = table.upcoming_reservation
                const isOccupied = table.status === 'occupied'
                const isReserved = table.status === 'reserved' || (!!upcoming && !isOccupied)

                let badgeLabel = table.status
                let badgeClass = 'bg-zinc-700/40 text-zinc-300'
                if (table.status === 'available') {
                  badgeLabel = 'Available'
                  badgeClass = 'bg-emerald-500/20 text-emerald-400'
                } else if (isOccupied) {
                  badgeLabel = 'Occupied'
                  badgeClass = 'bg-rose-500/20 text-rose-400'
                } else if (isReserved) {
                  badgeLabel = 'Reserved'
                  badgeClass = 'bg-sky-500/20 text-sky-300'
                } else if (table.status === 'cleaning') {
                  badgeLabel = 'Cleaning'
                  badgeClass = 'bg-amber-500/20 text-amber-400'
                }

                // Build reservation timing line
                let timingLine = null
                if (upcoming && (isSameDay(upcoming.date) || !isOccupied)) {
                  const rel = isSameDay(upcoming.date) ? relativeFromNow(upcoming.date, upcoming.time) : null
                  const absLabel = formatTime12h(upcoming.time)
                  if (isOccupied) {
                    timingLine = (
                      <div className="mt-2 pt-2 border-t border-zinc-700/60 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-rose-300/90">
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                          Occupied now
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-sky-300">
                          <CalendarClock className="h-3.5 w-3.5" />
                          Next reserved: <span className="font-medium">{absLabel}</span>
                          {upcoming.name && (
                            <span className="text-zinc-500 truncate">· {upcoming.name}</span>
                          )}
                        </div>
                      </div>
                    )
                  } else {
                    // Reserved (future)
                    const showRel = rel && (() => {
                      // Show relative when within ~2 hours
                      const target = new Date(`${upcoming.date}T${upcoming.time}:00`)
                      return (target.getTime() - Date.now()) <= 2 * 60 * 60 * 1000
                    })()
                    timingLine = (
                      <div className="mt-2 pt-2 border-t border-zinc-700/60 space-y-1">
                        <div className="flex items-center gap-1.5 text-xs text-sky-300">
                          <CalendarClock className="h-3.5 w-3.5" />
                          {showRel ? (
                            <>Reserved in <span className="font-medium">{rel}</span> <span className="text-zinc-500">· {absLabel}</span></>
                          ) : (
                            <>Reserved at <span className="font-medium">{absLabel}</span></>
                          )}
                        </div>
                        {upcoming.name && (
                          <div className="text-[11px] text-zinc-500 pl-5 truncate">
                            Guest: {upcoming.name}{upcoming.guests ? ` · ${upcoming.guests}p` : ''}
                          </div>
                        )}
                      </div>
                    )
                  }
                } else if (isOccupied) {
                  timingLine = (
                    <div className="mt-2 pt-2 border-t border-zinc-700/60">
                      <div className="flex items-center gap-1.5 text-xs text-rose-300/90">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-rose-400 animate-pulse" />
                        Occupied now
                      </div>
                    </div>
                  )
                }

                return (
                  <button
                    key={table.id}
                    onClick={() => assignTable(table.id)}
                    className="p-4 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 hover:border-amber-500/50 rounded-xl transition-all text-left group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-semibold text-zinc-100">Table {table.number}</span>
                      <span className={`text-xs px-2 py-1 rounded-full ${badgeClass}`}>
                        {badgeLabel}
                      </span>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-zinc-400">
                      <span className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        {table.capacity}
                      </span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {table.section}
                      </span>
                    </div>
                    {timingLine}
                  </button>
                )
              })}
            </div>
          </Card>
        </div>
      )}
    </div>
  )
}

export default ReservationDashboard
