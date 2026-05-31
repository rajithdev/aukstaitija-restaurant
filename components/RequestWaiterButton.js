// © 2025 Rajith Raja — Velora Systems. All rights reserved. Unauthorised copying or redistribution is prohibited.
'use client'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Bell, Droplets, Receipt, AlertTriangle, HelpCircle, X } from 'lucide-react'
import { toast } from 'sonner'
import { useApp } from '@/lib/AppContext'

const REQUEST_TYPES = [
  { id: 'waiter', label: 'Request Waiter', icon: Bell, color: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30 text-amber-300' },
  { id: 'water', label: 'Need Water', icon: Droplets, color: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30 text-blue-300' },
  { id: 'bill', label: 'Request Bill', icon: Receipt, color: 'bg-purple-500/10 hover:bg-purple-500/20 border-purple-500/30 text-purple-300' },
  { id: 'allergy', label: 'Allergy Assistance', icon: AlertTriangle, color: 'bg-red-500/10 hover:bg-red-500/20 border-red-500/30 text-red-300' },
  { id: 'other', label: 'Other Help', icon: HelpCircle, color: 'bg-zinc-500/10 hover:bg-zinc-500/20 border-zinc-500/30 text-zinc-300' },
]

export default function RequestWaiterButton() {
  const { tableId, tableNumber } = useApp()
  const [showModal, setShowModal] = useState(false)
  const [selectedType, setSelectedType] = useState(null)
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Debug: Log when component mounts
  useEffect(() => {
    if (tableId) {
      console.log('✅ RequestWaiterButton mounted with tableId:', tableId)
    } else {
      console.log('❌ RequestWaiterButton mounted but no tableId')
    }
  }, [tableId])

  // Only show for dine-in customers
  if (!tableId) {
    console.log('⚠️ RequestWaiterButton: No tableId, not rendering')
    return null
  }

  const handleRequest = async (type) => {
    setSelectedType(type)
    // For waiter/water/bill, submit immediately without note
    if (type.id !== 'allergy' && type.id !== 'other') {
      await submitRequest(type.id, '')
    }
  }

  const submitRequest = async (typeId, noteText) => {
    setSubmitting(true)
    try {
      const res = await fetch('/api/guest-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          table_id: tableId,
          request_type: typeId,
          note: noteText,
        })
      })
      if (res.ok) {
        toast.success('Request sent to staff')
        setShowModal(false)
        setSelectedType(null)
        setNote('')
      } else {
        toast.error('Failed to send request')
      }
    } catch (e) {
      toast.error('Failed to send request')
    } finally {
      setSubmitting(false)
    }
  }

  const handleSubmitWithNote = async () => {
    if (selectedType) {
      await submitRequest(selectedType.id, note)
    }
  }

  return (
    <>
      {/* Floating Extended Pill Button - Mobile Optimized */}
      <button
        onClick={() => setShowModal(true)}
        style={{
          bottom: 'max(20px, env(safe-area-inset-bottom, 20px))',
          right: '20px',
        }}
        className="fixed z-[9999] group flex items-center gap-2 sm:gap-3 px-4 sm:px-5 py-3 sm:py-3.5 rounded-full bg-gradient-to-br from-amber-600/95 to-amber-700/95 backdrop-blur-xl border-2 border-amber-500/40 shadow-2xl shadow-amber-500/30 hover:shadow-amber-500/50 transition-all hover:scale-105 active:scale-95 animate-[subtle-pulse_25s_ease-in-out_infinite]"
        aria-label="Need Help"
      >
        <Bell className="h-4 w-4 sm:h-5 sm:w-5 text-white flex-shrink-0" />
        <span className="text-white font-semibold text-xs sm:text-sm whitespace-nowrap">Need Help</span>
      </button>

      {/* CSS for subtle pulse animation */}
      <style jsx>{`
        @keyframes subtle-pulse {
          0%, 90% {
            transform: scale(1);
            box-shadow: 0 20px 25px -5px rgba(217, 119, 6, 0.3), 0 8px 10px -6px rgba(217, 119, 6, 0.3);
          }
          95% {
            transform: scale(1.02);
            box-shadow: 0 20px 25px -5px rgba(217, 119, 6, 0.5), 0 8px 10px -6px rgba(217, 119, 6, 0.5);
          }
          100% {
            transform: scale(1);
            box-shadow: 0 20px 25px -5px rgba(217, 119, 6, 0.3), 0 8px 10px -6px rgba(217, 119, 6, 0.3);
          }
        }
      `}</style>

      {/* Request Modal */}
      <Dialog open={showModal} onOpenChange={setShowModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-serif text-2xl">Request Assistance</DialogTitle>
            <DialogDescription className="text-base">
              Table {tableNumber} — How can we help you?
            </DialogDescription>
          </DialogHeader>

          {!selectedType ? (
            <div className="grid gap-3 py-4">
              {REQUEST_TYPES.map(type => {
                const Icon = type.icon
                return (
                  <button
                    key={type.id}
                    onClick={() => handleRequest(type)}
                    disabled={submitting}
                    className={`flex items-center gap-3 p-4 rounded-lg border transition-all ${type.color}`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="font-medium">{type.label}</span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="space-y-4 py-4">
              <div className="flex items-center gap-3 p-4 rounded-lg border border-border bg-muted/50">
                {(() => {
                  const Icon = selectedType.icon
                  return <Icon className="h-5 w-5 text-muted-foreground" />
                })()}
                <span className="font-medium">{selectedType.label}</span>
              </div>
              
              <div>
                <label className="text-sm text-muted-foreground mb-2 block">Additional details (optional)</label>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="e.g., Need extra plates"
                  className="w-full h-24 px-3 py-2 bg-background border border-border rounded-md text-sm resize-none"
                  disabled={submitting}
                />
              </div>

              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => { setSelectedType(null); setNote('') }}
                  disabled={submitting}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  onClick={handleSubmitWithNote}
                  disabled={submitting}
                  className="flex-1 bg-amber-600 hover:bg-amber-500"
                >
                  {submitting ? 'Sending...' : 'Send Request'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
