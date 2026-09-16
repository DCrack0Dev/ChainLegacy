'use client';

import React, { Suspense } from 'react';
import dynamic from 'next/dynamic';
import Image from 'next/image';
import Link from 'next/link';
import { Navbar } from '@/components/ui/Navbar';
import { Hero } from '@/components/landing/Hero';
import { ShieldAlert } from 'lucide-react';

// Lazy load heavy components below the fold
const Problem = dynamic(() => import('@/components/landing/Problem').then(mod => mod.Problem), { 
  loading: () => <div className="h-96 bg-black animate-pulse" /> 
});
const Solution = dynamic(() => import('@/components/landing/Solution').then(mod => mod.Solution), {
  loading: () => <div className="h-96 bg-black animate-pulse" />
});
const Trust = dynamic(() => import('@/components/landing/Trust').then(mod => mod.Trust), {
  loading: () => <div className="h-96 bg-black animate-pulse" />
});
const Timeline = dynamic(() => import('@/components/landing/Timeline').then(mod => mod.Timeline), {
  loading: () => <div className="h-96 bg-black animate-pulse" />
});
const Features = dynamic(() => import('@/components/landing/Features').then(mod => mod.Features), {
  loading: () => <div className="h-96 bg-black animate-pulse" />
});
const Pricing = dynamic(() => import('@/components/landing/Pricing').then(mod => mod.Pricing), {
  loading: () => <div className="h-96 bg-black animate-pulse" />
});
const FinalCTA = dynamic(() => import('@/components/landing/FinalCTA').then(mod => mod.FinalCTA), {
  loading: () => <div className="h-96 bg-black animate-pulse" />
});

export default function LandingPage() {
  // Public landing page doesn't need to block for auth
  return (
    <div className="bg-black min-h-screen selection:bg-gold/30 selection:text-gold">
      <Navbar />
      
      <main>
        <Hero />
        <Suspense fallback={<div className="h-96 bg-black animate-pulse" />}>
          <Problem />
        </Suspense>
        <Suspense fallback={<div className="h-96 bg-black animate-pulse" />}>
          <Solution />
        </Suspense>
        <Suspense fallback={<div className="h-96 bg-black animate-pulse" />}>
          <Trust />
        </Suspense>
        <Suspense fallback={<div className="h-96 bg-black animate-pulse" />}>
          <Timeline />
        </Suspense>
        <Suspense fallback={<div className="h-96 bg-black animate-pulse" />}>
          <Features />
        </Suspense>
        <Suspense fallback={<div className="h-96 bg-black animate-pulse" />}>
          <Pricing />
        </Suspense>
        <Suspense fallback={<div className="h-96 bg-black animate-pulse" />}>
          <FinalCTA />
        </Suspense>
      </main>

      <footer className="py-20 border-t border-white/5 bg-black">
        <div className="container mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center space-x-3 mb-6">
                <div className="relative h-10 w-10 overflow-hidden rounded-lg border border-gold/20">
                  <Image 
                    src="/logo.png" 
                    alt="ChainLegacy Logo" 
                    fill 
                    className="object-cover"
                  />
                </div>
                <span className="text-xl font-black text-white uppercase tracking-tighter">ChainLegacy</span>
              </div>
              <p className="text-gray-500 text-sm max-w-sm mb-8">
                The enterprise-grade infrastructure for digital inheritance. Built on zero-knowledge principles to ensure your legacy is protected and delivered safely.
              </p>
              <div className="flex items-center space-x-4">
                <div className="h-10 w-10 bg-white/5 rounded-full border border-white/10 flex items-center justify-center text-gray-400 hover:text-gold hover:border-gold/30 transition-all cursor-pointer">
                  <span className="text-xs font-black">X</span>
                </div>
                <div className="h-10 w-10 bg-white/5 rounded-full border border-white/10 flex items-center justify-center text-gray-400 hover:text-gold hover:border-gold/30 transition-all cursor-pointer">
                  <span className="text-xs font-black">TG</span>
                </div>
                <div className="h-10 w-10 bg-white/5 rounded-full border border-white/10 flex items-center justify-center text-gray-400 hover:text-gold hover:border-gold/30 transition-all cursor-pointer">
                  <span className="text-xs font-black">GH</span>
                </div>
              </div>
            </div>
            
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-[0.3em] mb-8">Product</h4>
              <ul className="space-y-4 text-sm text-gray-500">
                <li><Link href="/simulator" className="hover:text-gold transition-colors">Simulator</Link></li>
                <li><Link href="/pricing" className="hover:text-gold transition-colors">Pricing</Link></li>
                <li><Link href="/security" className="hover:text-gold transition-colors">Security</Link></li>
                <li><Link href="/audit" className="hover:text-gold transition-colors">Audit Report</Link></li>
              </ul>
            </div>
            
            <div>
              <h4 className="text-xs font-black text-white uppercase tracking-[0.3em] mb-8">Legal</h4>
              <ul className="space-y-4 text-sm text-gray-500">
                <li><Link href="/terms" className="hover:text-gold transition-colors">Terms of Service</Link></li>
                <li><Link href="/privacy" className="hover:text-gold transition-colors">Privacy Policy</Link></li>
                <li><Link href="/cookies" className="hover:text-gold transition-colors">Cookie Policy</Link></li>
                <li><Link href="/disclaimer" className="hover:text-gold transition-colors">Disclaimer</Link></li>
              </ul>
            </div>
          </div>
          
          <div className="pt-12 border-t border-white/5 flex flex-col md:flex-row items-center justify-between gap-8">
            <div className="flex items-center space-x-4 bg-red-500/5 border border-red-500/10 px-4 py-2 rounded-full">
              <ShieldAlert className="h-4 w-4 text-red-500" />
              <p className="text-[10px] font-black text-red-500/80 uppercase tracking-widest">
                Non-Custodial: We never hold your private keys.
              </p>
            </div>
            <p className="text-[10px] font-black text-gray-600 uppercase tracking-[0.3em]">
              © {new Date().getFullYear()} ChainLegacy. All rights reserved.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
