'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { ArrowLeft, Printer, Download } from 'lucide-react'

function QrSheetPage() {
  const router = useRouter()
  const [tables, setTables] = useState([])
  const [origin, setOrigin] = useState('')

  useEffect(() => {
    const t = localStorage.getItem('aukstaitija_admin_token') || ''
    if (!t) { router.push('/admin'); return }
    setOrigin(window.location.origin)
    fetch('/api/tables', { headers: { 'x-admin-token': t } })
      .then(r => r.json())
      .then(d => Array.isArray(d) && setTables(d))
  }, [router])

  return (
    <div className="min-h-screen bg-background">
      {/* No-print toolbar */}
      <header className="sticky top-0 z-40 bg-background/95 backdrop-blur-md border-b border-border print:hidden">
        <div className="container mx-auto h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/floor" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /></Link>
            <h1 className="font-serif text-2xl">Table QR Codes</h1>
            <span className="text-xs text-muted-foreground hidden md:inline">Print, cut, and paste one on each table.</span>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => window.print()}><Printer className="h-4 w-4 mr-1" /> Print</Button>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-8 print:py-0">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 print:gap-3">
          {tables.map(t => {
            const url = `${origin}/table/${t.id}`
            const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&margin=0&data=${encodeURIComponent(url)}`
            return (
              <Card key={t.id} className="bg-white text-black p-6 break-inside-avoid print:border-2 print:border-black print:shadow-none">
                <div className="text-center">
                  <p className="text-xs uppercase tracking-[0.4em] text-amber-700 mb-1">Aukštaitija · Kaunas</p>
                  <p className="text-5xl mb-1" style={{ fontFamily: "'Cormorant Garamond', serif" }}>Table {t.number}</p>
                  <p className="text-xs text-gray-500 mb-3">{t.section} · seats {t.capacity}</p>
                  <div className="bg-white p-2 inline-block border-2 border-black">
                    <img src={qrSrc} alt={`QR table ${t.number}`} className="w-44 h-44" />
                  </div>
                  <p className="mt-3 text-sm font-semibold uppercase tracking-wider">Scan to order</p>
                  <p className="mt-1 text-xs text-gray-500">Browse the menu, build your order, we'll bring it to your table.</p>
                  <p className="mt-2 text-[10px] text-gray-400 break-all">{url}</p>
                </div>
              </Card>
            )
          })}
        </div>
        <p className="text-center text-xs text-muted-foreground mt-8 print:hidden">
          Tip: print on white card stock, cut along card borders, and laminate or place inside a small acrylic stand on each table.
        </p>
      </div>

      <style jsx global>{`
        @media print {
          body { background: white !important; }
          @page { margin: 1cm; }
        }
      `}</style>
    </div>
  )
}

export default QrSheetPage
