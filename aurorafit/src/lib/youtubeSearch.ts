const YT_ID_RE = /^[\w-]{11}$/

function pickInvidiousVideoId(data: unknown): string | null {
  if (!Array.isArray(data)) return null
  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    if (o.type !== 'video') continue
    const id = o.videoId
    if (typeof id === 'string' && YT_ID_RE.test(id)) return id
  }
  return null
}

/** YouTube Data API v3 — first search hit. */
async function youtubeDataApiFirstVideoId(query: string): Promise<string | null> {
  const key = process.env.YOUTUBE_API_KEY
  if (!key || !query.trim()) return null

  const url = new URL('https://www.googleapis.com/youtube/v3/search')
  url.searchParams.set('part', 'snippet')
  url.searchParams.set('q', query.trim().slice(0, 200))
  url.searchParams.set('type', 'video')
  url.searchParams.set('maxResults', '1')
  url.searchParams.set('key', key)

  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) return null

  const data = (await res.json().catch(() => null)) as {
    items?: Array<{ id?: { videoId?: string } }>
  } | null
  const id = data?.items?.[0]?.id?.videoId
  return typeof id === 'string' && YT_ID_RE.test(id) ? id : null
}

/** Invidious HTTP API — no Google key; used server-side only. */
async function invidiousSearchFirstVideoId(query: string, origin: string): Promise<string | null> {
  const base = origin.replace(/\/$/, '')
  const url = new URL(`${base}/api/v1/search`)
  url.searchParams.set('q', query.trim().slice(0, 200))

  const res = await fetch(url.href, {
    headers: { Accept: 'application/json', 'User-Agent': 'AuroraFit/1.0' },
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  })
  if (!res.ok) return null
  const data = await res.json().catch(() => null)
  return pickInvidiousVideoId(data)
}

const DEFAULT_INVIDIOUS_ORIGINS = [
  'https://invidious.projectsegfau.lt',
  'https://vid.puffyan.us',
]

/**
 * Resolves a YouTube video id for in-site embeds: YouTube Data API first, then Invidious search.
 * Invidious is optional infrastructure; set INVIDIOUS_API_ORIGIN to pin one instance in production.
 */
export async function resolveYoutubeEmbedVideoId(query: string): Promise<string | null> {
  const q = query.trim().slice(0, 200)
  if (!q) return null

  const fromGoogle = await youtubeDataApiFirstVideoId(q)
  if (fromGoogle) return fromGoogle

  const custom = process.env.INVIDIOUS_API_ORIGIN?.trim().replace(/\/$/, '')
  const origins = custom ? [custom] : DEFAULT_INVIDIOUS_ORIGINS

  for (const origin of origins) {
    try {
      const id = await invidiousSearchFirstVideoId(q, origin)
      if (id) return id
    } catch {
      // timeout / instance down — try next
    }
  }
  return null
}
