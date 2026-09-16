'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Lock, EyeOff, ShieldCheck, Database, Key } from 'lucide-react';

export function Trust() {
  const points = [
    {
      icon: <EyeOff className="h-6 w-6 text-gold" />,
      title: "Zero-Knowledge Architecture",
      description: "We never see your plaintext data. Everything is encrypted locally on your device before being stored."
    },
    {
      icon: <Lock className="h-6 w-6 text-gold" />,
      title: "Military-Grade AES-256 GCM",
      description: "Industry-standard authenticated encryption for data confidentiality and integrity."
    },
    {
      icon: <ShieldCheck className="h-6 w-6 text-gold" />,
      title: "Argon2id Key Derivation",
      description: "Memory-hard hashing ensures your encryption password is resistant to brute-force attacks."
    },
    {
      icon: <Database className="h-6 w-6 text-gold" />,
      title: "Decentralized IPFS Storage",
      description: "Your encrypted legacy is distributed across a decentralized network for permanent availability."
    },
    {
      icon: <Key className="h-6 w-6 text-gold" />,
      title: "Shamir Secret Sharing",
      description: "Split your master keys into M-of-N shares for ultimate multi-party redundancy."
    }
  ];

  return (
    <section className="py-24 bg-card/30 border-y border-white/5 relative">
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-20">
          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-gold mb-4 block">Trust & Security</span>
          <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight">Built on <span className="text-gold italic">Zero Trust</span></h2>
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mt-6">
            We built ChainLegacy so that we don't have to trust ourselves. You own the keys, you own the data.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {points.map((point, index) => (
            <motion.div
              key={index}
              whileHover={{ y: -10 }}
              className="p-10 rounded-[3rem] bg-white/[0.02] border border-white/5 group transition-all hover:bg-white/[0.05] hover:border-gold/20"
            >
              <div className="h-14 w-14 bg-gold/10 rounded-2xl flex items-center justify-center mb-8 border border-gold/10 group-hover:bg-gold/20 group-hover:border-gold/30 transition-all">
                {point.icon}
              </div>
              <h3 className="text-2xl font-bold text-white mb-6 tracking-tight uppercase">{point.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed leading-[1.6]">
                {point.description}
              </p>
            </motion.div>
          ))}
        </div>
        
        <div className="mt-20 p-8 rounded-[2rem] bg-gold/5 border border-gold/10 flex flex-col md:flex-row items-center justify-between gap-8 max-w-5xl mx-auto">
          <div className="flex items-center space-x-6">
            <div className="h-16 w-16 bg-gold/10 rounded-full flex items-center justify-center border border-gold/20 shrink-0">
              <Lock className="h-8 w-8 text-gold" />
            </div>
            <div>
              <p className="text-white font-bold uppercase tracking-tight text-xl mb-1">Non-Custodial Guarantee</p>
              <p className="text-gray-400 text-sm">ChainLegacy does not hold your funds, keys, or seeds.</p>
            </div>
          </div>
          <Link href="/security">
            <button className="px-8 py-4 bg-white/5 border border-white/10 rounded-full text-xs font-black uppercase tracking-widest text-white hover:bg-white/10 transition-all">
              Read Security Protocol
            </button>
          </Link>
        </div>
      </div>
    </section>
  );
}
