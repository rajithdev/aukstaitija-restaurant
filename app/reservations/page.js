'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card } from '@/components/ui/card'
import { useApp } from '@/lib/AppContext'
import {
  Calendar, Users, Clock, Check, Phone, MapPin, Home,
  DoorClosed, Volume2, LogIn, Sparkles, Heart, Briefcase,
  Gift, UtensilsCrossed, Wine, PartyPopper, ArrowRight, Search, X
} from 'lucide-react'
import { toast } from 'sonner'

const SEATING_PREFERENCES = [
  { value: 'Window side', icon: MapPin, desc: 'Natural light, street view' },
  { value: 'Main hall', icon: Home, desc: 'Central, lively atmosphere' },
  { value: 'Private room', icon: DoorClosed, desc: 'Intimate, exclusive' },
  { value: 'Quiet area', icon: Volume2, desc: 'Peaceful, secluded' },
  { value: 'Near entrance', icon: LogIn, desc: 'Quick access, convenient' },
  { value: 'No preference', icon: Sparkles, desc: 'We\'ll choose the best' },
]

const OCCASIONS = [
  { value: 'Casual dining', icon: UtensilsCrossed, badge: 'Relax', color: 'bg-blue-500/20 text-blue-600 dark:text-blue-400' },
  { value: 'Romantic dinner', icon: Heart, badge: 'Romance', color: 'bg-rose-500/20 text-rose-600 dark:text-rose-400' },
  { value: 'Business meeting', icon: Briefcase, badge: 'Business', color: 'bg-slate-500/20 text-slate-600 dark:text-slate-400' },
  { value: 'Birthday celebration', icon: Gift, badge: 'Birthday', color: 'bg-purple-500/20 text-purple-600 dark:text-purple-400' },
  { value: 'Anniversary', icon: Wine, badge: 'Anniversary', color: 'bg-amber-500/20 text-amber-600 dark:text-amber-400' },
  { value: 'Special event', icon: PartyPopper, badge: 'Event', color: 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400' },
]

function ReservationsPage() {
  const { t } = useApp()
  const router = useRouter()
  const today = new Date().toISOString().split('T')[0]
  const [date, setDate] = useState(today)
  const [time, setTime] = useState('')
  const [guests, setGuests] = useState(2)
  const [seatingPref, setSeatingPref] = useState('No preference')
  const [occasion, setOccasion] = useState('Casual dining')
  const [form, setForm] = useState({ name: '', phone: '', email: '', notes: '' })
  const [slots, setSlots] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [confirmed, setConfirmed] = useState(null)
  // Resume banner — pulled from localStorage on mount. Lets a returning
  // guest jump straight back to their tracking page.
  const [savedCode, setSavedCode] = useState(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const stored = localStorage.getItem('latest_reservation_code')
      if (stored) setSavedCode(stored)
    } catch {}
  }, [])

  const dismissResume = () => {
    setSavedCode(null)
    try { localStorage.removeItem('latest_reservation_code') } catch {}
  }

  useEffect(() => {
    fetch(`/api/reservations/availability?date=${date}`).then(r => r.json()).then(d => {
      setSlots(d.slots || [])
      setTime('')
    })
  }, [date])

  const submit = async (e) => {
    e.preventDefault()
    if (!time || !form.name || !form.phone) { 
      toast.error('Please complete all required fields')
      return 
    }
    setSubmitting(true)
    try {
      const res = await fetch('/api/reservations', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ...form, 
          date, 
          time, 
          guests,
          seating_preference: seatingPref,
          occasion,
          special_requests: form.notes 
        })
      })
      const data = await res.json()
      if (data.id) {
        // Persist the code so a guest who refreshes or returns later still
        // has their reservation reachable from the home/reservations page.
        if (data.reservation_code) {
          try { localStorage.setItem('latest_reservation_code', data.reservation_code) } catch {}
        }
        setConfirmed(data)
        // Brief celebratory pause then redirect to the public live tracker.
        setTimeout(() => {
          if (data.reservation_code) router.push(`/reservation/${data.reservation_code}`)
        }, 1800)
      } else {
        toast.error(data.error)
      }
    } finally { 
      setSubmitting(false) 
    }
  }

  if (confirmed) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-amber-950/20">
        <Navbar />
        <div className="container mx-auto py-20 max-w-2xl px-4">
          {/* Success Animation */}
          <div className="text-center mb-12">
            <div className="relative w-24 h-24 mx-auto mb-8">
              <div className="absolute inset-0 bg-gradient-to-br from-amber-500 to-amber-600 rounded-full animate-pulse opacity-20"></div>
              <div className="absolute inset-2 bg-gradient-to-br from-amber-500 to-amber-600 rounded-full flex items-center justify-center shadow-2xl shadow-amber-500/50">
                <Check className="h-12 w-12 text-white" strokeWidth={3} />
              </div>
            </div>
            <h1 className="font-serif text-5xl md:text-6xl mb-4 bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent">
              Reservation Received
            </h1>
            <p className="text-zinc-400 text-lg mb-3 max-w-xl mx-auto">
              Your reservation is confirmed. Your table will be assigned shortly — we'll notify you the moment it's ready.
            </p>
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full">
              <span className="text-amber-400 font-mono text-sm">Code:</span>
              <span className="text-amber-300 font-bold font-mono">{confirmed.reservation_code || confirmed.confirmation}</span>
            </div>
          </div>

          {/* Details Card */}
          <Card className="p-8 bg-zinc-900/50 backdrop-blur-xl border-zinc-800 shadow-2xl">
            <div className="space-y-6">
              <div className="flex items-start gap-4 pb-6 border-b border-zinc-800">
                <div className="p-3 bg-amber-500/10 rounded-xl">
                  <Calendar className="h-6 w-6 text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Date & Time</p>
                  <p className="text-xl text-zinc-100 font-semibold">{confirmed.date}</p>
                  <p className="text-lg text-amber-400">{confirmed.time}</p>
                </div>
              </div>

              <div className="flex items-start gap-4 pb-6 border-b border-zinc-800">
                <div className="p-3 bg-amber-500/10 rounded-xl">
                  <Users className="h-6 w-6 text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Party Size</p>
                  <p className="text-xl text-zinc-100 font-semibold">{confirmed.guests} {confirmed.guests === 1 ? 'Guest' : 'Guests'}</p>
                </div>
              </div>

              <div className="flex items-start gap-4 pb-6 border-b border-zinc-800">
                <div className="p-3 bg-amber-500/10 rounded-xl">
                  {SEATING_PREFERENCES.find(s => s.value === confirmed.seating_preference)?.icon 
                    ? <div className="h-6 w-6 text-amber-400">{(() => {
                        const Icon = SEATING_PREFERENCES.find(s => s.value === confirmed.seating_preference)?.icon
                        return Icon ? <Icon className="h-6 w-6" /> : null
                      })()}</div>
                    : <MapPin className="h-6 w-6 text-amber-400" />
                  }
                </div>
                <div className="flex-1">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Seating Preference</p>
                  <p className="text-lg text-zinc-100">{confirmed.seating_preference}</p>
                </div>
              </div>

              <div className="flex items-start gap-4 pb-6 border-b border-zinc-800">
                <div className="p-3 bg-amber-500/10 rounded-xl">
                  {OCCASIONS.find(o => o.value === confirmed.occasion)?.icon 
                    ? <div className="h-6 w-6 text-amber-400">{(() => {
                        const Icon = OCCASIONS.find(o => o.value === confirmed.occasion)?.icon
                        return Icon ? <Icon className="h-6 w-6" /> : null
                      })()}</div>
                    : <UtensilsCrossed className="h-6 w-6 text-amber-400" />
                  }
                </div>
                <div className="flex-1">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Occasion</p>
                  <p className="text-lg text-zinc-100">{confirmed.occasion}</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="p-3 bg-amber-500/10 rounded-xl">
                  <Phone className="h-6 w-6 text-amber-400" />
                </div>
                <div className="flex-1">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Contact</p>
                  <p className="text-lg text-zinc-100">{confirmed.name}</p>
                  <p className="text-sm text-zinc-400">{confirmed.phone}</p>
                  {confirmed.email && <p className="text-sm text-zinc-400">{confirmed.email}</p>}
                </div>
              </div>

              {confirmed.notes && (
                <div className="pt-6 border-t border-zinc-800">
                  <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">Special Notes</p>
                  <p className="text-sm text-zinc-300 italic">"{confirmed.notes}"</p>
                </div>
              )}
            </div>
          </Card>

          <Button 
            className="mt-8 w-full h-12 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white shadow-lg shadow-amber-500/20" 
            onClick={() => {
              if (confirmed.reservation_code) {
                router.push(`/reservation/${confirmed.reservation_code}`)
              }
            }}
          >
            View live tracker <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
          <p className="text-center text-xs text-zinc-500 mt-3">
            Redirecting you automatically…
          </p>
        </div>
        <Footer />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-950 via-zinc-900 to-amber-950/20">
      <Navbar />
      <div className="container mx-auto py-12 px-4">
        {/* Resume banner — visible when a guest has a saved reservation code */}
        {savedCode && !confirmed && (
          <div className="max-w-3xl mx-auto mb-8">
            <Card className="p-4 bg-amber-500/10 border-amber-500/30 backdrop-blur-sm">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="p-2 rounded-full bg-amber-500/20 text-amber-300">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm text-amber-100">Resume your reservation</p>
                  <p className="text-xs text-amber-200/70">
                    We saved your last booking — code <span className="font-mono">{savedCode}</span>
                  </p>
                </div>
                <Link href={`/reservation/${savedCode}`}>
                  <Button size="sm" className="bg-amber-500 hover:bg-amber-400 text-black">
                    Open tracker <ArrowRight className="h-3 w-3 ml-1.5" />
                  </Button>
                </Link>
                <button
                  onClick={dismissResume}
                  className="text-amber-200/60 hover:text-amber-100 p-1"
                  title="Dismiss"
                  aria-label="Dismiss resume banner"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </Card>
          </div>
        )}

        <div className="text-center mb-12">
          <p className="text-amber-400 text-xs uppercase tracking-[0.4em] mb-3">Reserve Your Table</p>
          <h1 className="font-serif text-5xl md:text-7xl mb-4 bg-gradient-to-r from-amber-200 via-amber-400 to-amber-200 bg-clip-text text-transparent">
            Exquisite Dining Experience
          </h1>
          <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
            Select your preferences and let us prepare a memorable evening for you
          </p>
          <p className="text-zinc-500 text-xs mt-3">
            Lost your reservation? <Link href="/reservation-lookup" className="text-amber-400 hover:text-amber-300 inline-flex items-center gap-1"><Search className="h-3 w-3" /> Look up by phone or email</Link>
          </p>
        </div>

        <form onSubmit={submit} className="max-w-5xl mx-auto space-y-8">
          {/* Date, Guests, Time */}
          <Card className="p-8 bg-zinc-900/50 backdrop-blur-xl border-zinc-800 shadow-2xl">
            <div className="grid md:grid-cols-2 gap-6 mb-8">
              <div>
                <Label className="flex items-center gap-2 text-zinc-300 mb-3">
                  <Calendar className="h-5 w-5 text-amber-400" /> Date
                </Label>
                <Input 
                  type="date" 
                  value={date} 
                  min={today} 
                  onChange={e => setDate(e.target.value)} 
                  className="h-12 bg-zinc-800/50 border-zinc-700 text-zinc-100 text-lg" 
                />
              </div>
              <div>
                <Label className="flex items-center gap-2 text-zinc-300 mb-3">
                  <Users className="h-5 w-5 text-amber-400" /> Number of Guests
                </Label>
                <select 
                  value={guests} 
                  onChange={e => setGuests(parseInt(e.target.value))} 
                  className="h-12 w-full px-4 bg-zinc-800/50 border border-zinc-700 rounded-md text-lg text-zinc-100"
                >
                  {[1,2,3,4,5,6,7,8].map(n => <option key={n} value={n}>{n} {n === 1 ? 'Guest' : 'Guests'}</option>)}
                </select>
              </div>
            </div>

            <Label className="flex items-center gap-2 text-zinc-300 mb-4">
              <Clock className="h-5 w-5 text-amber-400" /> Select Time
            </Label>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {slots.length === 0 && (
                <p className="col-span-full text-center text-zinc-500 py-4">Select a date to see available times</p>
              )}
              {slots.map(s => (
                <button 
                  key={s.time} 
                  type="button" 
                  disabled={s.available === 0}
                  onClick={() => setTime(s.time)}
                  className={`p-3 text-sm font-medium rounded-lg border transition-all duration-200 ${
                    time === s.time 
                      ? 'bg-gradient-to-br from-amber-600 to-amber-500 text-white border-amber-400 shadow-lg shadow-amber-500/30 scale-105' 
                      : s.available === 0 
                        ? 'opacity-30 cursor-not-allowed border-zinc-800 bg-zinc-900 text-zinc-600' 
                        : 'border-zinc-700 bg-zinc-800/50 text-zinc-300 hover:bg-zinc-800 hover:border-amber-500/50 hover:text-amber-400'
                  }`}
                >
                  {s.time}
                </button>
              ))}
            </div>
          </Card>

          {/* Seating Preference */}
          <Card className="p-8 bg-zinc-900/50 backdrop-blur-xl border-zinc-800 shadow-2xl">
            <Label className="flex items-center gap-2 text-zinc-300 mb-4">
              <MapPin className="h-5 w-5 text-amber-400" /> Seating Preference
            </Label>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {SEATING_PREFERENCES.map(pref => {
                const Icon = pref.icon
                const isSelected = seatingPref === pref.value
                return (
                  <button
                    key={pref.value}
                    type="button"
                    onClick={() => setSeatingPref(pref.value)}
                    className={`group relative p-6 rounded-xl border-2 transition-all duration-300 text-left ${
                      isSelected
                        ? 'bg-gradient-to-br from-amber-600/20 to-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/20'
                        : 'bg-zinc-800/30 border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className={`absolute top-4 right-4 w-5 h-5 rounded-full border-2 transition-all ${
                      isSelected 
                        ? 'bg-amber-500 border-amber-400 shadow-lg shadow-amber-500/50' 
                        : 'border-zinc-600'
                    }`}>
                      {isSelected && <Check className="h-full w-full text-white p-0.5" strokeWidth={3} />}
                    </div>
                    <Icon className={`h-8 w-8 mb-3 transition-colors ${
                      isSelected ? 'text-amber-400' : 'text-zinc-500 group-hover:text-zinc-400'
                    }`} />
                    <p className={`font-semibold mb-1 transition-colors ${
                      isSelected ? 'text-amber-100' : 'text-zinc-300 group-hover:text-zinc-200'
                    }`}>
                      {pref.value}
                    </p>
                    <p className={`text-xs transition-colors ${
                      isSelected ? 'text-amber-300/80' : 'text-zinc-500 group-hover:text-zinc-400'
                    }`}>
                      {pref.desc}
                    </p>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Occasion */}
          <Card className="p-8 bg-zinc-900/50 backdrop-blur-xl border-zinc-800 shadow-2xl">
            <Label className="flex items-center gap-2 text-zinc-300 mb-4">
              <Sparkles className="h-5 w-5 text-amber-400" /> Occasion
            </Label>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {OCCASIONS.map(occ => {
                const Icon = occ.icon
                const isSelected = occasion === occ.value
                return (
                  <button
                    key={occ.value}
                    type="button"
                    onClick={() => setOccasion(occ.value)}
                    className={`group relative p-6 rounded-xl border-2 transition-all duration-300 text-left ${
                      isSelected
                        ? 'bg-gradient-to-br from-amber-600/20 to-amber-500/10 border-amber-500 shadow-lg shadow-amber-500/20'
                        : 'bg-zinc-800/30 border-zinc-700 hover:border-zinc-600 hover:bg-zinc-800/50'
                    }`}
                  >
                    <div className={`absolute top-4 right-4 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${occ.color}`}>
                      {occ.badge}
                    </div>
                    <Icon className={`h-8 w-8 mb-3 transition-colors ${
                      isSelected ? 'text-amber-400' : 'text-zinc-500 group-hover:text-zinc-400'
                    }`} />
                    <p className={`font-semibold transition-colors ${
                      isSelected ? 'text-amber-100' : 'text-zinc-300 group-hover:text-zinc-200'
                    }`}>
                      {occ.value}
                    </p>
                  </button>
                )
              })}
            </div>
          </Card>

          {/* Contact Details */}
          <Card className="p-8 bg-zinc-900/50 backdrop-blur-xl border-zinc-800 shadow-2xl">
            <Label className="text-zinc-300 mb-6 block text-lg">Contact Information</Label>
            <div className="grid sm:grid-cols-2 gap-6 mb-6">
              <div>
                <Label className="text-zinc-400 mb-2 block">Full Name *</Label>
                <Input 
                  value={form.name} 
                  onChange={e => setForm({...form, name: e.target.value})} 
                  required 
                  placeholder="John Doe"
                  className="h-12 bg-zinc-800/50 border-zinc-700 text-zinc-100" 
                />
              </div>
              <div>
                <Label className="text-zinc-400 mb-2 block">Phone Number *</Label>
                <Input 
                  value={form.phone} 
                  onChange={e => setForm({...form, phone: e.target.value})} 
                  required 
                  placeholder="+370 600 12345"
                  className="h-12 bg-zinc-800/50 border-zinc-700 text-zinc-100" 
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-zinc-400 mb-2 block">Email (Optional)</Label>
                <Input 
                  type="email" 
                  value={form.email} 
                  onChange={e => setForm({...form, email: e.target.value})} 
                  placeholder="john@example.com"
                  className="h-12 bg-zinc-800/50 border-zinc-700 text-zinc-100" 
                />
              </div>
              <div className="sm:col-span-2">
                <Label className="text-zinc-400 mb-2 block">Special Notes (Optional)</Label>
                <textarea 
                  value={form.notes} 
                  onChange={e => setForm({...form, notes: e.target.value})} 
                  placeholder="Allergies, accessibility needs, or special requests..."
                  className="w-full p-4 bg-zinc-800/50 border border-zinc-700 rounded-md text-zinc-100 min-h-[100px] resize-none focus:outline-none focus:ring-2 focus:ring-amber-500/50" 
                />
              </div>
            </div>
          </Card>

          <Button 
            type="submit" 
            size="lg" 
            className="w-full h-14 text-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white shadow-xl shadow-amber-500/30 transition-all duration-300" 
            disabled={submitting || !time}
          >
            {submitting ? 'Reserving Your Table...' : 'Complete Reservation'}
          </Button>
        </form>
      </div>
      <Footer />
    </div>
  )
}

export default ReservationsPage
