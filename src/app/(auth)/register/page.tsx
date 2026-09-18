'use client';

import React, { Suspense, useMemo, useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Building2, User } from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { SecureProcessing } from '@/components/ui/SecureProcessing';

type Intent = 'choose' | 'personal';

function RegisterInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialIntent = useMemo<Intent | 'enterprise'>(() => {
    const q = searchParams.get('intent');
    if (q === 'personal') return 'personal';
    if (q === 'enterprise') return 'enterprise';
    return 'choose';
  }, [searchParams]);

  const [intent, setIntent] = useState<Intent | 'enterprise'>(initialIntent);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [personalPhrase, setPersonalPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    setIntent(initialIntent);
  }, [initialIntent]);

  useEffect(() => {
    if (intent === 'enterprise') {
      router.replace('/enterprise/onboard');
    }
  }, [intent, router]);

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      const now = Date.now();

      await setDoc(doc(db, 'users', user.uid), {
        email: user.email,
        uid: user.uid,
        name,
        phone,
        personalPhrase,
        createdAt: serverTimestamp(),
        hasSetup: false,
        isPro: false,
        plan: 'free',
        vaultId: user.uid,
        logs: [
          {
            action: 'account_created',
            timestamp: new Date().toISOString(),
            details: 'Digital legacy account created successfully.',
          },
        ],
      });

      await setDoc(doc(db, 'vaults', user.uid), {
        id: user.uid,
        ownerId: user.uid,
        status: 'active',
        lastCheckIn: now,
        interval: 30,
        contacts: [],
        createdAt: now,
      });

      setIsProcessing(true);
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  if (intent === 'enterprise') {
    return <div className="text-gray-500 text-sm">Redirecting to enterprise onboarding…</div>;
  }

  return (
    <>
      {isProcessing && <SecureProcessing onComplete={() => router.push('/dashboard/setup')} />}
      {intent === 'choose' ? (
        <Card className="w-full max-w-lg">
          <CardHeader
            title="Create your ChainLegacy account"
            subtitle="Choose the experience that matches what you are building."
          />
          <CardContent className="space-y-4">
            <button
              type="button"
              onClick={() => setIntent('personal')}
              className="w-full text-left rounded-[1.5rem] border border-white/10 bg-white/[0.02] hover:border-gold/40 p-5 transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <User className="h-5 w-5 text-gold" />
                <span className="text-sm font-black uppercase tracking-wider text-white">Personal Account</span>
              </div>
              <p className="text-sm text-gray-500">
                For individuals protecting their own digital legacy, vault, beneficiaries and guardians.
              </p>
            </button>
            <button
              type="button"
              onClick={() => router.push('/enterprise/onboard')}
              className="w-full text-left rounded-[1.5rem] border border-gold/30 bg-gold/[0.04] hover:border-gold/60 p-5 transition-all"
            >
              <div className="flex items-center gap-3 mb-2">
                <Building2 className="h-5 w-5 text-gold" />
                <span className="text-sm font-black uppercase tracking-wider text-white">Enterprise</span>
              </div>
              <p className="text-sm text-gray-500">
                For organizations managing ChainLegacy services for customers. Creates an Organization — not a customer account.
              </p>
            </button>
          </CardContent>
          <CardFooter>
            <p className="text-sm text-gray-400 w-full text-center">
              Already have an account?{' '}
              <Link href="/login" className="text-gold hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </Card>
      ) : (
        <Card className="w-full max-w-md">
          <CardHeader title="Create Personal Account" subtitle="Start securing your digital legacy today." />
          <form onSubmit={handleRegister}>
            <CardContent className="space-y-4">
              {error && <p className="text-sm text-red-500">{error}</p>}
              <Input label="Full Name" value={name} onChange={(e) => setName(e.target.value)} required />
              <Input label="Email Address" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
              <Input label="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
              <Input
                label="Personal Phrase"
                value={personalPhrase}
                onChange={(e) => setPersonalPhrase(e.target.value)}
                placeholder="A phrase only you would know"
              />
              <Input label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
              <Input
                label="Confirm Password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
              <button
                type="button"
                className="text-xs text-gray-500 hover:text-gold mt-2"
                onClick={() => setIntent('choose')}
              >
                ← Choose a different path
              </button>
            </CardContent>
            <CardFooter className="flex flex-col space-y-4">
              <Button type="submit" className="w-full" isLoading={loading}>
                Create Legacy Vault
              </Button>
              <p className="text-sm text-gray-400">
                Need an organization instead?{' '}
                <Link href="/enterprise/onboard" className="text-gold hover:underline">
                  Create Organization
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      )}
    </>
  );
}

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-black">
      <Link href="/" className="mb-12 group">
        <div className="relative h-20 w-20 overflow-hidden rounded-2xl border border-gold/20 group-hover:border-gold/40 transition-all duration-300">
          <Image
            src="/logo.png"
            alt="ChainLegacy Logo"
            fill
            className="object-cover group-hover:scale-110 transition-transform duration-500"
          />
        </div>
      </Link>
      <Suspense fallback={<div className="text-gray-500 text-sm">Loading…</div>}>
        <RegisterInner />
      </Suspense>
    </div>
  );
}
