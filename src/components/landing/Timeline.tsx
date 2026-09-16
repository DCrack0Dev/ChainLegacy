'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Smartphone, Key, Lock } from 'lucide-react';

export function Timeline() {
  const steps = [
    {
      day: "Day 0",
      icon: <Mail className="h-5 w-5 text-gold" />,
      title: "First Check-in",
      description: "Automated email check-in. Just click the link to confirm you're safe."
    },
    {
      day: "Day 7",
      icon: <Smartphone className="h-5 w-5 text-gold" />,
      title: "SMS Escalation",
      description: "SMS alert sent to your primary device for immediate confirmation."
    },
    {
      day: "Day 14",
      icon: <Key className="h-5 w-5 text-gold" />,
      title: "Passkey Verification",
      description: "Biometric authentication required via your linked hardware device."
    },
    {
      day: "Day 45",
      icon: <Lock className="h-5 w-5 text-gold" />,
      title: "Vault Release",
      description: "Heirs notified. Consensus required to decrypt the inheritance."
    }
  ];

  return (
    <section className="py-24 bg-black overflow-hidden border-t border-white/5 relative">
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-20">
          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-gold mb-4 block">Liveness Protocol</span>
          <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight">The <span className="text-gold italic">Countdown</span></h2>
        </div>
        
        <div className="max-w-4xl mx-auto relative px-10">
          {/* Main timeline line */}
          <div className="absolute top-0 bottom-0 left-[2rem] w-px bg-gradient-to-b from-transparent via-gold/30 to-transparent" />
          
          <div className="space-y-16">
            {steps.map((step, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
                className="flex items-start gap-12 group"
              >
                <div className="relative shrink-0 mt-2">
                  <div className="h-10 w-10 bg-black border border-gold/50 rounded-full flex items-center justify-center text-gold relative z-10 group-hover:bg-gold group-hover:text-black transition-all">
                    {step.icon}
                  </div>
                  {/* Pulse effect */}
                  <div className="absolute inset-0 bg-gold/20 rounded-full animate-ping -z-10 group-hover:animate-none opacity-50" />
                </div>
                
                <div>
                  <span className="text-[10px] font-black uppercase tracking-[0.3em] text-gold mb-2 block">{step.day}</span>
                  <h3 className="text-2xl font-bold text-white mb-4 uppercase tracking-tight">{step.title}</h3>
                  <p className="text-gray-500 text-sm leading-relaxed max-w-lg">
                    {step.description}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
