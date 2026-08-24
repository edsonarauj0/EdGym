import { adminAuth } from './firebase-admin'

/**
 * Verifica se o token Bearer da requisição pertence a um admin.
 * Retorna o UID do usuário ou lança erro.
 */
export async function verifyAdmin(req: Request): Promise<string> {
  const authorization = req.headers.get('Authorization') || ''
  const token = authorization.replace('Bearer ', '')

  if (!token) throw new Error('Token não fornecido')

  const decoded = await adminAuth.verifyIdToken(token)

  // Busca o perfil no Firestore para checar o role
  const { adminDb } = await import('./firebase-admin')
  const userDoc = await adminDb.collection('users').doc(decoded.uid).get()

  if (!userDoc.exists) throw new Error('Usuário não encontrado')
  if (userDoc.data()?.role !== 'admin') throw new Error('Acesso negado: não é admin')

  return decoded.uid
}

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

export function errorResponse(message: string, status = 400) {
  return jsonResponse({ error: message }, status)
}
