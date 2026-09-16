'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/ui/Navbar';
import { ShieldCheck, EyeOff, Lock, Server, Users, Key, PlayCircle } from 'lucide-react';

export default function SecurityPage() {
  const securityFeatures = [
    {
      icon: <EyeOff className="h-6 w-6 text-gold" />,
      title: "Zero-Knowledge Architecture",
      description: "We never see your plaintext data. All encryption happens on your local device before it ever reaches our servers."
    },
    {
      icon: <Lock className="h-6 w-6 text-gold" />,
      title: "Military-Grade AES-256 GCM",
      description: "The gold standard for encryption. Authenticated encryption ensures data confidentiality and integrity."
    },
    {
      icon: <ShieldCheck className="h-6 w-6 text-gold" />,
      title: "Argon2id Key Derivation",
      description: "A memory-hard hashing function that protects your decryption password against brute-force attacks."
    },
    {
      icon: <Server className="h-6 w-6 text-gold" />,
      title: "Decentralized IPFS Storage",
      description: "Encrypted vaults are stored across a decentralized network to ensure permanent availability and redundancy."
    },
    {
      icon: <Users className="h-6 w-6 text-gold" />,
      title: "Guardian Consensus",
      description: "No single person (not even us) can trigger your vault. A multi-party consensus is required."
    },
    {
      icon: <Key className="h-6 w-6 text-gold" />,
      title: "Shamir Secret Sharing",
      description: "Split your master keys into M-of-N shares, requiring multiple trusted parties to reconstruct the secret."
    }
  ];

  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      
      <main className="container mx-auto px-6 pt-24 pb-32">
        <div className="max-w-4xl mx-auto text-center mb-24">
          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-gold mb-6 block">Security Protocol</span>
          <h1 className="text-4xl md:text-7xl font-black text-white uppercase tracking-tight mb-8">
            Security is our <span className="text-gold italic underline decoration-gold/30">only</span> product.
          </h1>
          <p className="text-xl text-gray-400 leading-relaxed max-w-2xl mx-auto">
            ChainLegacy was built from the ground up to ensure that your digital inheritance is protected by math, not trust.
          </p>
        </div>

        {/* Core Principles Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-32">
          {securityFeatures.map((feature, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="p-10 rounded-[3rem] bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all"
            >
              <div className="h-14 w-14 bg-gold/10 rounded-2xl flex items-center justify-center mb-8 border border-gold/10">
                {feature.icon}
              </div>
              <h3 className="text-2xl font-bold text-white mb-4 uppercase tracking-tight">{feature.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed max-w-sm">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Visual Trust Section */}
        <section className="p-12 md:p-20 rounded-[4rem] bg-gold/5 border border-gold/10 mb-32 relative overflow-hidden">
          <div className="max-w-3xl mx-auto text-center relative z-10">
            <h2 className="text-3xl font-black text-white uppercase tracking-tight mb-8">The Founder's Commitment</h2>
            <div className="aspect-video bg-black rounded-[3rem] border border-gold/20 flex items-center justify-center mb-10 relative group cursor-pointer overflow-hidden shadow-2xl">
              <div className="absolute inset-0 bg-gold/5 group-hover:bg-gold/10 transition-all" />
              <PlayCircle className="h-20 w-20 text-gold relative z-10 group-hover:scale-110 transition-transform shadow-2xl" />
              <p className="absolute bottom-10 text-[10px] font-black text-gold uppercase tracking-[0.2em] z-10 opacity-60">Watch System Walkthrough</p>
            </div>
            <p className="text-gray-400 italic text-lg leading-relaxed">
              "We believe that everyone deserves the right to pass on their digital legacy without relying on centralized intermediaries. That's why we built ChainLegacy with zero-knowledge at its heart."
            </p>
            <p className="mt-6 text-white font-black uppercase tracking-widest text-xs">— The ChainLegacy Team</p>
          </div>
        </section>

        {/* Final Trust Banner */}
        <div className="p-12 rounded-[3rem] bg-white/[0.02] border border-white/5 text-center">
          <div className="flex items-center justify-center space-x-6 mb-8 opacity-40">
            <ShieldCheck className="h-6 w-6 text-white" />
            <ShieldCheck className="h-6 w-6 text-white" />
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <p className="text-xs font-black text-gray-500 uppercase tracking-[0.4em]">Independently Audited & Open Source Verified</p>
        </div>
      </main>
    </div>
  );
}
