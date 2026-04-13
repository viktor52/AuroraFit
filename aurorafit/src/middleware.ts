import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis/cloudflare'
import { memoryRateLimit } from '@/lib/ipRateLimitMemory'

/**
 * Must match `COOKIE_NAME` in `src/lib/session.ts` (avoid importing session.ts here — it pulls Prisma into Edge).
 */
const SESSION_COOKIE = 'af_session'

const STATIC_PATH = /\.(ico|png|jpg|jpeg|svg|webp|gif|txt|xml|json|webmanifest|woff2?)$/i

/**
 * Paths that do not require an `af_session` cookie.
 * - `/admin/*` uses client-side admin secret (see AdminShell), not the user session cookie.
 */
function pathAllowsWithoutSessionCookie(pathname: string): boolean {
  if (pathname.startsWith('/_next')) return true
  if (pathname === '/favicon.ico') return true
  if (STATIC_PATH.test(pathname)) return true
  if (
    pathname === '/login' ||
    pathname === '/register' ||
    pathname === '/register/athlete' ||
    pathname === '/register/coach'
  ) {
    return true
  }
  if (pathname.startsWith('/admin')) return true
  return false
}

/**
 * Application-layer rate limiting for /api routes.
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

async function rateLimitApi(request: NextRequest): Promise<NextResponse> {
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

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname

  if (path.startsWith('/api')) {
    return rateLimitApi(request)
  }

  if (pathAllowsWithoutSessionCookie(path)) {
    return NextResponse.next()
  }

  const token = request.cookies.get(SESSION_COOKIE)?.value
  if (!token?.trim()) {
    const login = new URL('/login', request.url)
    if (path !== '/') {
      login.searchParams.set('next', path)
    }
    return NextResponse.redirect(login)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/api/:path*',
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
