'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { useAuth } from '@/components/auth/AuthProvider';
import { Button } from './Button';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { WorkspaceSwitcher } from '@/components/enterprise/WorkspaceSwitcher';

export const Navbar = () => {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);
  const [menuOpen, setMenuOpen] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      document.cookie = '__session=; path=/; SameSite=Lax; max-age=0';
      router.push('/login');
    } catch (error) {
      console.error('Logout error', error);
    }
  };

  return (
    <nav className="border-b border-white/5 bg-black/50 backdrop-blur-xl sticky top-0 z-[100]">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-3 group">
              <div className="relative h-12 w-12 overflow-hidden rounded-xl border border-gold/20 group-hover:border-gold/40 transition-all duration-300">
                <Image
                  src="/logo.png"
                  alt="ChainLegacy Logo"
                  fill
                  className="object-cover group-hover:scale-110 transition-transform duration-500"
                />
              </div>
              <span className="text-xl font-black text-white uppercase tracking-tighter group-hover:text-gold transition-colors">
                ChainLegacy
              </span>
            </Link>
          </div>

          <div className="hidden lg:flex items-center space-x-6">
            <Link href="/how-it-works" className="text-[10px] font-black text-gray-400 hover:text-gold transition-colors uppercase tracking-[0.2em]">
              How It Works
            </Link>
            <Link href="/pricing" className="text-[10px] font-black text-gray-400 hover:text-gold transition-colors uppercase tracking-[0.2em]">
              Pricing
            </Link>
            <Link href="/register?intent=personal" className="text-[10px] font-black text-gray-400 hover:text-gold transition-colors uppercase tracking-[0.2em]">
              For Individuals
            </Link>
            <Link href="/enterprise" className="text-[10px] font-black text-gold hover:text-gold-dark transition-colors uppercase tracking-[0.2em]">
              For Enterprise
            </Link>
            <Link href="/security" className="text-[10px] font-black text-gray-400 hover:text-gold transition-colors uppercase tracking-[0.2em]">
              Security
            </Link>

            <div className="h-8 w-px bg-white/5 mx-2" />

            {mounted ? (
              <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
            ) : (
              <div className="h-10 w-32 bg-white/5 rounded-xl animate-pulse" />
            )}

            {user && !authLoading ? (
              <>
                <WorkspaceSwitcher />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleLogout}
                  className="border-white/10 text-white hover:bg-white/5 uppercase text-[10px] font-black tracking-widest px-4"
                >
                  Logout
                </Button>
              </>
            ) : (
              <div className="flex items-center space-x-6">
                <Link href="/login" className="text-[10px] font-black text-gray-400 hover:text-white transition-colors uppercase tracking-[0.2em]">
                  Login
                </Link>
                <Link href="/register">
                  <Button
                    size="sm"
                    className="bg-gold hover:bg-gold-dark text-black font-black uppercase text-[10px] tracking-widest px-6 h-10 shadow-lg shadow-gold/20"
                  >
                    Get Started
                  </Button>
                </Link>
              </div>
            )}
          </div>

          <button
            type="button"
            className="lg:hidden text-[10px] font-black uppercase tracking-widest text-gray-400 border border-white/10 rounded-xl px-4 py-2"
            onClick={() => setMenuOpen((v) => !v)}
          >
            Menu
          </button>
        </div>

        {menuOpen && (
          <div className="lg:hidden pb-6 space-y-4 border-t border-white/5 pt-4">
            <Link href="/how-it-works" className="block text-xs font-black uppercase tracking-widest text-gray-400" onClick={() => setMenuOpen(false)}>How It Works</Link>
            <Link href="/pricing" className="block text-xs font-black uppercase tracking-widest text-gray-400" onClick={() => setMenuOpen(false)}>Pricing</Link>
            <Link href="/register?intent=personal" className="block text-xs font-black uppercase tracking-widest text-gray-400" onClick={() => setMenuOpen(false)}>For Individuals</Link>
            <Link href="/enterprise" className="block text-xs font-black uppercase tracking-widest text-gold" onClick={() => setMenuOpen(false)}>For Enterprise</Link>
            <Link href="/login" className="block text-xs font-black uppercase tracking-widest text-gray-400" onClick={() => setMenuOpen(false)}>Login</Link>
            <Link href="/register" className="block text-xs font-black uppercase tracking-widest text-gold" onClick={() => setMenuOpen(false)}>Get Started</Link>
          </div>
        )}
      </div>
    </nav>
  );
};
