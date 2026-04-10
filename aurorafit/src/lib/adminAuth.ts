export function adminSecretOk(req: Request): boolean {
  const secret = process.env.ADMIN_SETUP_SECRET
  if (!secret) return false
  const header = req.headers.get('x-admin-secret')
  return header === secret
}

