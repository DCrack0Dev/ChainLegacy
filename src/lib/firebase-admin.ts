import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';

const getAdminApp = (): App | null => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  let privateKey: string | null = null;

  if (privateKeyBase64) {
    try {
      privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    } catch {
      console.error('Failed to decode FIREBASE_PRIVATE_KEY_BASE64');
    }
  }

  const existingApp = getApps()[0];
  if (existingApp) return existingApp;
  if (!projectId || !clientEmail || !privateKey) return null;

  try {
    return initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
    });
  } catch (error) {
    console.error('Firebase admin initialization error', error);
    return null;
  }
};

const app = getAdminApp();

export const adminDb: Firestore | null = app ? getFirestore(app) : null;
export const adminAuth: Auth | null = app ? getAuth(app) : null;
export { FieldValue };
