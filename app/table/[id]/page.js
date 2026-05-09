'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useApp } from '@/lib/AppContext'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Utensils, MapPin, ArrowRight, X } from 'lucide-react'

function TableQrPage() {
  const params = useParams()
  const router = useRouter()
  const { setTableId, hydrated } = useApp()
  const [table, setTable] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(`/api/tables/${params.id}/info`).then(r => r.json()).then(d => {
      if (d.error) { setError(d.error); return }
      setTable(d)
      setTableId(d.id, d.number)
    })
  }, [params.id])

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="p-8 max-w-md text-center">
          <X className="h-12 w-12 mx-auto text-destructive mb-3" />
          <h1 className="font-serif text-2xl mb-2">Table not found</h1>
          <p className="text-sm text-muted-foreground mb-4">{error}</p>
          <Button onClick={() => router.push('/menu')}>Browse Menu</Button>
        </Card>
      </div>
    )
  }
  if (!table) return <div className="min-h-screen bg-background" />

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <Card className="p-8 max-w-md w-full text-center">
        <div className="w-20 h-20 mx-auto bg-primary/15 rounded-full flex items-center justify-center mb-5">
          <Utensils className="h-10 w-10 text-primary" />
        </div>
        <p className="text-primary text-xs uppercase tracking-[0.4em] mb-2">Welcome to</p>
        <h1 className="font-serif text-5xl mb-2">Aukštaitija</h1>
        <p className="text-muted-foreground mb-6">Modern Lithuanian Fine Dining · Kaunas</p>
        <div className="py-4 border-y border-border my-4">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">You are at</p>
          <p className="font-serif text-7xl gold-gradient my-2">Table {table.number}</p>
          <p className="text-sm text-muted-foreground flex items-center justify-center gap-1"><MapPin className="h-3 w-3" /> {table.section} · seats {table.capacity}</p>
        </div>
        <p className="text-sm text-muted-foreground mb-6">Browse the menu, build your order, and we'll bring it to your table.</p>
        <Button size="lg" className="w-full h-12" onClick={() => router.push('/menu')}>
          Open Menu <ArrowRight className="h-4 w-4 ml-1" />
        </Button>
        <p className="text-xs text-muted-foreground mt-4">Need help? Wave to your server.</p>
      </Card>
    </div>
  )
}

export default TableQrPage
