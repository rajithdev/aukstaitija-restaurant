'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useApp } from '@/lib/AppContext'
import { Search, Plus, Flame, Leaf, WheatOff, Beef, Star, Clock } from 'lucide-react'
import { toast } from 'sonner'

function MenuPage() {
  const { t, lang, addToCart, tableId, tableNumber } = useApp()
  const [dishes, setDishes] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [dietary, setDietary] = useState('all')
  const [sort, setSort] = useState('popular')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/categories').then(r => r.json()).then(d => setCategories(Array.isArray(d) ? d : []))
  }, [])

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams({ search, category, dietary, sort }).toString()
    fetch(`/api/dishes?${qs}`).then(r => r.json()).then(d => {
      setDishes(Array.isArray(d) ? d : [])
      setLoading(false)
    })
  }, [search, category, dietary, sort])

  const dietaryFilters = [
    { key: 'all', label: t('menu.all'), icon: null },
    { key: 'veg', label: t('menu.veg'), icon: Leaf },
    { key: 'gluten-free', label: t('menu.gluten-free'), icon: WheatOff },
    { key: 'non-veg', label: t('menu.non-veg'), icon: Beef },
  ]

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* HERO */}
      <section className="container mx-auto pt-16 pb-12 text-center">
        <p className="text-primary text-xs uppercase tracking-[0.4em] mb-3">Carte du Jour</p>
        <h1 className="font-serif text-5xl md:text-7xl mb-4">{t('menu.title')}</h1>
        <p className="text-muted-foreground text-lg max-w-xl mx-auto">{t('menu.subtitle')}</p>
        {tableId && (
          <div className="mt-6 inline-flex items-center gap-3 bg-primary/15 border border-primary/30 px-6 py-3 rounded-full">
            <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-sm">Dine-in at <strong className="font-serif text-lg">Table {tableNumber}</strong></span>
          </div>
        )}
      </section>

      {/* FILTERS */}
      <section className="container mx-auto sticky top-16 z-40 bg-background/95 backdrop-blur-md py-4 border-y border-border">
        <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('menu.search')} className="pl-10 h-11" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button onClick={() => setCategory('all')} className={`px-4 h-11 rounded-md text-sm border transition ${category === 'all' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent hover:text-accent-foreground'}`}>{t('menu.all')}</button>
            {categories.map(c => (
              <button key={c.id} onClick={() => setCategory(c.id)} className={`px-4 h-11 rounded-md text-sm border transition ${category === c.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent hover:text-accent-foreground'}`}>
                {lang === 'lt' ? c.name_lt : c.name}
              </button>
            ))}
          </div>
          <select value={sort} onChange={e => setSort(e.target.value)} className="h-11 px-3 rounded-md text-sm bg-background border border-border">
            <option value="popular">{t('menu.sort_popular')}</option>
            <option value="price_asc">{t('menu.sort_price_asc')}</option>
            <option value="price_desc">{t('menu.sort_price_desc')}</option>
          </select>
        </div>
        <div className="flex gap-2 mt-3 flex-wrap">
          {dietaryFilters.map(f => {
            const Icon = f.icon
            return (
              <button key={f.key} onClick={() => setDietary(f.key)} className={`px-3 h-8 rounded-full text-xs flex items-center gap-1.5 border transition ${dietary === f.key ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-accent'}`}>
                {Icon && <Icon className="h-3 w-3" />} {f.label}
              </button>
            )
          })}
        </div>
      </section>

      {/* DISHES */}
      <section className="container mx-auto py-12">
        {loading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="aspect-[4/5] rounded-sm bg-muted shimmer" />
            ))}
          </div>
        ) : dishes.length === 0 ? (
          <div className="text-center py-24 text-muted-foreground">{t('menu.empty')}</div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {dishes.map(d => (
              <Card key={d.id} className="group overflow-hidden bg-card border-border hover:luxury-shadow transition-all duration-500">
                <Link href={`/menu/${d.id}`}>
                  <div className="aspect-[4/3] overflow-hidden relative">
                    <img src={d.image_url} alt={d.name} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                    {d.bestseller && (
                      <span className="absolute top-3 left-3 text-[10px] uppercase tracking-widest bg-primary text-primary-foreground px-2 py-1 rounded-sm flex items-center gap-1">
                        <Star className="h-3 w-3" /> {t('menu.bestseller')}
                      </span>
                    )}
                    <div className="absolute top-3 right-3 flex gap-1">
                      {d.dietary_tags?.includes('veg') && <span className="bg-green-700/90 text-white p-1 rounded-sm"><Leaf className="h-3 w-3" /></span>}
                      {d.dietary_tags?.includes('gluten-free') && <span className="bg-amber-700/90 text-white p-1 rounded-sm"><WheatOff className="h-3 w-3" /></span>}
                      {d.spice_level > 0 && <span className="bg-red-700/90 text-white p-1 rounded-sm"><Flame className="h-3 w-3" /></span>}
                    </div>
                  </div>
                </Link>
                <div className="p-5">
                  <Link href={`/menu/${d.id}`}>
                    <h3 className="font-serif text-2xl mb-2 group-hover:text-primary transition-colors">{lang === 'lt' ? d.name_lt : d.name}</h3>
                  </Link>
                  <p className="text-sm text-muted-foreground line-clamp-2 mb-4 min-h-[2.5rem]">{lang === 'lt' ? d.description_lt : d.description}</p>
                  <div className="flex items-center justify-between mb-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {d.prep_time} {t('menu.prep')}</span>
                    <span className="font-serif text-2xl text-primary">€{d.price.toFixed(2)}</span>
                  </div>
                  <Button onClick={() => { addToCart(d); toast.success(`${lang === 'lt' ? d.name_lt : d.name} → ${t('nav.cart')}`) }} className="w-full">
                    <Plus className="h-4 w-4" /> {t('menu.add')}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Footer />
    </div>
  )
}

export default MenuPage
