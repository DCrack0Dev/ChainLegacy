'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, Building2, User } from 'lucide-react';

export function Hero() {
  return (
    <section className="relative pt-32 pb-20 overflow-hidden min-h-[90vh] flex items-center">
      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <span className="inline-block px-4 py-1.5 mb-6 text-xs font-black tracking-[0.2em] uppercase bg-gold/10 text-gold rounded-full border border-gold/20">
              Digital Legacy Infrastructure
            </span>
            <h1 className="text-5xl md:text-7xl font-black text-white mb-6 leading-[1.1] tracking-tight uppercase">
              Secure your <span className="text-gold italic">digital legacy</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 mb-4 max-w-2xl mx-auto leading-relaxed">
              For individuals, families, businesses and institutions.
            </p>
            <p className="text-base text-gray-500 mb-12 max-w-xl mx-auto">
              Protect personal assets — or manage digital legacy services for your customers through ChainLegacy enterprise infrastructure.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto mb-10 text-left">
              <Link
                href="/register?intent=personal"
                className="group rounded-[2rem] border border-white/10 bg-white/[0.02] hover:border-gold/40 p-6 transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-gold/10 border border-gold/20 grid place-items-center">
                    <User className="h-5 w-5 text-gold" />
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gold">For Individuals</div>
                </div>
                <div className="text-white font-black uppercase tracking-tight mb-2">Create Personal Account</div>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Protect your personal digital legacy, assets, messages and instructions.
                </p>
              </Link>
              <Link
                href="/enterprise"
                className="group rounded-[2rem] border border-gold/30 bg-gold/[0.04] hover:border-gold/60 p-6 transition-all"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-10 rounded-xl bg-gold/10 border border-gold/20 grid place-items-center">
                    <Building2 className="h-5 w-5 text-gold" />
                  </div>
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-gold">For Enterprise</div>
                </div>
                <div className="text-white font-black uppercase tracking-tight mb-2">Explore Enterprise</div>
                <p className="text-sm text-gray-500 leading-relaxed">
                  Manage digital legacy services for your customers through organization infrastructure.
                </p>
              </Link>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Link href="/register?intent=personal" className="w-full sm:w-auto">
                <Button
                  size="xl"
                  className="w-full bg-gold hover:bg-gold-dark text-black font-black shadow-[0_0_40px_rgba(212,175,55,0.3)] uppercase tracking-widest h-14 px-8"
                >
                  Create Personal Account
                </Button>
              </Link>
              <Link href="/enterprise" className="w-full sm:w-auto">
                <Button
                  variant="outline"
                  size="xl"
                  className="w-full border-white/10 text-white hover:bg-white/5 uppercase tracking-widest font-black h-14 px-8"
                >
                  For Enterprise
                </Button>
              </Link>
            </div>

            <div className="mt-16 flex items-center justify-center space-x-8 text-gray-500 opacity-60 grayscale hover:grayscale-0 transition-all duration-500">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">AES-256 GCM</span>
              </div>
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Argon2id KDF</span>
              </div>
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-5 w-5" />
                <span className="text-[10px] font-black uppercase tracking-widest">Zero-Knowledge</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="absolute top-0 left-1/2 -translate-x-1/2 -z-10 w-full max-w-7xl aspect-square bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.08)_0%,transparent_70%)] blur-[100px]" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
    </section>
  );
}
