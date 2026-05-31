// © 2025 Rajith Raja — Velora Systems. All rights reserved. Unauthorised copying or redistribution is prohibited.
'use client'
import { useApp } from '@/lib/AppContext'
import { MapPin, Phone, Mail, Clock, Instagram, Facebook } from 'lucide-react'
import { useState } from 'react'

export default function Footer() {
  const { t } = useApp()
  const [email, setEmail] = useState('')
  const [done, setDone] = useState(false)
  const subscribe = async (e) => {
    e.preventDefault()
    if (!email) return
    await fetch('/api/newsletter', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) })
    setDone(true); setEmail('')
    setTimeout(() => setDone(false), 3000)
  }
  return (
    <footer className="border-t border-border bg-card mt-24">
      <div className="container mx-auto py-16 grid md:grid-cols-4 gap-10">
        <div className="md:col-span-2">
          <h3 className="font-serif text-3xl mb-4">Aukštaitija</h3>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-md">
            {t('home.story_text')}
          </p>
          <div className="flex gap-3 mt-6">
            <a href="#" className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-colors"><Instagram className="h-4 w-4" /></a>
            <a href="#" className="w-9 h-9 rounded-full border border-border flex items-center justify-center hover:bg-accent hover:text-accent-foreground transition-colors"><Facebook className="h-4 w-4" /></a>
          </div>
        </div>
        <div>
          <h4 className="font-serif text-lg mb-4">{t('home.visit')}</h4>
          <ul className="space-y-3 text-sm text-muted-foreground">
            <li className="flex items-start gap-2"><MapPin className="h-4 w-4 mt-0.5 text-primary" /> Vilniaus g. 24, Kaunas LT-44280</li>
            <li className="flex items-start gap-2"><Phone className="h-4 w-4 mt-0.5 text-primary" /> +370 612 34567</li>
            <li className="flex items-start gap-2"><Mail className="h-4 w-4 mt-0.5 text-primary" /> hello@aukstaitija.lt</li>
          </ul>
        </div>
        <div>
          <h4 className="font-serif text-lg mb-4">{t('home.hours')}</h4>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex justify-between"><span>Mon – Thu</span><span>12:00 – 22:00</span></li>
            <li className="flex justify-between"><span>Fri – Sat</span><span>12:00 – 23:00</span></li>
            <li className="flex justify-between"><span>Sunday</span><span>13:00 – 21:00</span></li>
          </ul>
          <form onSubmit={subscribe} className="mt-6 flex gap-2">
            <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md" />
            <button className="px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90">{done ? '✓' : t('home.newsletter_cta')}</button>
          </form>
        </div>
      </div>
      <div className="border-t border-border">
        <div className="container mx-auto py-6 flex flex-col md:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Aukštaitija. {t('footer.rights')}</span>
          <span>{t('footer.built')}</span>
        </div>
      </div>
    </footer>
  )
}
