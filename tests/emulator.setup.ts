import { beforeAll, afterAll } from 'vitest';

declare global {
  var __testEnvTeardown__: (() => Promise<void>) | null;
}

beforeAll(async () => {
  // Emulator tests: either Firestore emulator runs via `firebase emulators:exec`
  // with FIREBASE_AUTH_EMULATOR_HOST / FIRESTORE_EMULATOR_HOST env vars set,
  // or the tests skip themselves gracefully when env is absent.
  // No automatic initializeTestEnvironment here: individual tests decide based on
  // process.env.FIREBASE_EMULATOR=1 so fast local runs don't hang.
});
afterAll(async () => {
  if (typeof globalThis.__testEnvTeardown__ === 'function') {
    await globalThis.__testEnvTeardown__();
    globalThis.__testEnvTeardown__ = null;
  }
});

export {};
