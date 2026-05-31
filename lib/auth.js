// © 2025 Rajith Raja — Velora Systems. All rights reserved. Unauthorised copying or redistribution is prohibited.
// Customer authentication helpers — HTTP-only cookie session backed by a JWT
// signed with HS256. We deliberately keep the token opaque to the browser; it's
// only ever read on the server.

import { SignJWT, jwtVerify } from 'jose'
import bcrypt from 'bcryptjs'

const COOKIE_NAME = 'aukstaitija_session'
const SESSION_TTL_DAYS = 30

function getSecret() {
  const secret = process.env.AUTH_JWT_SECRET
  if (!secret) throw new Error('AUTH_JWT_SECRET not configured')
  return new TextEncoder().encode(secret)
}

export async function hashPassword(plain) {
  return bcrypt.hash(plain, 10)
}

export async function verifyPassword(plain, hash) {
  if (!hash) return false
  return bcrypt.compare(plain, hash)
}

export async function signSession(payload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(getSecret())
}

export async function verifySession(token) {
  try {
    const { payload } = await jwtVerify(token, getSecret())
    return payload
  } catch {
    return null
  }
}

// Parse the session cookie out of the incoming Request and return the JWT payload.
// Returns null when there is no session or the JWT is invalid/expired.
export async function readSession(request) {
  const cookieHeader = request.headers.get('cookie') || ''
  const match = cookieHeader.split(';').map(c => c.trim()).find(c => c.startsWith(`${COOKIE_NAME}=`))
  if (!match) return null
  const token = decodeURIComponent(match.split('=').slice(1).join('='))
  if (!token) return null
  return verifySession(token)
}

// Build the Set-Cookie header value used to attach a freshly issued session.
export function buildSessionCookie(token) {
  const maxAge = SESSION_TTL_DAYS * 24 * 60 * 60
  // Use SameSite=Lax + HttpOnly. Secure flag is enabled when the deployed origin
  // is HTTPS, which is detected from NEXT_PUBLIC_BASE_URL.
  const isHttps = (process.env.NEXT_PUBLIC_BASE_URL || '').startsWith('https')
  const parts = [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (isHttps) parts.push('Secure')
  return parts.join('; ')
}

export function buildClearCookie() {
  const parts = [
    `${COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if ((process.env.NEXT_PUBLIC_BASE_URL || '').startsWith('https')) parts.push('Secure')
  return parts.join('; ')
}

// Strips the password hash so we never leak it back to the client.
export function publicUser(u) {
  if (!u) return null
  const { password_hash, _id, ...safe } = u
  return safe
}
