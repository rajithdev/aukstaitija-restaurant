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
import { LogIn } from 'lucide-react'

function LoginPage() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/profile'
  const { login, user, authChecked } = useApp()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [err, setErr] = useState('')

  // If already logged in, bounce to the next page
  useEffect(() => {
    if (authChecked && user) router.replace(next)
  }, [user, authChecked, router, next])

  const submit = async (e) => {
    e.preventDefault()
    setErr('')
    setSubmitting(true)
    try {
      await login(email.trim(), password)
      toast.success('Welcome back!')
      router.replace(next)
    } catch (e) {
      setErr(e.message)
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="container mx-auto py-20 max-w-md">
        <p className="text-primary text-xs uppercase tracking-[0.4em] mb-3 text-center">Welcome back</p>
        <h1 className="font-serif text-5xl mb-3 text-center">Log in</h1>
        <p className="text-sm text-muted-foreground text-center mb-8">Pick up where you left off, see your orders and your favorites.</p>
        <Card className="p-6">
          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {err && <p className="text-sm text-destructive">{err}</p>}
            <Button type="submit" className="w-full h-11" disabled={submitting}>
              <LogIn className="h-4 w-4 mr-2" />
              {submitting ? 'Signing you in…' : 'Log in'}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              No account yet? <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ''}`} className="text-primary font-semibold">Create one</Link>
            </p>
            <p className="text-xs text-muted-foreground text-center">
              Forgot password? <span className="text-foreground/70">Please contact our team — password reset is coming soon.</span>
            </p>
          </form>
        </Card>
      </div>
      <Footer />
    </div>
  )
}

export default LoginPage
