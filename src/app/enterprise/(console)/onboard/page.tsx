'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { Building2, ArrowLeft } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/components/auth/AuthProvider';
import { enterpriseJson } from '@/lib/enterprise-client';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export default function EnterpriseOnboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'create-org'>(user ? 'create-org' : 'signin');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [country, setCountry] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sandboxSecret, setSandboxSecret] = useState<string | null>(null);
  const [createdOrgId, setCreatedOrgId] = useState<string | null>(null);

  React.useEffect(() => {
    if (!authLoading && user) setMode('create-org');
  }, [authLoading, user]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await createUserWithEmailAndPassword(auth, email, password);
      setMode('create-org');
    } catch (err: any) {
      if (err?.code === 'auth/email-already-in-use') {
        setError('Account exists. Please sign in instead.');
        router.push(`/login?redirect=${encodeURIComponent('/enterprise/onboard')}`);
      } else {
        setError(err?.message || 'Failed to create account');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCreateOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const current = auth.currentUser;
      if (!current) throw new Error('Please sign in first');
      const payload = await enterpriseJson<{
        organizationId: string;
        defaultSandboxKey?: { secret?: string };
      }>('/api/v1/organizations', {
        method: 'POST',
        body: JSON.stringify({
          name,
          slug: slug || slugify(name),
          ownerUid: current.uid,
          country: country || undefined,
        }),
      });
      setCreatedOrgId(payload.organizationId);
      setSandboxSecret(payload.defaultSandboxKey?.secret || null);
      if (typeof window !== 'undefined') {
        localStorage.setItem('chainlegacy.activeOrgId', payload.organizationId);
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to create organization');
    } finally {
      setLoading(false);
    }
  };

  if (sandboxSecret || createdOrgId) {
    return (
      <div className="max-w-xl mx-auto space-y-6">
        <Card>
          <CardHeader
            title="Organization created"
            subtitle="Store your sandbox API key now. It will not be shown again."
          />
          <CardContent className="space-y-4">
            <div className="rounded-2xl border border-gold/20 bg-gold/[0.05] p-4">
              <div className="text-[10px] uppercase tracking-widest text-gold mb-2">Organization ID</div>
              <code className="text-sm text-white break-all">{createdOrgId}</code>
            </div>
            {sandboxSecret && (
              <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="text-[10px] uppercase tracking-widest text-amber-400 mb-2">
                  Sandbox API key (show once)
                </div>
                <code className="text-xs text-white break-all">{sandboxSecret}</code>
              </div>
            )}
            <p className="text-sm text-gray-500">
              You are an organization owner — not a customer. Next, open the dashboard to manage customers under this organization.
            </p>
          </CardContent>
          <CardFooter>
            <Button className="w-full" onClick={() => router.push('/enterprise/overview')}>
              Go to Organization Dashboard
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <Link
        href="/enterprise"
        className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-gray-500 hover:text-gold"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Enterprise
      </Link>

      <div className="flex items-center gap-3 mb-2">
        <div className="h-12 w-12 rounded-2xl bg-gold/10 border border-gold/30 grid place-items-center">
          <Building2 className="h-6 w-6 text-gold" />
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-gold">Enterprise Onboarding</div>
          <h1 className="text-2xl font-black uppercase tracking-tight text-white">Create Organization</h1>
        </div>
      </div>

      <Card>
        {mode === 'signin' && !user ? (
          <>
            <CardHeader
              title="Enterprise account"
              subtitle="Create a Firebase account that will own your organization. This does not create a personal vault."
            />
            <form onSubmit={handleAuth}>
              <CardContent className="space-y-4">
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Input
                  label="Work Email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-500">
                  Already have an account?{' '}
                  <Link
                    href={`/login?redirect=${encodeURIComponent('/enterprise/onboard')}`}
                    className="text-gold hover:underline"
                  >
                    Sign in
                  </Link>
                </p>
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" isLoading={loading}>
                  Continue
                </Button>
              </CardFooter>
            </form>
          </>
        ) : (
          <>
            <CardHeader
              title="Organization details"
              subtitle="You are creating an Organization. Customers you manage will live under this org."
            />
            <form onSubmit={handleCreateOrg}>
              <CardContent className="space-y-4">
                {error && <p className="text-sm text-red-500">{error}</p>}
                <Input
                  label="Organization Name"
                  placeholder="ACME Financial"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (!slug || slug === slugify(name)) setSlug(slugify(e.target.value));
                  }}
                  required
                />
                <Input
                  label="Slug"
                  placeholder="acme-financial"
                  value={slug}
                  onChange={(e) => setSlug(slugify(e.target.value))}
                  required
                />
                <Input
                  label="Country (optional)"
                  placeholder="ZA"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </CardContent>
              <CardFooter>
                <Button type="submit" className="w-full" isLoading={loading || authLoading}>
                  Create Organization
                </Button>
              </CardFooter>
            </form>
          </>
        )}
      </Card>
    </div>
  );
}
