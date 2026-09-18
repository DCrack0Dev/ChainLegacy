'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Check, Star, Zap, Shield, Crown, Building2, ArrowRight, MessageSquare, Phone, Mail } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { RangeSelectorCard } from '@/components/pricing/RangeSelector';
import { getAllPricingOptions, calculatePricing, type PricingRangeId } from '@/lib/pricing';
import { useState } from 'react';

const SALES_CONTACTS = {
  email: 'demitechwebservices@gmail.com',
  whatsapp: '+27650241517',
  phone: '+27650241517',
  whatsappUrl: 'https://wa.me/27650241517',
  phoneUrl: 'tel:+27650241517',
  emailUrl: 'mailto:demitechwebservices@gmail.com',
};

const personalFeatures = [
  "AES-256-GCM Encryption",
  "Zero-Knowledge Architecture",
  "Argo2id Key Derivation",
  "Shamir Secret Sharing (Premium)",
  "Guardian Network (Pro+)",
  "24-Hour Anti-Takeover Delay",
  "WebAuthn / Passkeys (Premium)",
  "Video Message Vaults (Premium)",
  "Decentralized Storage (Premium)",
  "AI Liveness Monitoring (Premium)",
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

export function Pricing() {
  const [selectedRange, setSelectedRange] = useState<{ rangeId: string; pricing: any } | null>(null);

  const handleRangeSelect = (rangeId: string, pricing: any) => {
    setSelectedRange({ rangeId, pricing });
  };

  const options = getAllPricingOptions();

  return (
    <section className="py-24 bg-black relative">
      <div className="container mx-auto px-6">
        <div className="text-center mb-20">
          <span className="text-[10px] font-black uppercase tracking-[0.5em] text-gold mb-4 block">Protection Plans</span>
          <h2 className="text-3xl md:text-5xl font-black text-white uppercase tracking-tight">Choose Your <span className="text-gold italic">Legacy</span></h2>
          <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto mt-6">
            Secure your digital future. Select the approximate value range of what you want to protect.
          </p>
        </div>

        {/* Personal Plans with Range Selection */}
        <div className="mb-16">
          <h3 className="text-2xl md:text-3xl font-black text-white mb-8 text-center uppercase tracking-tight">
            Personal Protection
          </h3>
          <p className="text-gray-500 text-center mb-10 max-w-2xl mx-auto">
            You don't need to provide an exact amount. Just select the range that covers your assets.
          </p>

          <RangeSelectorCard
            title="What are you protecting?"
            subtitle="Select the approximate value range. You don't need to provide an exact amount."
            onSelect={handleRangeSelect}
          />

          {selectedRange && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-10 p-8 rounded-3xl bg-gold/5 border border-gold/20 text-center"
            >
              <h3 className="text-xl font-black text-white mb-4">
                Your Plan Price
              </h3>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-8 mb-6">
                <div className="flex flex-col items-center">
                  <p className="text-[10px] font-black text-gold uppercase tracking-widest">Lifetime Access</p>
                  <p className="text-4xl font-black text-white">${selectedRange.pricing.lifetimeFee.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">3% of ${selectedRange.pricing.pricingBasis.toLocaleString()}</p>
                </div>
                <div className="flex flex-col items-center">
                  <p className="text-[10px] font-black text-gold uppercase tracking-widest">Monthly</p>
                  <p className="text-4xl font-black text-white">${selectedRange.pricing.monthlyFee.toLocaleString()}/mo</p>
                  <p className="text-xs text-gray-500">10% of lifetime fee</p>
                </div>
              </div>
              <Link href="/register">
                <Button size="xl" className="w-full sm:w-auto bg-gold hover:bg-gold-dark text-black font-black shadow-[0_0_40px_rgba(212,175,55,0.3)] uppercase tracking-widest h-14 px-10">
                  Secure My Legacy
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </Link>
            </motion.div>
          )}
        </div>

        {/* Enterprise - No Public Pricing, Talk to Sales */}
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

          {/* Talk to Sales Section */}
          <div className="pt-8 border-t border-gold/20">
            <h4 className="text-xl font-black text-white text-center mb-6 uppercase tracking-tight">
              Need Custom Pricing?
            </h4>
            <p className="text-gray-500 text-center mb-8 max-w-xl mx-auto">
              Get a custom quote based on your organization's protected value range and requirements.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href={SALES_CONTACTS.emailUrl}>
                <Button variant="outline" className="w-full sm:w-auto border-gold/30 text-gold hover:bg-gold/10 uppercase tracking-widest font-black h-14 px-10">
                  <Mail className="mr-2 h-4 w-4" />
                  Email Sales
                </Button>
              </a>
              <a href={SALES_CONTACTS.whatsappUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full sm:w-auto border-green-500/30 text-green-400 hover:bg-green-500/10 uppercase tracking-widest font-black h-14 px-10">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  WhatsApp Sales
                </Button>
              </a>
              <a href={SALES_CONTACTS.phoneUrl}>
                <Button variant="outline" className="w-full sm:w-auto border-blue-500/30 text-blue-400 hover:bg-blue-500/10 uppercase tracking-widest font-black h-14 px-10">
                  <Phone className="mr-2 h-4 w-4" />
                  Call Sales
                </Button>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}