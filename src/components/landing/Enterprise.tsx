'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Building2, Users, FileCheck2, ShieldCheck, Fingerprint, KeyRound, Webhook, Scroll, Sparkles, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';

const ENTERPRISE_CAPABILITIES = [
  {
    icon: Users,
    title: 'Customer Management',
    body: 'Onboard and manage the customers your organization serves — each with their own vault and legacy plan.',
  },
  {
    icon: FileCheck2,
    title: 'Legacy Plans',
    body: 'Define inheritance intervals, guardian quorum, and release conditions for every customer.',
  },
  {
    icon: ShieldCheck,
    title: 'Guardians & Beneficiaries',
    body: 'Assign beneficiaries and guardian quorum workflows without becoming a custodian of keys.',
  },
  {
    icon: Fingerprint,
    title: 'Identity Verification',
    body: 'Server-owned verification status for claimants — the browser never decides who is verified.',
  },
  {
    icon: KeyRound,
    title: 'API Keys & Scopes',
    body: 'Issue sandbox and production keys with fine-grained scopes for partner integrations.',
  },
  {
    icon: Webhook,
    title: 'Webhooks',
    body: 'Receive signed events for customers, plans, claims, and organization changes.',
  },
  {
    icon: Scroll,
    title: 'Audit Trail',
    body: 'Inspect organization-scoped audit events for security, compliance, and operational review.',
  },
  {
    icon: Sparkles,
    title: 'Liveness Monitoring',
    body: 'Monitor check-in cadence, escalation status, and suspicion scores across all legacy plans.',
  },
];

export function EnterpriseLanding() {
  return (
    <section className="py-24 bg-black relative border-y border-white/5" id="enterprise">
      <div className="container mx-auto px-6 relative z-10">
        <div className="text-center mb-20 max-w-3xl mx-auto">
          <span className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 text-xs font-black tracking-[0.2em] uppercase bg-gold/10 text-gold rounded-full border border-gold/20">
            <Building2 className="h-3.5 w-3.5" />
            For Businesses & Institutions
          </span>
          <h2 className="text-3xl md:text-5xl font-black text-white mb-6 uppercase tracking-tight">
            Enterprise legacy <span className="text-gold italic">infrastructure</span>
          </h2>
          <p className="text-xl md:text-2xl text-gray-400 mb-6 max-w-2xl mx-auto leading-relaxed">
            Manage digital legacy services for your customers through ChainLegacy — without becoming a custodian of private keys.
          </p>
          <p className="text-sm text-gray-500 mb-12 max-w-xl mx-auto">
            An organization is not a customer. Your team operates customers, vaults, legacy plans, guardians, claims, APIs, and audit from one secure console.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link href="/enterprise/onboard" className="w-full sm:w-auto">
              <Button
                size="xl"
                className="w-full bg-gold hover:bg-gold-dark text-black font-black shadow-[0_0_40px_rgba(212,175,55,0.3)] uppercase tracking-widest h-16 px-10"
              >
                Create Organization
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/register?intent=personal" className="w-full sm:w-auto">
              <Button
                variant="outline"
                size="xl"
                className="w-full border-white/10 text-white hover:bg-white/5 uppercase tracking-widest font-black h-16 px-10"
              >
                Looking for Personal?
              </Button>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {ENTERPRISE_CAPABILITIES.map((cap, i) => {
            const Icon = cap.icon;
            return (
              <motion.div
                key={cap.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.05 }}
                className="rounded-[2rem] border border-white/10 bg-white/[0.02] p-6 space-y-4"
              >
                <div className="h-11 w-11 rounded-2xl bg-gold/10 border border-gold/20 grid place-items-center">
                  <Icon className="h-5 w-5 text-gold" />
                </div>
                <h3 className="text-sm font-black uppercase tracking-wider text-white">{cap.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{cap.body}</p>
              </motion.div>
            );
          })}
        </div>

        <div className="rounded-[3rem] border border-gold/30 bg-gold/[0.03] p-8 md:p-12 space-y-8">
          <div className="text-center">
            <h3 className="text-3xl md:text-5xl font-black uppercase tracking-tight text-white mb-4">
              Create an organization — not a customer account
            </h3>
            <p className="text-gray-400 text-lg leading-relaxed max-w-2xl mx-auto">
              Enterprise onboarding creates an Organization you own. From there you manage customers under that organization. Your personal ChainLegacy vault (if you have one) stays separate.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/enterprise/onboard">
              <Button className="bg-gold hover:bg-gold-dark text-black font-black uppercase tracking-widest h-14 px-10">
                Get Started with Enterprise
              </Button>
            </Link>
            <Link href="/how-it-works">
              <Button variant="outline" className="border-white/10 text-white uppercase tracking-widest font-black h-14 px-10">
                How Individual Works
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}