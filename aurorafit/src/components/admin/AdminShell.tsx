'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import styles from '@/components/coach/CoachDashboard.module.css'
import { clearAdminSecret, getAdminSecret } from './adminSecret'

type NavKey = 'dashboard' | 'users' | 'exercises' | 'programs'

export function AdminShell({
  children,
  active,
}: {
  children: React.ReactNode
  active: NavKey
}) {
  const router = useRouter()
  const [secret, setSecret] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    const s = getAdminSecret()
    if (!s) {
      router.replace('/admin/login')
      return
    }
    setSecret(s)
  }, [router])

  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  function logout() {
    clearAdminSecret()
    router.push('/admin/login')
  }

  if (!secret) {
    return (
      <div className={`${styles.page} adminShell`}>
        <main className={styles.mainInner}>
          <p className={styles.muted}>Loading…</p>
        </main>
      </div>
    )
  }

  return (
    <div className={`${styles.page} ${styles.layout} adminShell`}>
      <header className={styles.topbar}>
        <div className={styles.topbarInner}>
          <div className={styles.brand}>
            <button className={styles.hamburger} type="button" onClick={() => setMenuOpen(true)}>
              Menu
            </button>
            <div className={styles.brandText}>
              <div className="text-[11px] uppercase tracking-wide text-slate-400">AuroraFit</div>
              <div className="text-sm font-semibold tracking-tight text-slate-100">Admin</div>
            </div>
          </div>
          <button className={styles.hamburger} type="button" onClick={logout}>
            Log out
          </button>
        </div>
      </header>

      {menuOpen ? <div className={styles.drawerOverlay} onClick={() => setMenuOpen(false)} /> : null}
      <aside className={`${styles.drawer} ${menuOpen ? styles.drawerOpen : ''}`} aria-label="Admin menu">
        <div className={styles.drawerHeader}>
          <div className={styles.brandText}>AuroraFit</div>
          <button className={styles.closeBtn} type="button" onClick={() => setMenuOpen(false)}>
            Close
          </button>
        </div>
        <div className={styles.sidebarInner}>
          <nav className={styles.nav} aria-label="Admin navigation">
            <a
              className={`${styles.navItem} ${active === 'dashboard' ? styles.navItemActive : ''}`}
              href="/admin"
              onClick={() => setMenuOpen(false)}
            >
              Dashboard <span className={styles.pill}>Home</span>
            </a>
            <a
              className={`${styles.navItem} ${active === 'users' ? styles.navItemActive : ''}`}
              href="/admin/users"
              onClick={() => setMenuOpen(false)}
            >
              Users & roles
            </a>
            <a
              className={`${styles.navItem} ${active === 'exercises' ? styles.navItemActive : ''}`}
              href="/admin/exercises"
              onClick={() => setMenuOpen(false)}
            >
              Exercises
            </a>
            <a
              className={`${styles.navItem} ${active === 'programs' ? styles.navItemActive : ''}`}
              href="/admin/programs"
              onClick={() => setMenuOpen(false)}
            >
              Programs
            </a>
          </nav>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  )
}
