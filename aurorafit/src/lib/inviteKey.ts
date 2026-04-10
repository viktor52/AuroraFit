import { createHash, randomBytes } from 'crypto'

/** Server-side digest for storing and looking up coach invite keys (not reversible). */
export function digestCoachInviteKey(plainKey: string): string {
  const pepper = process.env.COACH_INVITE_PEPPER ?? ''
  return createHash('sha256').update(pepper + plainKey.trim(), 'utf8').digest('hex')
}

/** Human-readable one-time key for coaches (admin shares this once). */
export function generateCoachInvitePlainKey(): string {
  const hex = randomBytes(10).toString('hex').toUpperCase()
  return `AURORA-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}`
}
