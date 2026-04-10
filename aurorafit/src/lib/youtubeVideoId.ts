const YT_ID_RE = /^[\w-]{11}$/

/**
 * Extract an 11-character YouTube video id from a URL or raw id string.
 */
export function parseYoutubeVideoIdFromUrlOrId(input: string): string | null {
  const t = input.trim()
  if (!t) return null
  if (YT_ID_RE.test(t)) return t

  try {
    const u = new URL(t)
    const host = u.hostname.replace(/^www\./, '')

    if (host === 'youtu.be') {
      const id = u.pathname.replace(/^\//, '').split('/')[0]?.split('?')[0] ?? ''
      return YT_ID_RE.test(id) ? id : null
    }

    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = u.searchParams.get('v')
      if (v && YT_ID_RE.test(v)) return v
      const embed = u.pathname.match(/^\/embed\/([\w-]{11})/)
      if (embed?.[1] && YT_ID_RE.test(embed[1])) return embed[1]
      const shorts = u.pathname.match(/^\/shorts\/([\w-]{11})/)
      if (shorts?.[1] && YT_ID_RE.test(shorts[1])) return shorts[1]
      const live = u.pathname.match(/^\/live\/([\w-]{11})/)
      if (live?.[1] && YT_ID_RE.test(live[1])) return live[1]
    }
  } catch {
    return null
  }

  return null
}
