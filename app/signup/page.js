'use client'
import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Navbar from '@/components/Navbar'
import Footer from '@/components/Footer'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useApp } from '@/lib/AppContext'
import { toast } from 'sonner'
import { UserPlus } from 'lucide-react'

function SignupPage() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/profile'
  const { signup, user, authChecked } = useApp()
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' })
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  useEffect(() => {
    if (authChecked && user) router.replace(next)
  }, [user, authChecked, router, next])

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    setSubmitting(true)
    try {
      const data = await signup({
        email: form.email.trim(),
        password: form.password,
        name: form.name.trim(),
        phone: form.phone.trim(),
      })
      const linked = (data.linked_orders || 0) + (data.linked_reservations || 0)
      if (linked > 0) {
        toast.success(`Welcome! We linked ${data.linked_orders || 0} past order(s) and ${data.linked_reservations || 0} reservation(s) to your account.`)
      } else {
        toast.success('Welcome to Aukstaitija!')
      }
      router.replace(next)
    } catch (e) {
      setErr(e.message)
      setSubmitting(false)
    }
  }

  const update = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }))

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto py-20 max-w-md">
        <p className="text-primary text-xs uppercase tracking-[0.4em] mb-3 text-center">Create account</p>
        <h1 className="font-serif text-5xl mb-3 text-center">Sign up</h1>
        <p className="text-sm text-muted-foreground text-center mb-8">Save your favorites, reorder in two taps, and we’ll automatically link any past orders we recognize.</p>
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input id="name" autoComplete="name" value={form.name} onChange={update('name')} required />
            </div>
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={form.email} onChange={update('email')} required />
            </div>
            <div>
              <Label htmlFor="phone">Phone <span className="text-muted-foreground">(optional)</span></Label>
              <Input id="phone" type="tel" autoComplete="tel" value={form.phone} onChange={update('phone')} placeholder="+370…" />
              <p className="text-xs text-muted-foreground mt-1">Helps us link previous guest orders to your new account.</p>
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={update('password')} required minLength={6} />
              <p className="text-xs text-muted-foreground mt-1">At least 6 characters.</p>
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full h-11" disabled={submitting}>
              <UserPlus className="h-4 w-4 mr-2" />
              {submitting ? 'Creating account…' : 'Create account'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              Already have an account? <Link href={`/login${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-primary font-semibold">Log in</Link>
            </p>
          </form>
        </Card>
      </div>
      <Footer />
    </div>
  )
}

export default SignupPage
