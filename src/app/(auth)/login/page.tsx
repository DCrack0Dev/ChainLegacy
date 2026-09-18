'use client';

import React, { useState, Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { Loading } from '@/components/ui/Loading';

function LoginPageContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;

      // Track device info
      let ip = 'Unknown';
      try {
        const res = await fetch('https://api.ipify.org?format=json');
        const data = await res.json();
        ip = data.ip;
      } catch (e) {
        console.error('Failed to get IP', e);
      }

      const ua = navigator.userAgent;
      const device = {
        browser: ua.includes('Chrome') ? 'Chrome' : ua.includes('Firefox') ? 'Firefox' : ua.includes('Safari') ? 'Safari' : ua.includes('Edge') ? 'Edge' : 'Unknown Browser',
        os: ua.includes('Windows') ? 'Windows' : ua.includes('Mac') ? 'macOS' : ua.includes('Android') ? 'Android' : ua.includes('iPhone') ? 'iOS' : 'Unknown OS',
        ip,
        timestamp: new Date().toISOString(),
        lastLogin: new Date().toISOString(),
      };

      try {
        await updateDoc(doc(db, 'users', user.uid), {
          sessions: arrayUnion(device),
          lastLogin: new Date().toISOString(),
          logs: arrayUnion({
            action: 'login_success',
            timestamp: new Date().toISOString(),
            details: `Account accessed from ${device.browser} on ${device.os} (IP: ${ip}).`
          })
        });
      } catch {
        // Enterprise-only owners may not have a personal users/{uid} doc yet.
      }

      const redirect = searchParams.get('redirect');
      const safeRedirect =
        redirect && redirect.startsWith('/') && !redirect.startsWith('//')
          ? redirect
          : '/dashboard';
      router.push(safeRedirect);
    } catch (err: any) {
      setError(err.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

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
      <Card className="w-full max-w-md">
        <CardHeader 
          title="Welcome Back" 
          subtitle="Login to manage your legacy and secure your assets." 
        />
        <form onSubmit={handleLogin}>
          <CardContent>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Input
              label="Email Address"
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Input
              label="Password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </CardContent>
          <CardFooter className="flex flex-col space-y-4">
            <Button type="submit" className="w-full" isLoading={loading}>
              Sign In
            </Button>
            <p className="text-sm text-gray-400">
              Don&apos;t have an account?{' '}
              <Link href="/register" className="text-gold hover:underline">
                Create one
              </Link>
              {' · '}
              <Link href="/enterprise" className="text-gold hover:underline">
                Enterprise
              </Link>
            </p>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<Loading />}>
      <LoginPageContent />
    </Suspense>
  );
}
