import { adminAuth, adminDb } from '../_lib/firebase-admin'
import { verifyAdmin, jsonResponse, errorResponse } from '../_lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

/**
 * POST /api/admin/create-user
 *
 * Body: {
 *   name: string
 *   email: string
 *   password: string
 *   assignedGroupIds: string[]
 * }
 *
 * Headers: Authorization: Bearer <admin_id_token>
 */
export default async function handler(req: Request) {
  if (req.method !== 'POST') return errorResponse('Método não permitido', 405)

  try {
    await verifyAdmin(req)
  } catch (err: unknown) {
    return errorResponse((err as Error).message, 403)
  }

  let body: { name: string; email: string; password: string; assignedGroupIds: string[] }
  try {
    body = await req.json()
  } catch {
    return errorResponse('Body inválido')
  }

  const { name, email, password, assignedGroupIds = [] } = body

  if (!name || !email || !password) {
    return errorResponse('name, email e password são obrigatórios')
  }

  try {
    // 1. Cria no Firebase Auth
    const userRecord = await adminAuth.createUser({
      email,
      password,
      displayName: name,
    })

    // 2. Cria documento no Firestore
    await adminDb.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      name,
      email,
      role: 'user',
      assignedGroupIds,
      currentGroupIndex: 0,
      createdAt: FieldValue.serverTimestamp(),
    })

    // 3. Atualiza os grupos atribuídos para incluir o userId
    for (const groupId of assignedGroupIds) {
      await adminDb.collection('workoutGroups').doc(groupId).update({
        assignedUserIds: FieldValue.arrayUnion(userRecord.uid),
      })
    }

    return jsonResponse({
      success: true,
      uid: userRecord.uid,
      message: `Usuário ${name} criado com sucesso!`,
    })
  } catch (err: unknown) {
    const message = (err as Error).message || 'Erro ao criar usuário'
    return errorResponse(message, 500)
  }
}
