'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';

export function FinalCTA() {
  return (
    <section className="py-24 bg-gold relative overflow-hidden">
      <div className="container mx-auto px-6 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto"
        >
          <div className="h-16 w-16 bg-black rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-black/20">
            <ShieldCheck className="h-8 w-8 text-gold" />
          </div>
          <h2 className="text-4xl md:text-6xl font-black text-black mb-8 leading-[1.1] tracking-tight uppercase">
            Protect your legacy <span className="text-white">today.</span>
          </h2>
          <p className="text-black/70 text-lg md:text-xl mb-12 max-w-2xl mx-auto font-medium">
            Join thousands of crypto users who trust ChainLegacy to secure their digital inheritance.
          </p>
          
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link href="/register" className="w-full sm:w-auto">
              <Button size="xl" className="w-full bg-black hover:bg-black/90 text-gold font-black shadow-2xl uppercase tracking-widest h-16 px-12">
                Secure My Vault
              </Button>
            </Link>
            <Link href="/security" className="w-full sm:w-auto">
              <Button variant="outline" size="xl" className="w-full border-black/20 text-black hover:bg-black/5 uppercase tracking-widest font-black h-16 px-12">
                Security Protocol
              </Button>
            </Link>
          </div>
          
          <p className="mt-12 text-black/40 text-[10px] font-black uppercase tracking-[0.3em]">
            Zero-Knowledge • AES-256 GCM • Argon2id
          </p>
        </motion.div>
      </div>
      
      {/* Abstract patterns */}
      <div className="absolute top-0 right-0 w-96 h-96 bg-black/5 rounded-full blur-[100px] -mr-48 -mt-48" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-black/5 rounded-full blur-[100px] -ml-48 -mb-48" />
    </section>
  );
}
