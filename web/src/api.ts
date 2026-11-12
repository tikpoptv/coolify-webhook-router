export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

let onUnauthorized: () => void = () => {}

/** Called whenever an API request returns 401 (session expired). */
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn
}

export async function api<T = unknown>(
  path: string,
  opts: { method?: string; body?: unknown } = {},
): Promise<T> {
  const init: RequestInit = { method: opts.method ?? 'GET', credentials: 'same-origin' }
  if (opts.body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' }
    init.body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body)
  }
  const res = await fetch(path, init)
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = { error: text }
  }
  if (res.status === 401 && path !== '/api/login' && path !== '/api/me') onUnauthorized()
  if (!res.ok) {
    const msg = (data as { error?: string } | null)?.error || res.statusText
    throw new ApiError(msg, res.status)
  }
  return data as T
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e))
