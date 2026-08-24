import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'

// Previne múltiplas inicializações (importante em serverless)
if (getApps().length === 0) {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}'
  )

  initializeApp({
    credential: cert(serviceAccount),
  })
}

export const adminAuth = getAuth()
export const adminDb = getFirestore()
