const STORAGE_KEY = 'aurorafit_admin_secret_v1'

export function getAdminSecret(): string | null {
  if (typeof window === 'undefined') return null
  return window.localStorage.getItem(STORAGE_KEY)
}

export function setAdminSecret(secret: string) {
  window.localStorage.setItem(STORAGE_KEY, secret)
}

export function clearAdminSecret() {
  window.localStorage.removeItem(STORAGE_KEY)
}

