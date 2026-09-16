import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
    exclude: [
      'tests/**/*rules.test.ts',
      'tests/**/*tenant-isolation.test.ts',
      'tests/**/*org-onboarding.test.ts',
      'tests/**/*guardian-identity.test.ts',
      'tests/**/*webhook-delivery.test.ts',
      'tests/**/*idempotency.test.ts',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/lib/**', 'src/services/**', 'src/types/**'],
    },
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'default',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/**/*rules.test.ts', 'tests/**/*tenant-isolation.test.ts', 'tests/**/*org-onboarding.test.ts'],
        },
      },
      {
        test: {
          name: 'emulator',
          environment: 'node',
          globals: true,
          setupFiles: ['./tests/emulator.setup.ts'],
          include: [
            'tests/**/*rules.test.ts',
            'tests/**/*tenant-isolation.test.ts',
            'tests/**/*org-onboarding.test.ts',
            'tests/**/*guardian-identity.test.ts',
            'tests/**/*webhook-delivery.test.ts',
            'tests/**/*rate-limiter.test.ts',
            'tests/**/*idempotency.test.ts',
          ],
          alias: {
            '@': path.resolve(__dirname, './src'),
          },
        },
      },
    ],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

