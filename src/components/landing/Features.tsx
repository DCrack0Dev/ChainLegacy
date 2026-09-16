'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Video, ShieldCheck, UserCheck, AlertTriangle, Smartphone, Send } from 'lucide-react';

export function Features() {
  const features = [
    {
      icon: <Video className="h-6 w-6 text-gold" />,
      title: "Video Message Vaults",
      description: "Leave a final message or instructions for your loved ones in a secure video format."
    },
    {
      icon: <UserCheck className="h-6 w-6 text-gold" />,
      title: "Guardian Network",
      description: "Appoint trusted contacts to verify and approve the inheritance release process."
    },
    {
      icon: <AlertTriangle className="h-6 w-6 text-gold" />,
      title: "Anti-Takeover 24h Delay",
      description: "Critical vault changes are locked for 24 hours and notified to all stakeholders."
    },
    {
      icon: <Smartphone className="h-6 w-6 text-gold" />,
      title: "WebAuthn / Passkeys",
      description: "Device-level hardware security for the highest tier of vault protection."
    },
    {
      icon: <ShieldCheck className="h-6 w-6 text-gold" />,
      title: "Tamper Alerts",
      description: "Instant notifications if anyone attempts to access or modify your legacy."
    },
    {
      icon: <Send className="h-6 w-6 text-gold" />,
      title: "On-Chain Activity Monitoring",
      description: "Optional monitoring of your wallet address for automated liveness signals."
    }
  ];

  return (
    <section className="py-24 bg-black border-y border-white/5 relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-20">
          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-gold mb-4 block">Premium Features</span>
          <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight">The <span className="text-gold italic">Legacy</span> Suite</h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
          {features.map((feature, index) => (
            <motion.div
              key={index}
              whileHover={{ y: -5 }}
              className="group p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:border-gold/20 hover:bg-white/[0.04] transition-all"
            >
              <div className="h-12 w-12 bg-gold/5 rounded-2xl flex items-center justify-center mb-6 group-hover:bg-gold/10 transition-all">
                {feature.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-4 uppercase tracking-tight">{feature.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
