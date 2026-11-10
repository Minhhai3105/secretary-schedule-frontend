export interface AuthUser {
  id: string
  name: string
  email: string
}

export interface LoginResult {
  access_token: string
  user: AuthUser
}

export class LoginError extends Error {}

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
    throw new LoginError('Không thể kết nối máy chủ. Vui lòng thử lại.')
  }

  if (response.status === 401) {
    throw new LoginError('Email hoặc mật khẩu chưa đúng. Vui lòng thử lại.')
  }

  if (!response.ok) {
    throw new LoginError('Đăng nhập chưa thành công. Vui lòng thử lại.')
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
    throw new Error('Không thể kết nối máy chủ để khôi phục phiên.')
  }

  if (response.status === 401) return null
  if (!response.ok) throw new Error('Không thể khôi phục phiên. Vui lòng thử lại.')

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
    throw new Error('Không thể kết nối máy chủ để đăng xuất.')
  }

  if (!response.ok) throw new Error('Đăng xuất chưa thành công. Vui lòng thử lại.')
}
