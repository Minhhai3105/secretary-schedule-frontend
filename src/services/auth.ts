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

const apiBaseUrl = import.meta.env?.VITE_API_BASE_URL ?? (typeof window !== 'undefined' ? `http://${window.location.hostname}:8000` : 'http://localhost:8000')

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

let activeRefreshPromise: Promise<LoginResult | null> | null = null

export async function refreshSession(): Promise<LoginResult | null> {
  if (activeRefreshPromise) {
    return activeRefreshPromise
  }

  activeRefreshPromise = (async () => {
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
  })().finally(() => {
    activeRefreshPromise = null
  })

  return activeRefreshPromise
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

type PasswordResetErrorCode = 'network' | 'unavailable' | 'invalidEmail' | 'invalidToken' | 'failed'

export class PasswordResetError extends Error {
  readonly code: PasswordResetErrorCode

  constructor(code: PasswordResetErrorCode) {
    super(code)
    this.code = code
  }
}

export async function requestPasswordReset(email: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/auth/forgot-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
  } catch {
    throw new PasswordResetError('network')
  }

  if (response.status === 503) throw new PasswordResetError('unavailable')
  if (response.status === 422) throw new PasswordResetError('invalidEmail')
  if (response.status !== 202) throw new PasswordResetError('failed')
}

export async function resetPassword(token: string, password: string): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${apiBaseUrl}/api/auth/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    })
  } catch {
    throw new PasswordResetError('network')
  }

  if (response.status === 400) throw new PasswordResetError('invalidToken')
  if (response.status === 422) throw new PasswordResetError('invalidToken')
  if (response.status !== 204) throw new PasswordResetError('failed')
}
