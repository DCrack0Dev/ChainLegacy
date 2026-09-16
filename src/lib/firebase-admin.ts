import * as admin from "firebase-admin";

const getAdminApp = () => {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKeyBase64 = process.env.FIREBASE_PRIVATE_KEY_BASE64;
  let privateKey = null;

  if (privateKeyBase64) {
    try {
      privateKey = Buffer.from(privateKeyBase64, 'base64').toString('utf8');
    } catch (err) {
      console.error("Failed to decode FIREBASE_PRIVATE_KEY_BASE64");
    }
  }

  if (!admin.apps.length) {
    if (projectId && clientEmail && privateKey) {
      try {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId,
            clientEmail,
            privateKey,
          }),
        });
      } catch (error: any) {
        console.error("Firebase admin initialization error", error);
      }
    }
  }
  return admin.apps.length ? admin.apps[0] : null;
};

const app = getAdminApp();

export const adminDb = app ? admin.firestore() : null;
export const adminAuth = app ? admin.auth() : null;
export const FieldValue = admin.firestore.FieldValue;
