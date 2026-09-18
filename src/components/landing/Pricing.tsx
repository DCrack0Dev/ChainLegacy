'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check, Star, Zap, Shield, Crown, Building2, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export function Pricing() {
  const tiers = [
    {
      name: "Free",
      price: "$0",
      description: "Basic protection for beginners.",
      features: [
        "1 Beneficiary",
        "Email Liveness Check",
        "Text Message Storage",
        "7-Day Trigger Window",
        "AES-256-GCM Security"
      ],
      icon: <Zap className="h-6 w-6" />,
      cta: "Secure My Legacy",
      popular: false
    },
    {
      name: "Pro",
      price: "$9.99",
      description: "Advanced vault management.",
      features: [
        "3 Beneficiaries",
        "SMS + Email Checks",
        "Shamir Secret Sharing",
        "24-Hour Delay Protection",
        "Priority Claim Processing"
      ],
      icon: <Shield className="h-6 w-6 text-gold" />,
      cta: "Upgrade to Pro",
      popular: false
    },
    {
      name: "Premium",
      price: "$24.99",
      description: "Full inheritance suite.",
      features: [
        "Unlimited Beneficiaries",
        "Guardian Network",
        "Video Message Vaults",
        "WebAuthn / Passkeys",
        "AI Liveness Monitoring",
        "Decentralized Storage"
      ],
      icon: <Star className="h-6 w-6 text-gold" />,
      cta: "Get Premium",
      popular: true
    },
    {
      name: "Legacy Elite",
      price: "$99.99",
      description: "Enterprise-grade estate planning.",
      features: [
        "Everything in Premium",
        "Concierge Setup Call",
        "Custom Legal Disclaimer",
        "Dedicated Account Manager",
        "24/7 Priority Support",
        "White-Glove Integration"
      ],
      icon: <Crown className="h-6 w-6 text-gold" />,
      cta: "Go Elite",
      popular: false
    }
  ];

  const enterpriseFeatures = [
    "Unlimited customers, vaults & legacy plans",
    "Full enterprise console (customers, plans, beneficiaries, guardians, claims)",
    "Identity verification & server-owned claim authorization",
    "API keys with 17 granular scopes (sandbox + production)",
    "HMAC-SHA256 signed webhooks with retry logic",
    "Organization-scoped audit trail with CSV/JSON export",
    "Liveness monitoring with suspicion scoring",
    "Guardian quorum workflows (M-of-N approvals)",
    "Tenant isolation enforced at Firestore + API layer",
    "SHA-256 hashed API keys (clsbox_ / clprod_ prefixes)",
  ];

  return (
    <section className="py-24 bg-black relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-20">
          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-gold mb-4 block">Protection Plans</span>
          <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight">Choose Your <span className="text-gold italic">Legacy</span></h2>
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mt-6">
            Secure your digital future with a plan that fits your wealth and complexity.
          </p>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-16">
          {tiers.map((tier, index) => (
            <motion.div
              key={index}
              whileHover={{ y: -10 }}
              className={cn(
                "p-10 rounded-[3rem] border flex flex-col transition-all relative",
                tier.popular ? "bg-gold/5 border-gold/50 shadow-[0_0_40px_rgba(212,175,55,0.1)]" : "bg-white/[0.02] border-white/10"
              )}
            >
              {tier.popular && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1.5 bg-gold text-black text-[10px] font-black uppercase tracking-widest rounded-full">
                  Most Popular
                </div>
              )}
              
              <div className="mb-10 flex items-center justify-between">
                <div className="h-12 w-12 bg-gold/10 rounded-2xl flex items-center justify-center">
                  {tier.icon}
                </div>
                <div className="text-right">
                  <span className="text-3xl font-black text-white">{tier.price}</span>
                  <span className="text-gray-500 text-xs block">per month</span>
                </div>
              </div>
              
              <h3 className="text-2xl font-bold text-white mb-4 uppercase tracking-tight">{tier.name}</h3>
              <p className="text-gray-500 text-xs mb-10 leading-relaxed">{tier.description}</p>
              
              <div className="space-y-4 mb-12 flex-1">
                {tier.features.map((feature, fIndex) => (
                  <div key={fIndex} className="flex items-center space-x-3">
                    <Check className="h-4 w-4 text-gold shrink-0" />
                    <span className="text-gray-400 text-xs">{feature}</span>
                  </div>
                ))}
              </div>
              
              <Link href="/register">
                <Button 
                  variant={tier.popular ? "default" : "outline"}
                  className={cn(
                    "w-full uppercase tracking-widest font-black h-14",
                    tier.popular ? "bg-gold hover:bg-gold-dark text-black" : "border-white/10 hover:bg-white/5"
                  )}
                >
                  {tier.cta}
                </Button>
              </Link>
            </motion.div>
          ))}
        </div>

        {/* Enterprise Tier */}
        <div className="rounded-[3rem] border border-gold/30 bg-gold/[0.03] p-8 md:p-12 space-y-8">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-6 text-xs font-black tracking-[0.2em] uppercase bg-gold/10 text-gold rounded-full border border-gold/20">
              <Building2 className="h-3.5 w-3.5" />
              Enterprise
            </div>
            <h3 className="text-3xl md:text-4xl font-black text-white mb-4 uppercase tracking-tight">
              For Organizations
            </h3>
            <p className="text-gray-400 text-lg max-w-2xl mx-auto">
              Manage digital legacy services for your customers. Volume pricing, custom contracts, and dedicated infrastructure available.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {enterpriseFeatures.map((feature, i) => (
              <div key={i} className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.02] border border-white/5">
                <Check className="h-4 w-4 text-gold shrink-0 mt-0.5" />
                <span className="text-sm text-gray-300">{feature}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link href="/enterprise/onboard">
              <Button size="xl" className="w-full sm:w-auto bg-gold hover:bg-gold-dark text-black font-black shadow-[0_0_40px_rgba(212,175,55,0.3)] uppercase tracking-widest h-14 px-10">
                Start Enterprise Trial
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
            <Link href="/enterprise">
              <Button variant="outline" size="xl" className="w-full sm:w-auto border-white/10 text-white hover:bg-white/5 uppercase tracking-widest font-black h-14 px-10">
                Explore Enterprise
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}