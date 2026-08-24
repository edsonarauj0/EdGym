import * as admin from 'firebase-admin'

// Previne múltiplas inicializações (importante em serverless)
if (!admin.apps.length) {
  const serviceAccount = JSON.parse(
    process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}'
  )

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  })
}

export const adminAuth = admin.auth()
export const adminDb = admin.firestore()
export { admin }
