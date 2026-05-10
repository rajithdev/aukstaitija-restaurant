'use client'
import {
  Hourglass, ShieldCheck, Table as TableIcon,
  Check, Clock, MapPin, Users, Calendar, Sparkles,
} from 'lucide-react'

// Customer-visible reservation lifecycle. Order matters — used to compute
// "current step" indices and decide what to reveal.
//
// Operational stages (arrived / checked_in / completed) are deliberately
// excluded — customers should only see: received → confirmed → table ready.
export const TIMELINE_STEPS = [
  { key: 'pending', label: 'Reservation Received', icon: Hourglass, blurb: 'Your request is with our team' },
  { key: 'confirmed', label: 'Confirmed', icon: ShieldCheck, blurb: 'Reserved for you' },
  { key: 'table_assigned', label: 'Table Assigned', icon: TableIcon, blurb: 'Your table awaits' },
]

export const REVEAL_AFTER_INDEX = TIMELINE_STEPS.findIndex(s => s.key === 'table_assigned')

export const STATUS_HEADLINES = {
  pending: 'Your reservation is being prepared.',
  confirmed: 'Your reservation is confirmed.',
  table_assigned: 'Your table is ready.',
  // Operational statuses still possible on the back end — collapse them into
  // the table-ready experience so the customer never sees stage churn after
  // the table has been assigned.
  arrived: 'Your table is ready.',
  checked_in: 'Your table is ready.',
  completed: 'Your table is ready.',
  cancelled: 'Reservation cancelled',
  no_show: 'Marked as no-show',
}

export const STATUS_SUBTEXT = {
  pending: 'Table details will be shared closer to your arrival for the best dining experience.',
  confirmed: 'We look forward to welcoming you. Your table assignment is being finalized.',
  table_assigned: 'Everything is prepared for your arrival.',
  arrived: 'Everything is prepared for your arrival.',
  checked_in: 'Everything is prepared for your arrival.',
  completed: 'Everything is prepared for your arrival.',
}

export function statusIndex(status) {
  // Map operational statuses (arrived/checked_in/completed) to the customer's
  // last visible stage — table_assigned — so the timeline doesn't appear stuck
  // or jump past the simplified 3-step flow.
  const collapsed = ['arrived', 'checked_in', 'completed'].includes(status)
    ? 'table_assigned'
    : status
  const idx = TIMELINE_STEPS.findIndex(s => s.key === collapsed)
  return idx === -1 ? 0 : idx
}

export function isTableRevealed(status) {
  // Once a table is assigned, keep it revealed for any downstream operational
  // status (arrived, checked_in, completed) so the customer's premium card
  // never disappears mid-experience.
  return ['table_assigned', 'arrived', 'checked_in', 'completed'].includes(status)
}

export default function ReservationTimeline({ reservation, compact = false }) {
  const currentIdx = statusIndex(reservation.status)
  const interrupted = reservation.status === 'cancelled' || reservation.status === 'no_show'

  return (
    <div className="relative">
      {/* connector line */}
      <div className="absolute left-0 right-0 top-5 h-0.5 bg-border" />
      <div
        className="absolute left-0 top-5 h-0.5 bg-primary transition-all duration-700 ease-out"
        style={{
          width: interrupted
            ? '0%'
            : `${(Math.max(currentIdx, 0) / (TIMELINE_STEPS.length - 1)) * 100}%`,
        }}
      />

      <ol className="relative grid grid-cols-3 gap-2 sm:gap-4">
        {TIMELINE_STEPS.map((step, idx) => {
          const Icon = step.icon
          const isDone = idx < currentIdx && !interrupted
          const isCurrent = idx === currentIdx && !interrupted
          const isUpcoming = idx > currentIdx || interrupted

          return (
            <li key={step.key} className="flex flex-col items-center text-center">
              <div
                className={[
                  'relative z-10 flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all',
                  isDone && 'bg-primary border-primary text-primary-foreground shadow-md',
                  isCurrent && 'bg-primary/15 border-primary text-primary ring-4 ring-primary/20 animate-pulse',
                  isUpcoming && 'bg-background border-border text-muted-foreground',
                ].filter(Boolean).join(' ')}
              >
                {isDone ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </div>
              <p
                className={[
                  'mt-2 text-[11px] sm:text-xs font-medium uppercase tracking-wider leading-tight',
                  isCurrent && 'text-primary',
                  isDone && 'text-foreground',
                  isUpcoming && 'text-muted-foreground/60',
                ].filter(Boolean).join(' ')}
              >
                {compact ? step.label.split(' ')[0] : step.label}
              </p>
            </li>
          )
        })}
      </ol>

      {interrupted && (
        <p className="mt-4 text-center text-xs uppercase tracking-wider text-destructive">
          {reservation.status === 'cancelled' ? 'Reservation cancelled' : 'Marked as no-show'}
        </p>
      )}
    </div>
  )
}

// Re-exports the icon set for callers that want to render header rows
// without re-importing from lucide-react.
export const TIMELINE_ICONS = { Calendar, Clock, Users, MapPin, Sparkles }
