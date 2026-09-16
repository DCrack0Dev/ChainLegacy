'use client';

import React from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Navbar } from '@/components/ui/Navbar';
import { Button } from '@/components/ui/Button';
import { 
  Shield, Lock, Users, Clock, Send, CheckCircle2, 
  Wallet, ShieldCheck, AlertTriangle, ChevronRight,
  Database, Activity, LockIcon
} from 'lucide-react';
import { cn } from '@/lib/utils';

const steps = [
  {
    title: "Secure Your Vault",
    description: "Add your sensitive information like private keys or final messages. Everything is encrypted locally using AES-256 before it ever leaves your device.",
    icon: <Lock className="h-6 w-6" />,
    color: "gold"
  },
  {
    title: "Assign Your Beneficiary",
    description: "Designate who will receive your vault. Provide their name, email, and optionally their wallet address for cryptographic verification.",
    icon: <Users className="h-6 w-6" />,
    color: "gold"
  },
  {
    title: "Smart Monitoring",
    description: "ChainLegacy monitors your check-in activity. If you miss your scheduled interval, the system triggers a series of secure warnings and a grace period.",
    icon: <Activity className="h-6 w-6" />,
    color: "gold"
  },
  {
    title: "Secure Release",
    description: "Once triggered, beneficiaries must pass a multi-step identity verification including OTP and wallet signatures before the vault is decrypted.",
    icon: <ShieldCheck className="h-6 w-6" />,
    color: "gold"
  }
];

const securityCards = [
  {
    title: "End-to-End Encryption",
    description: "Data is encrypted using AES-256 military-grade protocols before being stored, ensuring even we can't see your secrets.",
    icon: <LockIcon className="h-8 w-8 text-gold" />
  },
  {
    title: "Non-Custodial",
    description: "ChainLegacy never holds your crypto or private keys in plain text. You remain in control of your digital estate.",
    icon: <Shield className="h-8 w-8 text-gold" />
  },
  {
    title: "Verified Ownership",
    description: "Optional wallet signature verification ensures only the rightful owner of a specific address can claim the legacy.",
    icon: <Wallet className="h-8 w-8 text-gold" />
  },
  {
    title: "Failsafe System",
    description: "Multi-stage automated warnings, grace periods, and manual approvals provide a robust safety net against accidental triggers.",
    icon: <AlertTriangle className="h-8 w-8 text-gold" />
  }
];

const faqs = [
  {
    q: "Can ChainLegacy access my crypto?",
    a: "No. We never hold your funds or plain-text private keys. We only provide the secure, zero-knowledge transport layer for your information."
  },
  {
    q: "What happens if I come back after a trigger?",
    a: "You can cancel the release process anytime during the warning or grace period phases by simply checking in to your dashboard."
  },
  {
    q: "Can someone fake a claim?",
    a: "No. Our multi-layer verification requires identity matching, an OTP, a secret phrase, and optional wallet signature verification."
  }
];

