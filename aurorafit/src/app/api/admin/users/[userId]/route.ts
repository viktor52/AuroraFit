import { NextResponse } from 'next/server'
import type { Role } from '@/generated/prisma/enums'
import { prisma } from '@/lib/db'
import { adminSecretOk } from '@/lib/adminAuth'

const ROLES: Role[] = ['ATHLETE', 'COACH', 'ADMIN']

function assertAdmin(req: Request) {
  if (!adminSecretOk(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized.' }, { status: 401 })
  }
  return null
}

async function applyRoleSideEffects(userId: string, role: Role) {
  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { role },
    })

    await tx.session.deleteMany({ where: { userId } })

    if (role === 'ATHLETE') {
      await tx.coachProfile.deleteMany({ where: { userId } })
      await tx.coachAthlete.deleteMany({ where: { coachId: userId } })
      await tx.athleteProfile.upsert({
        where: { userId },
        create: { userId },
        update: {},
      })
    } else if (role === 'COACH') {
      await tx.athleteProfile.deleteMany({ where: { userId } })
      await tx.coachAthlete.deleteMany({ where: { athleteId: userId } })
      await tx.athleteProgramAssignment.deleteMany({ where: { athleteId: userId } })
      await tx.coachProfile.upsert({
        where: { userId },
        create: { userId },
        update: {},
      })
    } else {
      await tx.athleteProfile.deleteMany({ where: { userId } })
      await tx.coachProfile.deleteMany({ where: { userId } })
      await tx.coachAthlete.deleteMany({
        where: { OR: [{ coachId: userId }, { athleteId: userId }] },
      })
      await tx.athleteProgramAssignment.deleteMany({ where: { athleteId: userId } })
    }
  })
}

export async function PATCH(req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const unauthorized = assertAdmin(req)
  if (unauthorized) return unauthorized

  const { userId } = await ctx.params
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Missing user id.' }, { status: 400 })
  }

  const body = (await req.json().catch(() => null)) as { role?: unknown } | null
  const role = body?.role as Role | undefined
  if (!role || !ROLES.includes(role)) {
    return NextResponse.json({ ok: false, error: 'Invalid role.' }, { status: 400 })
  }

  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  })
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 })
  }

  if (existing.role !== role) {
    await applyRoleSideEffects(userId, role)
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      role: true,
      createdAt: true,
      athleteProfile: { select: { fullName: true } },
      coachProfile: { select: { fullName: true } },
    },
  })

  return NextResponse.json({ ok: true, user })
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ userId: string }> }) {
  const unauthorized = assertAdmin(_req)
  if (unauthorized) return unauthorized

  const { userId } = await ctx.params
  if (!userId) {
    return NextResponse.json({ ok: false, error: 'Missing user id.' }, { status: 400 })
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  })
  if (!target) {
    return NextResponse.json({ ok: false, error: 'User not found.' }, { status: 404 })
  }

  if (target.role === 'ADMIN') {
    const adminCount = await prisma.user.count({ where: { role: 'ADMIN' } })
    if (adminCount <= 1) {
      return NextResponse.json(
        { ok: false, error: 'Cannot delete the last admin account.' },
        { status: 400 },
      )
    }
  }

  await prisma.user.delete({ where: { id: userId } })
  return NextResponse.json({ ok: true })
}
