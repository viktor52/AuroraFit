import Link from 'next/link'

export default function RegisterHubPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-8 bg-gradient-to-b from-slate-950 to-slate-900 px-4 py-12 text-slate-100">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight">Join AuroraFit</h1>
        <p className="mt-2 text-sm text-slate-300">Choose how you want to register.</p>
      </div>
      <div className="flex w-full max-w-md flex-col gap-4">
        <Link
          href="/register/athlete"
          className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-left shadow-lg transition hover:border-cyan-400/30 hover:bg-white/10"
        >
          <span className="block text-lg font-medium text-cyan-200">I’m an athlete</span>
          <span className="mt-1 block text-sm text-slate-400">Create an account to track training.</span>
        </Link>
        <Link
          href="/register/coach"
          className="rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-left shadow-lg transition hover:border-violet-400/30 hover:bg-white/10"
        >
          <span className="block text-lg font-medium text-violet-200">I’m a coach</span>
          <span className="mt-1 block text-sm text-slate-400">
            You’ll need a validation key from an admin.
          </span>
        </Link>
      </div>
      <Link href="/login" className="text-sm text-cyan-300 underline-offset-4 hover:underline">
        Already have an account? Sign in
      </Link>
    </main>
  )
}
