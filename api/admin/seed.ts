import { adminAuth, adminDb } from '../_lib/firebase-admin'
import { verifyAdmin, jsonResponse, errorResponse } from '../_lib/auth'
import { FieldValue } from 'firebase-admin/firestore'

/**
 * POST /api/admin/seed
 *
 * Cria a conta admin e os grupos de treino iniciais.
 * Só funciona se ainda não houver dados (proteção de re-seed).
 *
 * Headers: (opcional - sem proteção para o primeiro setup)
 */
export default async function handler(req: Request) {
  if (req.method !== 'POST') return errorResponse('Método não permitido', 405)

  // Verifica se o seed já foi executado
  const existingUsers = await adminDb.collection('users').limit(1).get()
  if (!existingUsers.empty) {
    return errorResponse('Seed já foi executado. O banco já tem dados.', 409)
  }

  const ADMIN_EMAIL = 'admin@edgym.com'
  const ADMIN_PASSWORD = 'Admin@1234'
  const ADMIN_NAME = 'Administrador'

  try {
    // 1. Cria admin no Firebase Auth
    const adminUser = await adminAuth.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      displayName: ADMIN_NAME,
    })

    // 2. Salva admin no Firestore
    await adminDb.collection('users').doc(adminUser.uid).set({
      uid: adminUser.uid,
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      role: 'admin',
      assignedGroupIds: [],
      currentGroupIndex: 0,
      createdAt: FieldValue.serverTimestamp(),
    })

    // 3. Cria grupos de treino
    const grupos = [
      {
        name: 'Grupo A - Superiores Frente',
        description: 'Peito, ombro e tríceps',
        muscleTarget: 'Peito, Ombro, Tríceps',
        colorHex: '#22c55e',
      },
      {
        name: 'Grupo B - Superiores Costa',
        description: 'Costas e bíceps',
        muscleTarget: 'Costas, Bíceps, Trapézio',
        colorHex: '#3b82f6',
      },
      {
        name: 'Grupo C - Pernas',
        description: 'Pernas completo',
        muscleTarget: 'Quadríceps, Posterior, Glúteos, Panturrilha',
        colorHex: '#a855f7',
      },
    ]

    const groupIds: string[] = []
    for (const grupo of grupos) {
      const ref = adminDb.collection('workoutGroups').doc()
      await ref.set({
        ...grupo,
        exercises: [],
        assignedUserIds: [],
        createdAt: FieldValue.serverTimestamp(),
      })
      groupIds.push(ref.id)
    }

    return jsonResponse({
      success: true,
      admin: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
      groups: groupIds,
      message: 'Seed concluído! Faça login com admin@edgym.com / Admin@1234',
    })
  } catch (err: unknown) {
    return errorResponse((err as Error).message, 500)
  }
}
