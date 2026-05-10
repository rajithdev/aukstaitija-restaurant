'use client'
import {
  Hourglass, ShieldCheck, Table as TableIcon, UserCheck, Flag, BadgeCheck,
  Check, Clock, MapPin, Users, Calendar, Sparkles,
} from 'lucide-react'

// Customer-visible reservation lifecycle. Order matters — used to compute
// "current step" indices and decide what to reveal.
export const TIMELINE_STEPS = [
  { key: 'pending', label: 'Pending', icon: Hourglass, blurb: "We've got your request" },
  { key: 'confirmed', label: 'Confirmed', icon: ShieldCheck, blurb: 'Reservation locked in' },
  { key: 'table_assigned', label: 'Table Assigned', icon: TableIcon, blurb: 'Your table is ready' },
  { key: 'arrived', label: 'Arrived', icon: UserCheck, blurb: 'Welcome to Aukštaitija' },
  { key: 'checked_in', label: 'Checked In', icon: BadgeCheck, blurb: 'Seated and dining' },
  { key: 'completed', label: 'Completed', icon: Flag, blurb: 'Thank you for visiting' },
]

export const REVEAL_AFTER_INDEX = TIMELINE_STEPS.findIndex(s => s.key === 'table_assigned')

export const STATUS_HEADLINES = {
  pending: 'Reservation received',
  confirmed: 'Reservation confirmed. Table will be assigned shortly.',
  table_assigned: 'Your table is ready',
  arrived: "You've arrived — welcome",
  checked_in: "You're seated. Enjoy your meal",
  completed: 'Visit complete — thank you',
  cancelled: 'Reservation cancelled',
  no_show: 'Marked as no-show',
}

export function statusIndex(status) {
  const idx = TIMELINE_STEPS.findIndex(s => s.key === status)
  return idx === -1 ? 0 : idx
}

export function isTableRevealed(status) {
  return ['table_assigned', 'arrived', 'checked_in'].includes(status)
}

export default function ReservationTimeline({ reservation, compact = false }) {
  const currentIdx = statusIndex(reservation.status)
  const interrupted = reservation.status === 'cancelled' || reservation.status === 'no_show'
  const completed = reservation.status === 'completed'

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

      <ol className="relative grid grid-cols-6 gap-1 sm:gap-2">
        {TIMELINE_STEPS.map((step, idx) => {
          const Icon = step.icon
          const isDone = (idx < currentIdx && !interrupted) || (completed && idx <= currentIdx)
          const isCurrent = idx === currentIdx && !interrupted && !completed
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
                  'mt-2 text-[10px] sm:text-xs font-medium uppercase tracking-wider leading-tight',
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
