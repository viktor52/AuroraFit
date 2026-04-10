import { Suspense } from 'react'
import { CoachProgramBuilderPage } from '@/components/coach/CoachProgramBuilderPage'

export default function CoachProgramPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gradient-to-b from-black via-slate-950 to-slate-900 p-8 text-slate-300">
          Loading…
        </div>
      }
    >
      <CoachProgramBuilderPage />
    </Suspense>
  )
}
