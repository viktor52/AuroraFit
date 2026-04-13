'use client'

import { useCallback, useEffect, useState } from 'react'
import styles from './PwaInstallButton.module.css'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function PwaInstallButton() {
  const [mounted, setMounted] = useState(false)
  const [open, setOpen] = useState(false)
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    setMounted(true)
    if (isStandalone()) {
      setInstalled(true)
      return
    }

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    const onInstalled = () => {
      setInstalled(true)
      setDeferred(null)
      setOpen(false)
    }

    window.addEventListener('beforeinstallprompt', onBip)
    window.addEventListener('appinstalled', onInstalled)

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js').catch(() => {})
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const runChromeInstall = useCallback(async () => {
    if (!deferred) return
    setInstalling(true)
    try {
      await deferred.prompt()
      await deferred.userChoice
    } catch {
      // dismissed or unsupported
    } finally {
      setDeferred(null)
      setInstalling(false)
      setOpen(false)
    }
  }, [deferred])

  if (!mounted || installed) return null

  const ios = isIos()
  const showChromeInstall = Boolean(deferred) && !ios

  return (
    <div className={styles.wrap}>
      {open ? (
        <div className={styles.panel} role="dialog" aria-labelledby="pwa-install-title">
          <h2 id="pwa-install-title" className={styles.panelTitle}>
            Add AuroraFit to your home screen
          </h2>
          <p className={styles.panelLead}>
            {showChromeInstall
              ? 'Install the app for quick access and a full-screen experience.'
              : ios
                ? 'On iPhone and iPad, Safari doesn’t allow a one-tap install — use the steps below.'
                : 'Use your browser’s menu to install this site as an app, or try Chrome on Android for a one-tap install.'}
          </p>

          {ios ? (
            <ol className={styles.steps}>
              <li className={styles.step}>
                <span className={styles.stepNum} aria-hidden>
                  1
                </span>
                <span>
                  Tap the <strong className="text-slate-100">Share</strong> button{' '}
                  <span className="text-slate-500">(square with arrow up)</span> in the toolbar.
                </span>
              </li>
              <li className={styles.step}>
                <span className={styles.stepNum} aria-hidden>
                  2
                </span>
                <span>
                  Scroll down and tap <strong className="text-slate-100">Add to Home Screen</strong>.
                </span>
              </li>
              <li className={styles.step}>
                <span className={styles.stepNum} aria-hidden>
                  3
                </span>
                <span>
                  Tap <strong className="text-slate-100">Add</strong> in the top-right corner.
                </span>
              </li>
            </ol>
          ) : !showChromeInstall ? (
            <ol className={styles.steps}>
              <li className={styles.step}>
                <span className={styles.stepNum} aria-hidden>
                  1
                </span>
                <span>
                  Open the browser <strong className="text-slate-100">menu</strong> (⋮ or ⋯).
                </span>
              </li>
              <li className={styles.step}>
                <span className={styles.stepNum} aria-hidden>
                  2
                </span>
                <span>
                  Choose <strong className="text-slate-100">Install app</strong>,{' '}
                  <strong className="text-slate-100">Add to Home screen</strong>, or similar.
                </span>
              </li>
            </ol>
          ) : null}

          <div className={styles.actions}>
            {showChromeInstall ? (
              <button
                type="button"
                className={styles.primary}
                disabled={installing}
                onClick={() => void runChromeInstall()}
              >
                {installing ? 'Installing…' : 'Install app'}
              </button>
            ) : null}
            <button type="button" className={styles.secondary} onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
        </div>
      ) : null}

      <button
        type="button"
        className={styles.trigger}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <DownloadIcon className={styles.triggerIcon} />
        {deferred && !ios ? 'Install app' : 'Add to home screen'}
      </button>
    </div>
  )
}

function DownloadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points="7 10 12 15 17 10" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="12" y1="15" x2="12" y2="3" strokeLinecap="round" />
    </svg>
  )
}
