import { Suspense } from 'react'
import { LoginPage } from '@/components/auth/LoginPage'

export default function Page() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-950" aria-busy="true" />}>
      <LoginPage />
    </Suspense>
  )
}

