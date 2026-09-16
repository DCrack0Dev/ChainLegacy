'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import { ShieldCheck, PlayCircle } from 'lucide-react';

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
              Enterprise-Grade Digital Inheritance
            </span>
            <h1 className="text-5xl md:text-7xl font-black text-white mb-8 leading-[1.1] tracking-tight uppercase">
              What happens to your crypto if you <span className="text-gold italic">disappear?</span>
            </h1>
            <p className="text-xl md:text-2xl text-gray-400 mb-12 max-w-2xl mx-auto leading-relaxed">
              Secure your digital assets and deliver them safely to your loved ones — <span className="text-white font-bold underline decoration-gold/50">only when the time is right.</span>
            </p>
            
            <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
              <Link href="/register" className="w-full sm:w-auto">
                <Button size="xl" className="w-full bg-gold hover:bg-gold-dark text-black font-black shadow-[0_0_40px_rgba(212,175,55,0.3)] uppercase tracking-widest h-16 px-10">
                  Secure My Legacy
                </Button>
              </Link>
              <Link href="/simulator" className="w-full sm:w-auto">
                <Button variant="outline" size="xl" className="w-full border-white/10 text-white hover:bg-white/5 uppercase tracking-widest font-black h-16 px-10 group">
                  <PlayCircle className="mr-2 h-5 w-5 text-gold group-hover:scale-110 transition-transform" />
                  Run Simulation
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
      
      {/* Background elements */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 -z-10 w-full max-w-7xl aspect-square bg-[radial-gradient(circle_at_center,rgba(212,175,55,0.08)_0%,transparent_70%)] blur-[100px]" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />
    </section>
  );
}
