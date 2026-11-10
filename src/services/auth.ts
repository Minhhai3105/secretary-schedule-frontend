export interface AuthUser {
  id: string
  name: string
  email: string
}

export interface LoginResult {
  access_token: string
  user: AuthUser
}

export type AuthErrorCode = 'network' | 'invalidCredentials' | 'loginFailed' | 'restoreNetwork' | 'restoreFailed' | 'logoutNetwork' | 'logoutFailed' | 'emailExists' | 'registerFailed'

export class AuthError extends Error {
  readonly code: AuthErrorCode

  constructor(code: AuthErrorCode) {
    super(code)
    this.code = code
  }
}

export class LoginError extends AuthError {}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? `http://${window.location.hostname}:8000`

export async function login(email: string, password: string): Promise<LoginResult> {
  let response: Response

  try {
    response = await fetch(`${apiBaseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    })
  } catch {
    throw new LoginError('network')
  }

  if (response.status === 401) {
    throw new LoginError('invalidCredentials')
  }

  if (!response.ok) {
    throw new LoginError('loginFailed')
  }

  return (await response.json()) as LoginResult
}

export async function refreshSession(): Promise<LoginResult | null> {
  let response: Response

  try {
    response = await fetch(`${apiBaseUrl}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
  } catch {
    throw new AuthError('restoreNetwork')
  }

  if (response.status === 401) return null
  if (!response.ok) throw new AuthError('restoreFailed')

  return (await response.json()) as LoginResult
}

export async function logout(): Promise<void> {
  let response: Response

  try {
    response = await fetch(`${apiBaseUrl}/api/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    })
  } catch {
    throw new AuthError('logoutNetwork')
  }

  if (!response.ok) throw new AuthError('logoutFailed')
}

export interface RegisterRequest {
  name: string
  email: string
  password: string
}

export class RegisterError extends AuthError {}

export async function register(payload: RegisterRequest): Promise<AuthUser> {
  let response: Response

  try {
    response = await fetch(`${apiBaseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new RegisterError('network')
  }

  if (response.status === 409) {
    throw new RegisterError('emailExists')
  }

  if (!response.ok) {
    throw new RegisterError('registerFailed')
  }

  return (await response.json()) as AuthUser
}
