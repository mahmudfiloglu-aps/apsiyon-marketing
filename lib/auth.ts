import { SignJWT, jwtVerify } from 'jose'
import { cookies } from 'next/headers'

const secret = () =>
  new TextEncoder().encode(process.env.JWT_SECRET ?? 'change-me-in-production')

export interface SessionPayload {
  userId: string
  email: string
  name: string
}

export async function createToken(payload: SessionPayload) {
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setExpirationTime('7d')
    .sign(secret())
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    return payload as unknown as SessionPayload
  } catch {
    return null
  }
}

export async function getSession(): Promise<SessionPayload | null> {
  const store = await cookies()
  const token = store.get('auth_token')?.value
  if (!token) return null
  return verifyToken(token)
}

export function setAuthCookie(response: Response, token: string) {
  const isProd = process.env.NODE_ENV === 'production'
  response.headers.set(
    'Set-Cookie',
    `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}${isProd ? '; Secure' : ''}`
  )
}
