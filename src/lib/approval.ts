import { useAppStore } from '../store'
import type { ApprovalRequest } from './types'

let pending: { id: string; finish: (ok: boolean) => void } | null = null

export function requestApproval(
  request: Omit<ApprovalRequest, 'id'>,
  signal: AbortSignal,
): Promise<boolean> {
  if (signal.aborted) return Promise.resolve(false)
  const id = crypto.randomUUID()
  return new Promise<boolean>((resolve) => {
    const finish = (ok: boolean) => {
      signal.removeEventListener('abort', onAbort)
      if (pending?.id === id) pending = null
      useAppStore.getState().setApproval(null)
      resolve(ok)
    }
    const onAbort = () => finish(false)
    signal.addEventListener('abort', onAbort, { once: true })
    pending = { id, finish }
    useAppStore.getState().setApproval({ ...request, id })
  })
}

export function resolveApproval(ok: boolean) {
  pending?.finish(ok)
}
