export const ADMIN_EMAILS = [
  'links358p@gmail.com',
  'irenephang220@gmail.com',
]

export function normalizeEmail(email: string | null | undefined) {
  return (email || '').trim().toLowerCase()
}

export function isAdminEmail(email: string | null | undefined) {
  return ADMIN_EMAILS.includes(normalizeEmail(email))
}
