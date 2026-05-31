// © 2025 Rajith Raja — Velora Systems. All rights reserved. Unauthorised copying or redistribution is prohibited.
'use client'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, CreditCard, Banknote, X } from 'lucide-react'
import { useState } from 'react'

/**
 * PaymentConfirmModal — Premium confirmation dialog for completing table payments.
 * Replaces browser's native confirm() with a luxury-branded modal.
 * 
 * Design: Dark luxury theme, blurred backdrop, gold accents, smooth animations.
 */
export default function PaymentConfirmModal({
  open,
  onClose,
  onConfirm,
  amount,
  tableNumber,
  paymentMethod = 'cash',
  itemCount = 0,
}) {
  const [confirming, setConfirming] = useState(false)
  const [success, setSuccess] = useState(false)

  const handleConfirm = async () => {
    setConfirming(true)
    try {
      await onConfirm?.()
      setSuccess(true)
      // Show success state briefly before closing
      setTimeout(() => {
        setSuccess(false)
        setConfirming(false)
        onClose?.()
      }, 800)
    } catch (err) {
      setConfirming(false)
      // Error toast handled by parent
    }
  }

  const handleClose = () => {
    if (!confirming) onClose?.()
  }

  const PaymentIcon = paymentMethod === 'card' ? CreditCard : Banknote

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[440px] bg-zinc-950 border border-amber-500/20 text-zinc-100 p-0 overflow-hidden">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-4 border-b border-white/10 bg-gradient-to-b from-amber-500/5 to-transparent">
          <button
            onClick={handleClose}
            disabled={confirming}
            className="absolute right-4 top-4 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-zinc-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <X className="h-4 w-4" />
          </button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-amber-400/15 ring-1 ring-amber-400/30 flex items-center justify-center">
              <PaymentIcon className="h-5 w-5 text-amber-300" />
            </div>
            <h2 className="text-xl font-semibold text-zinc-100">
              Confirm Payment
            </h2>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-6 space-y-4">
          {/* Main confirmation message */}
          <div className="space-y-2">
            <p className="text-base text-zinc-200">
              Confirm <span className="font-medium text-amber-300">{paymentMethod}</span> payment of{' '}
              <span className="font-bold text-amber-300 text-lg">€{amount.toFixed(2)}</span>{' '}
              for <span className="font-medium text-zinc-100">Table {tableNumber}</span>?
            </p>
            <p className="text-xs text-zinc-500">
              This will close the dining session and reset the table to available.
            </p>
          </div>

          {/* Table summary */}
          {itemCount > 0 && (
            <div className="rounded-lg bg-white/[0.02] border border-white/5 px-4 py-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-zinc-400">Items ordered</span>
                <span className="text-zinc-200 font-medium">{itemCount}</span>
              </div>
            </div>
          )}

          {/* Payment method badge */}
          <div className="flex items-center gap-2">
            <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
              paymentMethod === 'card'
                ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
            }`}>
              <PaymentIcon className="h-3 w-3" />
              {paymentMethod === 'card' ? 'Card Payment' : 'Cash Payment'}
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-3">
          <Button
            onClick={handleClose}
            disabled={confirming}
            variant="outline"
            className="flex-1 h-11 bg-white/[0.02] hover:bg-white/[0.05] border-white/10 text-zinc-300 hover:text-zinc-100"
          >
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={confirming || success}
            className="flex-1 h-11 bg-amber-300 hover:bg-amber-200 text-zinc-950 font-semibold border-0 shadow-lg shadow-amber-500/20"
          >
            {success ? (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2 animate-in zoom-in duration-300" />
                Confirmed
              </>
            ) : confirming ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              'Confirm Payment'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
