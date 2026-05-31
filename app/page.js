// © 2025 Rajith Raja — Velora Systems. All rights reserved. Unauthorised copying or redistribution is prohibited.
'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { useApp } from '@/lib/AppContext'
import { ArrowRight, MapPin, Phone, Clock, Star, ChefHat, Sparkles, Quote } from 'lucide-react'

const HERO_IMG = 'https://images.unsplash.com/photo-1633387168457-7743cff768e4'
const ABOUT_IMG = 'https://images.unsplash.com/photo-1572715382241-f41ee117f1c4'

function Home() {
  const { t, lang } = useApp()
  const [featured, setFeatured] = useState([])

  useEffect(() => {
    fetch('/api/dishes?sort=popular').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setFeatured(d.filter(x => x.bestseller).slice(0, 4))
    })
  }, [])

  const testimonials = [
    { name: 'Eglė K.', city: 'Kaunas', text: 'Sophisticated and rooted. The cepelinai are a revelation. Service like a quiet symphony.', rating: 5 },
    { name: 'Marcus W.', city: 'Berlin', text: 'Best meal of my Baltic trip. Beef tenderloin with juniper jus is unforgettable.', rating: 5 },
    { name: 'Lina B.', city: 'Vilnius', text: 'A love letter to Lithuanian cuisine. The dessert alone is worth the journey.', rating: 5 },
  ]

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* HERO */}
      <section className="relative h-[92vh] min-h-[600px] flex items-end overflow-hidden">
        <div className="absolute inset-0">
          <img src={HERO_IMG} alt="Aukstaitija" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-background via-background/70 to-background/30" />
          <div className="absolute inset-0 grain" />
        </div>
        <div className="container mx-auto relative z-10 pb-20 md:pb-32">
          <div className="max-w-3xl animate-fadeUp">
            <p className="text-primary text-sm uppercase tracking-[0.4em] mb-6 flex items-center gap-3">
              <span className="h-px w-10 bg-primary inline-block" /> {t('hero.tagline')}
            </p>
            <h1 className="font-serif text-5xl md:text-7xl lg:text-8xl font-light leading-[1.05] mb-6 text-balance">
              {t('hero.title')}
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mb-10 leading-relaxed">
              {t('hero.subtitle')}
            </p>
            <div className="flex flex-wrap gap-4">
              <Link href="/menu">
                <Button size="lg" className="h-12 px-8 text-base">
                  {t('hero.cta_menu')} <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              </Link>
              <Link href="/reservations">
                <Button size="lg" variant="outline" className="h-12 px-8 text-base border-primary/50 hover:bg-primary hover:text-primary-foreground">
                  {t('hero.cta_book')}
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* STORY */}
      <section className="container mx-auto py-24 md:py-32 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <p className="text-primary text-xs uppercase tracking-[0.4em] mb-4">{t('home.story_label')}</p>
          <h2 className="font-serif text-4xl md:text-6xl mb-6 leading-tight">{t('home.story_title')}</h2>
          <p className="text-muted-foreground text-lg leading-relaxed mb-6">{t('home.story_text')}</p>
          <div className="flex gap-8 mt-10">
            <div>
              <ChefHat className="h-6 w-6 text-primary mb-3" />
              <p className="font-serif text-2xl">15+ Years</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Of craft</p>
            </div>
            <div>
              <Sparkles className="h-6 w-6 text-primary mb-3" />
              <p className="font-serif text-2xl">Seasonal</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Fresh menus</p>
            </div>
            <div>
              <Star className="h-6 w-6 text-primary mb-3" />
              <p className="font-serif text-2xl">4.9 / 5</p>
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Guest rating</p>
            </div>
          </div>
        </div>
        <div className="relative aspect-[4/5] luxury-shadow rounded-sm overflow-hidden">
          <img src={ABOUT_IMG} alt="Chef" className="w-full h-full object-cover" />
        </div>
      </section>

      {/* FEATURED DISHES */}
      <section className="py-24 bg-card">
        <div className="container mx-auto">
          <div className="text-center mb-16">
            <p className="text-primary text-xs uppercase tracking-[0.4em] mb-3">{t('home.featured_sub')}</p>
            <h2 className="font-serif text-4xl md:text-6xl">{t('home.featured')}</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featured.map((d, i) => (
              <Link key={d.id} href={`/menu/${d.id}`} className="group">
                <div className="aspect-square rounded-sm overflow-hidden mb-4 relative">
                  <img src={d.image_url} alt={d.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                  <span className="absolute top-3 left-3 text-[10px] uppercase tracking-widest bg-primary text-primary-foreground px-2 py-1 rounded-sm">{t('menu.bestseller')}</span>
                </div>
                <h3 className="font-serif text-xl mb-1 group-hover:text-primary transition-colors">{lang === 'lt' ? d.name_lt : d.name}</h3>
                <p className="text-sm text-muted-foreground line-clamp-1">{lang === 'lt' ? d.description_lt : d.description}</p>
                <p className="mt-2 font-medium text-primary">€{d.price.toFixed(2)}</p>
              </Link>
            ))}
          </div>
          <div className="text-center mt-12">
            <Link href="/menu">
              <Button variant="outline" className="h-11 px-8 border-primary/50">
                {t('home.view_full')} <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="container mx-auto py-24">
        <div className="text-center mb-16">
          <p className="text-primary text-xs uppercase tracking-[0.4em] mb-3">Voices</p>
          <h2 className="font-serif text-4xl md:text-6xl">{t('home.testimonials')}</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {testimonials.map((tm, i) => (
            <Card key={i} className="p-8 bg-card border-border">
              <Quote className="h-6 w-6 text-primary mb-4" />
              <p className="text-foreground/90 leading-relaxed mb-6 italic">"{tm.text}"</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">{tm.name}</p>
                  <p className="text-xs text-muted-foreground">{tm.city}</p>
                </div>
                <div className="flex gap-0.5">
                  {[...Array(tm.rating)].map((_, k) => <Star key={k} className="h-3 w-3 fill-primary text-primary" />)}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* VISIT / MAP */}
      <section className="container mx-auto py-24 grid md:grid-cols-2 gap-10">
        <div className="aspect-[4/3] rounded-sm overflow-hidden border border-border">
          <iframe
            src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d2298.6396067158687!2d23.901373!3d54.896858!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x46e7218e4dbcc3e7%3A0x123456789!2sVilniaus%20g.%2024%2C%20Kaunas!5e0!3m2!1sen!2slt!4v1700000000000"
            width="100%" height="100%" style={{ border: 0 }} loading="lazy" referrerPolicy="no-referrer-when-downgrade"
            title="Aukstaitija location"
          />
        </div>
        <div>
          <p className="text-primary text-xs uppercase tracking-[0.4em] mb-3">{t('home.visit')}</p>
          <h2 className="font-serif text-4xl md:text-5xl mb-6">Vilniaus g. 24<br/>Kaunas, Lithuania</h2>
          <div className="space-y-4 text-muted-foreground">
            <p className="flex items-start gap-3"><MapPin className="h-5 w-5 text-primary mt-0.5" /> Vilniaus g. 24, Kaunas LT-44280, Lithuania</p>
            <p className="flex items-start gap-3"><Phone className="h-5 w-5 text-primary mt-0.5" /> +370 612 34567</p>
            <p className="flex items-start gap-3"><Clock className="h-5 w-5 text-primary mt-0.5" />
              <span>Mon–Thu 12:00–22:00<br/>Fri–Sat 12:00–23:00<br/>Sun 13:00–21:00</span>
            </p>
          </div>
          <Link href="/reservations">
            <Button className="mt-8 h-12 px-8">{t('hero.cta_book')} <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  )
}

export default Home
