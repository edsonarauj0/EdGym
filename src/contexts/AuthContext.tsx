import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  User,
} from 'firebase/auth'
import { auth } from '@/lib/firebase'
import { AppUser } from '@/types'

interface AuthContextType {
  currentUser: User | null
  appUser: AppUser | null
  isAdmin: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)
const USER_CACHE_KEY = 'edgym_user_cache'
const SESSION_EXPIRES_AT_KEY = 'edgym_session_expires_at'
const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000

function getCachedUser(): AppUser | null {
  try {
    const raw = localStorage.getItem(USER_CACHE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

function setCachedUser(user: AppUser | null) {
  try {
    if (user) localStorage.setItem(USER_CACHE_KEY, JSON.stringify(user))
    else localStorage.removeItem(USER_CACHE_KEY)
  } catch {}
}

function startSession() {
  try {
    localStorage.setItem(SESSION_EXPIRES_AT_KEY, String(Date.now() + SESSION_DURATION_MS))
  } catch {}
}

function hasValidSession(): boolean {
  try {
    const expiresAt = Number(localStorage.getItem(SESSION_EXPIRES_AT_KEY))

    // Usuários que já estavam autenticados antes desta alteração começam um
    // novo período de sete dias, sem precisar entrar novamente uma vez.
    if (!expiresAt) {
      startSession()
      return true
    }

    return Date.now() < expiresAt
  } catch {
    return false
  }
}

function clearSession() {
  try {
    localStorage.removeItem(SESSION_EXPIRES_AT_KEY)
  } catch {}
}

// Converte campos do formato Firestore REST para objeto JS simples
function parseFirestoreDoc(fields: Record<string, any>): Record<string, any> {
  const result: Record<string, any> = {}
  for (const [key, val] of Object.entries(fields)) {
    if ('stringValue' in val) result[key] = val.stringValue
    else if ('integerValue' in val) result[key] = parseInt(val.integerValue)
    else if ('doubleValue' in val) result[key] = val.doubleValue
    else if ('booleanValue' in val) result[key] = val.booleanValue
    else if ('arrayValue' in val)
      result[key] = (val.arrayValue.values || []).map((v: any) =>
        v.stringValue ?? v.integerValue ?? v.booleanValue ?? null
      )
    else if ('mapValue' in val)
      result[key] = parseFirestoreDoc(val.mapValue.fields || {})
    else result[key] = null
  }
  return result
}

// Busca o perfil do usuário via REST API do Firestore (sem SDK, sem long polling)
async function fetchUserProfile(uid: string, idToken: string): Promise<AppUser | null> {
  try {
    const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID
    const docPath = `projects/${projectId}/databases/default/documents/users/${uid}`

    // Usa batchGet (POST) que é mais confiável que GET para documentos individuais
    const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/default/documents:batchGet`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${idToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ documents: [docPath] }),
      signal: AbortSignal.timeout(10000),
    })

    if (!res.ok) {
      const errText = await res.text()
      console.error(`[Auth] Firestore batchGet erro ${res.status}:`, errText)
      return null
    }

    const results = await res.json()
    // batchGet retorna array — pega o primeiro resultado
    const result = Array.isArray(results) ? results[0] : results
    if (!result?.found?.fields) {
      console.error('[Auth] ⚠️ Documento não encontrado! Crie em Firebase Console → Firestore → users → ID:', uid)
      return null
    }

    const data = parseFirestoreDoc(result.found.fields)
    return { uid, ...data } as AppUser
  } catch (err) {
    console.warn('[Auth] REST fetch falhou:', err)
    return null
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const cached = getCachedUser()
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [appUser, setAppUser] = useState<AppUser | null>(cached)
  // Aguarda a restauração da credencial persistida antes de decidir a rota.
  // Isso evita que um refresh redirecione temporariamente para o login.
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user)

      if (!user) {
        setAppUser(null)
        setCachedUser(null)
        setLoading(false)
        return
      }

      if (!hasValidSession()) {
        await signOut(auth)
        return
      }

      // Se tem cache válido, usa imediatamente e atualiza em background
      const cached = getCachedUser()
      if (cached) {
        setAppUser(cached)
        setLoading(false)
        // Atualiza silenciosamente em background
        user.getIdToken().then(token =>
          fetchUserProfile(user.uid, token).then(profile => {
            if (profile) { setAppUser(profile); setCachedUser(profile) }
          })
        )
        return
      }

      // Sem cache: busca via REST e aguarda
      try {
        const token = await user.getIdToken()
        const profile = await fetchUserProfile(user.uid, token)
        if (profile) {
          setAppUser(profile)
          setCachedUser(profile)
        }
      } catch (err) {
        console.error('[Auth] Erro ao buscar perfil:', err)
      } finally {
        setLoading(false)
      }
    })

    return unsubAuth
  }, [])

  const login = async (email: string, password: string) => {
    await signInWithEmailAndPassword(auth, email, password)
    startSession()
  }

  const logout = async () => {
    await signOut(auth)
    setAppUser(null)
    setCachedUser(null)
    clearSession()
  }

  const isAdmin = appUser?.role === 'admin'

  return (
    <AuthContext.Provider value={{ currentUser, appUser, isAdmin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
