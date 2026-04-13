import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis/cloudflare'
import { memoryRateLimit } from '@/lib/ipRateLimitMemory'

/**
 * Application-layer rate limiting for /api routes.
 *
 * This does not replace network-level DDoS protection (use your host, Cloudflare,
 * or a reverse proxy with limit_req). It limits abuse of your API and DB from
 * a single IP (login spam, scraping, accidental loops).
 */

const API_PER_MINUTE = 120
const AUTH_PER_MINUTE = 30

function clientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? '127.0.0.1'
}

type Limiters = { api: Ratelimit; auth: Ratelimit }

let redisLimiters: Limiters | null | undefined

function getRedisLimiters(): Limiters | null {
  if (redisLimiters !== undefined) return redisLimiters
  const url = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) {
    redisLimiters = null
    return null
  }
  const redis = new Redis({ url, token })
  redisLimiters = {
    api: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(API_PER_MINUTE, '1 m'),
      prefix: 'aurorafit:rl:api',
      analytics: false,
    }),
    auth: new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(AUTH_PER_MINUTE, '1 m'),
      prefix: 'aurorafit:rl:auth',
      analytics: false,
    }),
  }
  return redisLimiters
}

export async function middleware(request: NextRequest) {
  const ip = clientIp(request)
  const path = request.nextUrl.pathname
  const isAuth = path.startsWith('/api/auth')

  const redis = getRedisLimiters()
  if (redis) {
    const limiter = isAuth ? redis.auth : redis.api
    const { success, limit, remaining, reset } = await limiter.limit(ip)
    if (!success) {
      const retryAfterSec = Math.max(1, Math.ceil((reset - Date.now()) / 1000))
      return NextResponse.json(
        { ok: false, error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': String(retryAfterSec),
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': String(remaining),
          },
        },
      )
    }
    return NextResponse.next()
  }

  const ok = isAuth
    ? memoryRateLimit(ip, AUTH_PER_MINUTE, 60)
    : memoryRateLimit(ip, API_PER_MINUTE, 60)
  if (!ok) {
    return NextResponse.json(
      { ok: false, error: 'Too many requests. Please try again later.' },
      { status: 429 },
    )
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}
