import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/session'

export default async function Home() {
  const session = await getSessionUser()
  if (!session) {
    redirect('/login')
  }
  const role = session.user.role
  if (role === 'ADMIN') redirect('/admin')
  if (role === 'ATHLETE') redirect('/athlete')
  if (role === 'COACH') redirect('/coach')
  redirect('/login')
}
