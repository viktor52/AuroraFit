'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import styles from './CoachExercises.module.css'

type SearchResult = {
  name: string
  type?: string
  muscle?: string
  equipment?: string
  difficulty?: string
  instructions?: string
  source?: 'library' | 'api'
}

type SearchResponse = { ok: true; results: SearchResult[] } | { ok: false; error: string }

function buildMeta(r: SearchResult) {
  return [r.muscle, r.equipment, r.difficulty, r.type].filter(Boolean).join(' · ')
}

export function CoachExercisesPage() {
  const pathname = usePathname()
  const navExerciseLibraryActive = pathname === '/coach/exercise-library'
  const navProgramLibraryActive = pathname === '/coach/program-library'
  const [menuOpen, setMenuOpen] = useState(false)
  const [name, setName] = useState('')
  const [type, setType] = useState('')
  const [muscle, setMuscle] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [equipment, setEquipment] = useState('')

  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [results, setResults] = useState<SearchResult[]>([])
  const [saveLibKey, setSaveLibKey] = useState<string | null>(null)

  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const canSearch = useMemo(() => {
    return !!(name.trim() || type.trim() || muscle.trim() || difficulty.trim() || equipment.trim())
  }, [name, type, muscle, difficulty, equipment])

  async function saveExerciseToLibrary(r: SearchResult) {
    setError(null)
    setSuccess(null)
    setSaveLibKey(`${r.name}-${r.source ?? 'x'}`)
    try {
      const res = await fetch('/api/coach/exercise-library', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: r.name,
          instructions: r.instructions ?? '',
          type: r.type,
          muscle: r.muscle,
          equipment: r.equipment,
          difficulty: r.difficulty,
        }),
      })
      const json = (await res.json().catch(() => ({ ok: false, error: 'Save failed.' }))) as
        | { ok: true }
        | { ok: false; error: string }
      if (!res.ok || !json.ok) {
        setError((json as { error?: string }).error ?? 'Could not save to library.')
        return
      }
      setSuccess(`Saved “${r.name}” to My exercise library.`)
    } catch {
      setError('Network error.')
    } finally {
      setSaveLibKey(null)
    }
  }

  async function runSearch() {
    setError(null)
    setSuccess(null)
    setPending(true)
    try {
      const url = new URL('/api/coach/exercises/search', window.location.origin)
      if (name.trim()) url.searchParams.set('name', name.trim())
      if (type.trim()) url.searchParams.set('type', type.trim())
      if (muscle.trim()) url.searchParams.set('muscle', muscle.trim())
      if (difficulty.trim()) url.searchParams.set('difficulty', difficulty.trim())
      if (equipment.trim()) url.searchParams.set('equipment', equipment.trim())

      const res = await fetch(url.toString())
      const json = (await res.json().catch(() => ({ ok: false, error: 'Search failed.' }))) as SearchResponse
      if (!res.ok || !json.ok) {
        setError((json as any).error ?? 'Search failed.')
        setResults([])
        return
      }
      setResults(json.results ?? [])
    } catch {
      setError('Network error.')
      setResults([])
    } finally {
      setPending(false)
    }
  }

  function clear() {
    setName('')
    setType('')
    setMuscle('')
    setDifficulty('')
    setEquipment('')
    setResults([])
    setError(null)
  }

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' })
    window.location.href = '/login'
  }

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brand}>
            <button className={styles.hamburger} type="button" onClick={() => setMenuOpen(true)}>
              Menu
            </button>
            <div className={styles.brandText}>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">AuroraFit</div>
              <div className="text-sm font-semibold tracking-tight text-slate-100">Exercise search</div>
            </div>
          </div>
          <button className={styles.hamburger} type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {menuOpen ? <div className={styles.drawerOverlay} onClick={() => setMenuOpen(false)} /> : null}
      <aside className={`${styles.drawer} ${menuOpen ? styles.drawerOpen : ''}`} aria-label="Mobile menu">
        <div className={styles.drawerHeader}>
          <div className={styles.brandText}>AuroraFit</div>
          <button className={styles.closeBtn} type="button" onClick={() => setMenuOpen(false)}>
            Close
          </button>
        </div>
        <nav className={styles.nav}>
          <a className={styles.navItem} href="/coach" onClick={() => setMenuOpen(false)}>
            Dashboard <span className={styles.pill}>Home</span>
          </a>
          <a className={`${styles.navItem} ${styles.navItemActive}`} href="/coach/exercises" onClick={() => setMenuOpen(false)}>
            Exercise search <span className={styles.pill}>API</span>
          </a>
          <a
            className={`${styles.navItem} ${navExerciseLibraryActive ? styles.navItemActive : ''}`}
            href="/coach/exercise-library"
            onClick={() => setMenuOpen(false)}
          >
            My exercise library
          </a>
          <a className={styles.navItem} href="/coach/program" onClick={() => setMenuOpen(false)}>
            Program builder <span className={styles.pill}>Weekly</span>
          </a>
          <a
            className={`${styles.navItem} ${navProgramLibraryActive ? styles.navItemActive : ''}`}
            href="/coach/program-library"
            onClick={() => setMenuOpen(false)}
          >
            My program library
          </a>
        </nav>
      </aside>

      <main className={styles.mainInner}>
        <h1 className={styles.title}>Search exercises (API Ninjas)</h1>
        <p className={styles.muted}>
          Use one or more filters. Results are limited to 20. To assign work to an athlete, use the{' '}
          <a className="font-semibold text-cyan-300 underline-offset-2 hover:underline" href="/coach/program">
            program builder
          </a>{' '}
          and add exercises to each training day, then publish the full week. Create reusable exercises with YouTube
          demos on the program builder page (library section), or save API results to{' '}
          <a className="font-semibold text-cyan-300 underline-offset-2 hover:underline" href="/coach/exercise-library">
            My exercise library
          </a>
          .
        </p>

        <section className={styles.panel}>
          <div className={styles.formGrid}>
            <div>
              <div className={styles.label}>Name</div>
              <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. squat" />
            </div>
            <div>
              <div className={styles.label}>Muscle</div>
              <input className={styles.input} value={muscle} onChange={(e) => setMuscle(e.target.value)} placeholder="e.g. quadriceps" />
            </div>
            <div>
              <div className={styles.label}>Type</div>
              <input className={styles.input} value={type} onChange={(e) => setType(e.target.value)} placeholder="e.g. strength" />
            </div>
            <div>
              <div className={styles.label}>Difficulty</div>
              <input className={styles.input} value={difficulty} onChange={(e) => setDifficulty(e.target.value)} placeholder="beginner / intermediate / expert" />
            </div>
            <div>
              <div className={styles.label}>Equipment</div>
              <input className={styles.input} value={equipment} onChange={(e) => setEquipment(e.target.value)} placeholder="e.g. barbell" />
            </div>
          </div>

          <div className={styles.actions}>
            <button className={styles.primary} type="button" onClick={runSearch} disabled={pending || !canSearch}>
              {pending ? 'Searching…' : 'Search'}
            </button>
            <button className={styles.secondary} type="button" onClick={clear} disabled={pending}>
              Clear
            </button>
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}
          {success ? <div className={styles.success}>{success}</div> : null}

          <div className={styles.results}>
            {results.map((r, idx) => (
              <div key={`${r.name}-${idx}`} className={styles.card}>
                <div className={styles.cardTitle}>{r.name}</div>
                <div className={styles.cardMeta}>{buildMeta(r) || '—'}</div>
                {r.instructions ? <div className={styles.instructions}>{r.instructions}</div> : null}
                <div className={styles.actions} style={{ marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    className={styles.secondary}
                    disabled={saveLibKey === `${r.name}-${r.source ?? 'x'}`}
                    onClick={() => void saveExerciseToLibrary(r)}
                  >
                    {saveLibKey === `${r.name}-${r.source ?? 'x'}` ? 'Saving…' : 'Save to My exercise library'}
                  </button>
                </div>
              </div>
            ))}
            {!pending && !error && canSearch && results.length === 0 ? (
              <div className={styles.card}>No matches.</div>
            ) : null}
            {!canSearch ? <div className={styles.card}>Add a filter above to search.</div> : null}
          </div>
        </section>
      </main>
    </div>
  )
}

