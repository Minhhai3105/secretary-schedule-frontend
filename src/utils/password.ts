export function passwordError(password: string, confirmation: string): 'length' | 'mismatch' | null {
  if (password.length < 8 || password.length > 128) return 'length'
  if (password !== confirmation) return 'mismatch'
  return null
}
