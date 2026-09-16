'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Shield, Users, Clock, Send } from 'lucide-react';

export function Solution() {
  const steps = [
    {
      icon: <Shield className="h-6 w-6 text-gold" />,
      title: "Secure Your Vault",
      description: "Encrypt your keys, passwords, and messages locally using AES-256 GCM."
    },
    {
      icon: <Users className="h-6 w-6 text-gold" />,
      title: "Set Your Circle",
      description: "Designate beneficiaries and optional guardians to verify the release."
    },
    {
      icon: <Clock className="h-6 w-6 text-gold" />,
      title: "Automated Check-in",
      description: "System monitors your activity via email, SMS, and on-chain signals."
    },
    {
      icon: <Send className="h-6 w-6 text-gold" />,
      title: "Safe Release",
      description: "If you stop responding, your vault is released securely to your heirs."
    }
  ];

  return (
    <section className="py-24 bg-black relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-20">
          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-gold mb-4 block">The ChainLegacy Flow</span>
          <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight">How It <span className="text-gold italic">Works</span></h2>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 relative">
          {/* Connector line for desktop */}
          <div className="hidden md:block absolute top-12 left-[10%] right-[10%] h-px bg-gradient-to-r from-transparent via-gold/30 to-transparent -z-10" />
          
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className="text-center px-4"
            >
              <div className="h-16 w-16 bg-gold/10 rounded-3xl flex items-center justify-center mx-auto mb-8 border border-gold/20 relative group-hover:scale-110 transition-transform">
                <div className="absolute -top-3 -right-3 h-8 w-8 bg-black border border-gold/50 rounded-full flex items-center justify-center text-[10px] font-black text-gold">
                  0{index + 1}
                </div>
                {step.icon}
              </div>
              <h3 className="text-xl font-bold text-white mb-4 uppercase tracking-tight">{step.title}</h3>
              <p className="text-gray-500 text-sm leading-relaxed max-w-[200px] mx-auto">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