export default function HowItWorks() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-gold selection:text-black">
      <Navbar />
      
      {/* Hero Section */}
      <section className="relative pt-32 pb-20 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(212,175,55,0.05),transparent_70%)]" />
        <div className="mx-auto max-w-7xl px-4 text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full border border-gold/20 bg-gold/5 backdrop-blur-sm">
              <span className="text-[10px] font-bold uppercase tracking-[0.3em] text-gold">Built for the Future</span>
            </div>
            <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight uppercase max-w-4xl mx-auto">
              Your Crypto. <span className="text-gold">Protected</span> Beyond Your Lifetime.
            </h1>
            <p className="text-xl text-gray-400 max-w-2xl mx-auto font-medium">
              ChainLegacy ensures your digital assets are securely passed on — only to the right person, at the right time.
            </p>
            <div className="pt-8">
              <Link href="/register">
                <Button className="bg-gold hover:bg-gold-dark text-black font-extrabold px-10 py-7 rounded-2xl shadow-2xl shadow-gold/20 transition-all hover:scale-105 active:scale-95 uppercase tracking-widest text-sm">
                  Get Started Securely
                </Button>
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Steps Section */}
      <section className="py-24 border-y border-white/5 bg-white/[0.01]">
        <div className="mx-auto max-w-7xl px-4">
          <div className="text-center mb-20 space-y-4">
            <h2 className="text-3xl font-extrabold uppercase tracking-tight">The Inheritance Flow</h2>
            <div className="h-1 w-20 bg-gold mx-auto rounded-full" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="group relative p-8 rounded-[2.5rem] bg-card-bg border border-white/5 hover:border-gold/20 transition-all duration-500"
              >
                <div className="absolute -top-4 -left-4 h-12 w-12 rounded-2xl bg-gold flex items-center justify-center text-black font-bold shadow-xl shadow-gold/20 z-20">
                  {i + 1}
                </div>
                <div className="h-14 w-14 rounded-2xl bg-gold/10 flex items-center justify-center mb-6 text-gold group-hover:scale-110 transition-transform duration-500">
                  {step.icon}
                </div>
                <h3 className="text-xl font-bold mb-4 text-white uppercase tracking-tight">{step.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed font-medium">
                  {step.description}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Security Breakdown */}
      <section className="py-24 relative overflow-hidden">
        <div className="mx-auto max-w-7xl px-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-8">
              <h2 className="text-4xl font-extrabold uppercase tracking-tighter leading-tight">
                Military-Grade <span className="text-gold">Security</span> For Your Peace Of Mind.
              </h2>
              <p className="text-lg text-gray-400 font-medium leading-relaxed">
                We've built ChainLegacy from the ground up with a zero-trust architecture. We don't just secure your data; we make it impossible for even us to access it.
              </p>
              <div className="flex flex-wrap gap-4 pt-4">
                <div className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                  <CheckCircle2 className="h-4 w-4 text-gold" />
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-300">AES-256</span>
                </div>
                <div className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                  <CheckCircle2 className="h-4 w-4 text-gold" />
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-300">Non-Custodial</span>
                </div>
                <div className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-white/5 border border-white/10">
                  <CheckCircle2 className="h-4 w-4 text-gold" />
                  <span className="text-xs font-bold uppercase tracking-widest text-gray-300">Audit Logs</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {securityCards.map((card, i) => (
                <div key={i} className="p-6 rounded-3xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all">
                  <div className="mb-4">{card.icon}</div>
                  <h4 className="text-lg font-bold mb-2 text-white uppercase tracking-tight">{card.title}</h4>
                  <p className="text-xs text-gray-500 leading-relaxed">{card.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* What Makes Us Different */}
      <section className="py-24 bg-gold/5 border-y border-gold/10">
        <div className="mx-auto max-w-7xl px-4 text-center">
          <h2 className="text-3xl font-extrabold uppercase tracking-tight mb-16">What Makes Us Different</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12">
            <div className="space-y-4">
              <h4 className="text-lg font-bold text-gold uppercase tracking-widest">No Exchanges</h4>
              <p className="text-sm text-gray-400">Keep your assets off exchanges while ensuring they aren't lost forever.</p>
            </div>
            <div className="space-y-4">
              <h4 className="text-lg font-bold text-gold uppercase tracking-widest">Zero Custody</h4>
              <p className="text-sm text-gray-400">We never hold your funds. You keep your private keys, we handle the legacy.</p>
            </div>
            <div className="space-y-4">
              <h4 className="text-lg font-bold text-gold uppercase tracking-widest">Real-World Ready</h4>
              <p className="text-sm text-gray-400">Built for actual scenarios like forgotten passwords or sudden absence.</p>
            </div>
            <div className="space-y-4">
              <h4 className="text-lg font-bold text-gold uppercase tracking-widest">Long-Term Trust</h4>
              <p className="text-sm text-gray-400">Designed for durability, ensuring your plan stays active for decades.</p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24">
        <div className="mx-auto max-w-3xl px-4">
          <h2 className="text-3xl font-extrabold uppercase tracking-tight text-center mb-16">Frequently Asked Questions</h2>
          <div className="space-y-6">
            {faqs.map((faq, i) => (
              <div key={i} className="p-8 rounded-[2rem] bg-card-bg border border-white/5">
                <h4 className="text-lg font-bold mb-4 text-white">{faq.q}</h4>
                <p className="text-gray-400 leading-relaxed">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-24 text-center">
        <div className="mx-auto max-w-4xl px-4 py-20 rounded-[3rem] bg-gradient-to-b from-gold/10 to-transparent border border-gold/10">
          <h2 className="text-4xl font-extrabold uppercase tracking-tight mb-6">Start Your Legacy Plan Today</h2>
          <p className="text-gray-400 mb-10 max-w-xl mx-auto">
            It takes less than 5 minutes to secure your digital assets for the next generation.
          </p>
          <Link href="/register">
            <Button className="bg-gold hover:bg-gold-dark text-black font-extrabold px-12 py-8 rounded-2xl uppercase tracking-widest text-sm shadow-xl shadow-gold/20">
              Create My Vault <ChevronRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      <footer className="py-12 border-t border-white/5 text-center text-gray-600 text-[10px] uppercase tracking-[0.3em]">
        © {new Date().getFullYear()} ChainLegacy. Secure Non-Custodial Inheritance.
      </footer>
    </div>
  );
}
