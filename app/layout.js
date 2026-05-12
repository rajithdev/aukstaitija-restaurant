import './globals.css'
import { AppProvider } from '@/lib/AppContext'
import { Toaster } from '@/components/ui/sonner'
import VersionGuard from '@/components/VersionGuard'

export const metadata = {
  title: 'Aukstaitija – Modern Lithuanian Fine Dining | Kaunas',
  description: 'Aukstaitija is a modern Lithuanian fine-dining restaurant in Kaunas. Centuries of tradition reimagined. Reserve, order delivery, or visit us.',
  keywords: 'restoranas Kaunas, lithuanian restaurant, fine dining kaunas, cepelinai, aukstaitija',
}

// Keep dev-mode reloads from being short-circuited and ensure CDNs revalidate.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

const BUILD_ID = process.env.NEXT_PUBLIC_APP_VERSION || 'dev'

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Hard cache busting at the document level — defends against mobile
            browsers (iOS Safari especially) that hold HTML shells for days. */}
        <meta httpEquiv="Cache-Control" content="no-store, no-cache, must-revalidate, max-age=0" />
        <meta httpEquiv="Pragma" content="no-cache" />
        <meta httpEquiv="Expires" content="0" />
        <meta name="x-app-version" content={BUILD_ID} />
        {/* Make the current build id visible to inline scripts and components */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{window.__APP_VERSION__=${JSON.stringify(BUILD_ID)};}catch(e){}
try{var t=localStorage.getItem('aukstaitija_theme')||'dark';if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}
/* Defensive: kill any stale service worker left over from a previous deploy
   BEFORE React even hydrates, so a stale SW can never intercept fetches. */
try{if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){try{r.unregister();}catch(e){}});}).catch(function(){});}}catch(e){}
try{if(typeof caches!=='undefined'&&caches.keys){caches.keys().then(function(ks){ks.forEach(function(k){try{caches.delete(k);}catch(e){}});}).catch(function(){});}}catch(e){}`
          }}
        />
      </head>
      <body>
        <AppProvider>
          <VersionGuard />
          {children}
          <Toaster richColors position="top-center" />
        </AppProvider>
      </body>
    </html>
  )
}
