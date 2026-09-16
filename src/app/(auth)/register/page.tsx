'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { SecureProcessing } from '@/components/ui/SecureProcessing';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [personalPhrase, setPersonalPhrase] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const router = useRouter();

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

      // Initialize user data in Firestore
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
        vaultId: user.uid, // Link to vault
        logs: [{
          action: 'account_created',
          timestamp: new Date().toISOString(),
          details: 'Digital legacy account created successfully.'
        }]
      });

      // STEP 2: FIX ACCOUNT CREATION (ROOT BUG)
      // CREATE a vault immediately
      await setDoc(doc(db, 'vaults', user.uid), {
        id: user.uid,
        ownerId: user.uid,
        status: 'active',
        lastCheckIn: now,
        interval: 30,
        contacts: [],
        createdAt: now
      });

      setIsProcessing(true);
    } catch (err: any) {
      setError(err.message || 'Failed to register');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4 bg-black">
      {isProcessing && <SecureProcessing onComplete={() => router.push('/dashboard/setup')} />}
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
      <Card className="w-full max-w-md">
        <CardHeader 
          title="Create Account" 
          subtitle="Start securing your digital legacy today." 
        />
        <form onSubmit={handleRegister}>
          <CardContent className="space-y-4">
            {error && <p className="text-sm text-red-500 bg-red-500/10 p-3 rounded-lg border border-red-500/20">{error}</p>}
            <Input
              label="Full Name"
              type="text"
              placeholder="John Doe"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <Input
              label="Email Address"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Phone Number"
              type="tel"
              placeholder="+1 (555) 000-0000"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
            />
            <Input
              label="Security Phrase"
              type="text"
              placeholder="A phrase only you know"
              value={personalPhrase}
              onChange={(e) => setPersonalPhrase(e.target.value)}
              required
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <Input
                label="Confirm Password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
              />
            </div>
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" isLoading={loading}>
              Create Legacy Vault
            </Button>
            <p className="text-sm text-gray-400">
              Already have an account?{' '}
              <Link href="/login" className="text-gold hover:underline">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
