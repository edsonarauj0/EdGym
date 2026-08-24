/**
 * EdGym - Seed Script
 * 
 * Creates the admin user in Firebase Auth and Firestore.
 * 
 * USAGE:
 *   1. Copy .env.example to .env.local and fill in your Firebase credentials
 *   2. Run: npx ts-node --esm scripts/seed.ts
 *      OR: npx tsx scripts/seed.ts
 * 
 * What this script does:
 *   - Creates an admin user in Firebase Authentication
 *   - Creates the admin user document in Firestore with role: 'admin'
 *   - Creates sample workout groups (A, B, C)
 */

import { initializeApp } from 'firebase/app'
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth'
import { getFirestore, doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), '.env.local') })

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
}

// Admin credentials — change these before running!
const ADMIN_EMAIL = 'admin@edgym.com'
const ADMIN_PASSWORD = 'Admin@1234'
const ADMIN_NAME = 'Administrador'

async function seed() {
  console.log('🌱 Iniciando seed do EdGym...\n')

  // Validate env
  if (!firebaseConfig.apiKey) {
    console.error('❌ Variáveis de ambiente não encontradas!')
    console.error('   Crie o arquivo .env.local com base em .env.example')
    process.exit(1)
  }

  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = getFirestore(app)

  // ─── 1. Create admin user ─────────────────────────────────────────────────
  console.log(`📧 Criando usuário admin: ${ADMIN_EMAIL}`)
  let adminUid: string

  try {
    const cred = await createUserWithEmailAndPassword(auth, ADMIN_EMAIL, ADMIN_PASSWORD)
    adminUid = cred.user.uid
    console.log(`✅ Usuário criado no Firebase Auth (UID: ${adminUid})`)
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'auth/email-already-in-use') {
      console.log('⚠️  Usuário admin já existe no Auth. Pulando criação...')
      // We'll need to get the UID differently — for seed purposes, use a placeholder
      adminUid = 'EXISTING_ADMIN_UID'
    } else {
      throw err
    }
  }

  // ─── 2. Save admin to Firestore ───────────────────────────────────────────
  if (adminUid !== 'EXISTING_ADMIN_UID') {
    await setDoc(doc(db, 'users', adminUid), {
      uid: adminUid,
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      role: 'admin',
      assignedGroupIds: [],
      currentGroupIndex: 0,
      createdAt: serverTimestamp(),
    })
    console.log('✅ Admin salvo no Firestore com role: admin')
  }

  // ─── 3. Create sample workout groups ──────────────────────────────────────
  console.log('\n📋 Criando grupos de treino de exemplo...')

  const sampleGroups = [
    {
      name: 'Grupo A - Superiores Frente',
      description: 'Treino focado nos músculos da parte frontal do corpo superior: peito, ombros e tríceps.',
      muscleTarget: 'Peito, Ombro, Tríceps',
      exercises: [],
      assignedUserIds: [],
      colorHex: '#22c55e',
    },
    {
      name: 'Grupo B - Superiores Costa',
      description: 'Treino focado nos músculos das costas e bíceps.',
      muscleTarget: 'Costas, Bíceps, Trapézio',
      exercises: [],
      assignedUserIds: [],
      colorHex: '#3b82f6',
    },
    {
      name: 'Grupo C - Pernas',
      description: 'Treino completo de pernas: quadríceps, posterior, glúteos e panturrilha.',
      muscleTarget: 'Quadríceps, Posterior, Glúteos, Panturrilha',
      exercises: [],
      assignedUserIds: [],
      colorHex: '#a855f7',
    },
  ]

  for (const group of sampleGroups) {
    const ref = await addDoc(collection(db, 'workoutGroups'), {
      ...group,
      createdAt: serverTimestamp(),
    })
    console.log(`✅ Grupo criado: "${group.name}" (ID: ${ref.id})`)
  }

  // ─── 4. Done ──────────────────────────────────────────────────────────────
  console.log('\n🎉 Seed concluído com sucesso!\n')
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('🔑 Credenciais do Admin:')
  console.log(`   Email:  ${ADMIN_EMAIL}`)
  console.log(`   Senha:  ${ADMIN_PASSWORD}`)
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  console.log('⚠️  Troque a senha do admin após o primeiro login!')
  console.log('\nPróximos passos:')
  console.log('  1. npm run dev')
  console.log('  2. Acesse http://localhost:5173/login')
  console.log('  3. Entre com as credenciais acima')
  console.log('  4. Cadastre aparelhos em: Admin → Aparelhos')
  console.log('  5. Adicione exercícios aos grupos: Admin → Grupos de Treino')
  console.log('  6. Crie usuários e atribua grupos: Admin → Usuários')

  process.exit(0)
}

seed().catch((err) => {
  console.error('\n❌ Erro durante o seed:', err)
  process.exit(1)
})
