// © 2025 Rajith Raja — Velora Systems. All rights reserved. Unauthorised copying or redistribution is prohibited.
'use client'
import { useEffect } from 'react'

/**
 * VersionGuard — guarantees mobile QR clients always run the latest build.
 *
 * On mount it:
 *   1. Unregisters any stale ServiceWorker that may have been registered by
 *      a previous version of the app (defensive — we do not ship a SW today,
 *      but iOS keeps them alive across deploys).
 *   2. Wipes every entry in window.caches (Cache Storage) for the same reason.
 *   3. Reads window.NEXT_PUBLIC_APP_VERSION (baked at build time) and compares
 *      it to the build_id returned by /api/version. If they disagree (e.g. the
 *      phone is holding a stale HTML shell), it hard-reloads with a cache-buster.
 *   4. Compares the server build_id with localStorage.app_build_id; if the
 *      user previously visited a different build, hard-reload once and persist
 *      the new build_id.
 *
 * Designed to be silent on first visit and self-healing on every deploy.
 */
export default function VersionGuard() {
  useEffect(() => {
    let cancelled = false

    // 1. Drop any stale service worker (defensive)
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((regs) => {
          regs.forEach((r) => r.unregister().catch(() => {}))
        }).catch(() => {})
      }
    } catch { /* ignore */ }

    // 2. Wipe Cache Storage (any old precaches)
    try {
      if (typeof caches !== 'undefined' && caches.keys) {
        caches.keys().then((keys) => {
          keys.forEach((k) => caches.delete(k).catch(() => {}))
        }).catch(() => {})
      }
    } catch { /* ignore */ }

    // 3. Compare server build_id with what the page believes it is
    const reloadOnce = (reason) => {
      try {
        // Guard against reload loops — only reload once per minute
        const last = parseInt(sessionStorage.getItem('vg_last_reload') || '0', 10)
        if (Date.now() - last < 60_000) return
        sessionStorage.setItem('vg_last_reload', String(Date.now()))
        // Append a cache-buster so the next request bypasses any intermediary
        const url = new URL(window.location.href)
        url.searchParams.set('_v', String(Date.now()))
        if (reason) url.searchParams.set('_r', reason)
        window.location.replace(url.toString())
      } catch {
        window.location.reload()
      }
    }

    const clientVersion =
      (typeof process !== 'undefined' && process.env && process.env.NEXT_PUBLIC_APP_VERSION) ||
      (typeof window !== 'undefined' && window.__APP_VERSION__) ||
      ''

    const checkVersion = async () => {
      try {
        const res = await fetch('/api/version', {
          method: 'GET',
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-store' },
        })
        if (!res.ok || cancelled) return
        const { build_id } = await res.json()
        if (!build_id) return

        // (a) server build_id differs from the one baked into this JS bundle
        //     → the phone is running a stale shell. Hard reload.
        if (clientVersion && build_id !== clientVersion) {
          reloadOnce('shell-mismatch')
          return
        }

        // (b) localStorage tracks the last build the user actually rendered.
        //     If it differs, refresh once so any in-flight state is fresh.
        try {
          const stored = localStorage.getItem('app_build_id')
          if (stored && stored !== build_id) {
            localStorage.setItem('app_build_id', build_id)
            reloadOnce('local-mismatch')
            return
          }
          if (!stored) localStorage.setItem('app_build_id', build_id)
        } catch { /* localStorage might be blocked — ignore */ }
      } catch { /* offline or transient — try again on next nav */ }
    }

    checkVersion()
    // Also re-check when the page is brought back to the foreground (mobile
    // browsers love to restore bfcached tabs from days ago).
    const onVisible = () => { if (document.visibilityState === 'visible') checkVersion() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('pageshow', onVisible)

    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('pageshow', onVisible)
    }
  }, [])

  return null
}
