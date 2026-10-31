import { timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { ACCESS_TOKEN } from './config.js'

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

export function tokenFromRequest(req: Request, url?: URL): string {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7).trim()
  const alt = req.headers['x-integral-token']
  if (typeof alt === 'string') return alt
  if (url) return url.searchParams.get('token') || ''
  return ''
}

export function isAuthorized(req: Request, url?: URL): boolean {
  if (!ACCESS_TOKEN) return true
  return safeEqual(tokenFromRequest(req, url), ACCESS_TOKEN)
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (isAuthorized(req)) {
    next()
    return
  }
  res.status(401).json({ error: 'Unauthorized', authRequired: true })
}
