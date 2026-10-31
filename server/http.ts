import type { NextFunction, Request, Response } from 'express'

export class HttpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export function asyncRoute(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next)
  }
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const status = err instanceof HttpError ? err.status : 500
  const message = err instanceof Error ? err.message : 'Unknown error'
  if (status >= 500) console.error('[integral]', err)
  if (!res.headersSent) res.status(status).json({ error: message })
  else res.end()
}
