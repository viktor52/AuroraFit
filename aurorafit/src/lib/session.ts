import { cookies } from 'next/headers'
import { createHash, randomBytes } from 'crypto'
import { prisma } from '@/lib/db'

const COOKIE_NAME = 'af_session'
const SESSION_HOURS = 8

function digestToken(token: string) {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function sessionCookieName() {
  return COOKIE_NAME
}

export async function createSessionForUser(userId: string) {
  const token = randomBytes(32).toString('base64url')
  const tokenDigest = digestToken(token)
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000)

  await prisma.session.create({
    data: { userId, tokenDigest, expiresAt },
    select: { id: true },
  })

  const cookieStore = await cookies()
  cookieStore.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: expiresAt,
  })

  return { expiresAt }
}

export async function clearSession() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (token) {
    const tokenDigest = digestToken(token)
    await prisma.session.deleteMany({ where: { tokenDigest } })
  }
  cookieStore.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    expires: new Date(0),
  })
}

export async function getSessionUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_NAME)?.value
  if (!token) return null

  const tokenDigest = digestToken(token)
  const now = new Date()

  const session = await prisma.session.findFirst({
    where: { tokenDigest, expiresAt: { gt: now } },
    select: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          athleteProfile: { select: { fullName: true } },
          coachProfile: { select: { fullName: true } },
        },
      },
      expiresAt: true,
    },
  })

  if (!session) return null
  return { user: session.user, expiresAt: session.expiresAt }
}

