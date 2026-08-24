import { adminDb } from '../_lib/firebase-admin'
import { verifyAdmin, jsonResponse, errorResponse } from '../_lib/auth'
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore'

/**
 * GET /api/admin/stats
 * Retorna estatísticas do painel admin usando Admin SDK (sem restrição de Security Rules)
 */
export default async function handler(req: Request) {
  if (req.method !== 'GET') return errorResponse('Método não permitido', 405)

  try {
    await verifyAdmin(req)
  } catch (err: unknown) {
    return errorResponse((err as Error).message, 403)
  }

  const [usersSnap, groupsSnap, sessionsSnap, equipmentSnap] = await Promise.all([
    adminDb.collection('users').where('role', '==', 'user').get(),
    adminDb.collection('workoutGroups').get(),
    adminDb.collection('sessions').get(),
    adminDb.collection('equipment').get(),
  ])

  // Sessões da última semana
  const oneWeekAgo = new Date()
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7)

  const recentSessions = sessionsSnap.docs.filter((doc: QueryDocumentSnapshot) => {
    const data = doc.data()
    const date = data.createdAt?.toDate?.()
    return date && date >= oneWeekAgo
  })

  return jsonResponse({
    totalUsers: usersSnap.size,
    totalGroups: groupsSnap.size,
    totalSessions: sessionsSnap.size,
    recentSessions: recentSessions.length,
    totalEquipment: equipmentSnap.size,
  })
}
