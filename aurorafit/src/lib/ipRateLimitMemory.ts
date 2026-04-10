/**
 * Best-effort per-IP sliding window for a single Node/Edge isolate.
 * For production multi-instance or accurate limits, use Upstash (see middleware).
 */
const hits = new Map<string, number[]>()

const MAX_TRACKED_IPS = 8_000

function pruneMap() {
  if (hits.size <= MAX_TRACKED_IPS) return
  const toDelete = Math.floor(hits.size / 2)
  let i = 0
  for (const key of hits.keys()) {
    hits.delete(key)
    if (++i >= toDelete) break
  }
}

export function memoryRateLimit(ip: string, max: number, windowSeconds: number): boolean {
  const now = Date.now()
  const windowMs = windowSeconds * 1000
  const cutoff = now - windowMs

  let arr = hits.get(ip)
  if (!arr) {
    arr = []
    hits.set(ip, arr)
    if (hits.size > MAX_TRACKED_IPS) pruneMap()
  }

  const next = arr.filter((t) => t > cutoff)
  next.push(now)
  hits.set(ip, next)

  return next.length <= max
}
