# ChainLegacy - Secure Crypto Inheritance System

ChainLegacy is a secure web application that ensures your digital assets are safely passed to your beneficiaries if you miss your check-in interval.

## Tech Stack
- **Frontend**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS (Dark/Gold theme)
- **Backend**: Next.js API Routes & Server Actions
- **Database**: Firebase Firestore
- **Authentication**: Firebase Auth (Email/Password)
- **Encryption**: Node.js `crypto` (AES-256-CBC)

## Features
- **Secure Encryption**: Secrets (seed phrases/private keys) are encrypted locally using AES-256 before storage.
- **Dead Man's Switch**: Configurable check-in intervals (7, 14, or 30 days).
- **Automated Logic**: Simulated daily status checks to trigger the legacy process.
- **Beneficiary Claim**: Secure access for beneficiaries with OTP verification and decryption.
- **Modern UI**: Clean, responsive dashboard with dark theme and gold accents.

## Getting Started

### 1. Prerequisites
- Node.js 18+ 
- A Firebase project (Auth and Firestore enabled)

### 2. Setup Environment Variables
Copy `.env.example` into `.env.local` (never commit real values). Configure:

```env
# Client-side Firebase config
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id

# Admin-side Firebase service-account config
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY_BASE64=base64-of-your-firebase-private-key-pem

# Cron Secret for status check API
# Generate a fresh secret with:  openssl rand -hex 32
# Never commit real CRON_SECRET values or examples.
CRON_SECRET=<32-byte random hex; e.g. openssl rand -hex 32>
```

### 3. Firestore Rules
I've added [firestore.rules](file:///c:/Users/Thiza\Documents\trae_projects\CHainLegacy\firestore.rules) to the project root for reference. You should apply these rules in your Firebase Console under **Firestore Database > Rules**.

```javascript
rules_version = '2';

service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if
          request.time < timestamp.date(2026, 4, 23);
    }
  }
}
```

### 4. Install Dependencies
```bash
npm install
```

### 4. Run Locally
```bash
npm run dev
```
The app will be available at [http://localhost:3000](http://localhost:3000).

### 5. Simulate Status Check (Cron Job)
To trigger the status check logic manually:
```bash
curl http://localhost:3000/api/cron/check-status -H "Authorization: Bearer your_cron_secret"
```

## Security Note
ChainLegacy uses **AES-256-CBC** for secret encryption. The key is derived from a user-provided password using **PBKDF2** with a unique salt. We never store plain-text secrets or encryption passwords.
