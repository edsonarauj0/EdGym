import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { initializeFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

if (import.meta.env.DEV) {
  console.log('[Firebase] Project ID:', import.meta.env.VITE_FIREBASE_PROJECT_ID)
}

export const app = initializeApp(firebaseConfig)
export const auth = getAuth(app)

// Banco nomeado 'default' (sem parênteses) — criado manualmente no console
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
}, 'default')
