import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('vercel.json cron schedule (AC-10, TR-4.1)', () => {
  it('commits daily schedule for /api/cron/check-status', () => {
    const raw = fs.readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8');
    const parsed = JSON.parse(raw);
    expect(parsed.crons[0]).toEqual({
      path: '/api/cron/check-status',
      schedule: '0 0 * * *',
    });
  });
});

describe('.env.example + README scrub (AC-11 TR-2.1 TR-2.2)', () => {
  const envExamplePath = path.resolve(process.cwd(), '.env.example');
  const readmePath = path.resolve(process.cwd(), 'README.md');
  it('.env.example exists with required keys', () => {
    expect(fs.existsSync(envExamplePath)).toBe(true);
    const body = fs.readFileSync(envExamplePath, 'utf8');
    const required = [
      'NEXT_PUBLIC_FIREBASE_API_KEY',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_PRIVATE_KEY_BASE64',
      'SENDGRID_API_KEY',
      'CRON_SECRET',
      'NEXT_PUBLIC_APP_URL',
      'RP_ID',
      'ORIGIN',
    ];
    for (const k of required) expect(body.includes(k)).toBe(true);
  });
  it('README.md no longer contains leaked config literals', () => {
    const body = fs.readFileSync(readmePath, 'utf8');
    expect(body.includes('AIzaSyDUhsOS9_vdVrxOnHtXzNHBEI7iw1JLwJc')).toBe(false);
    expect(body.includes('chainlegacy_secret_123')).toBe(false);
    expect(body.includes('chainlegacy-1e56a')).toBe(false);
  });
});
