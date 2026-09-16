import React from 'react';
import { Navbar } from '@/components/ui/Navbar';
import { ShieldCheck, Zap, XCircle, Users, Lock, Eye } from 'lucide-react';
import { motion } from 'framer-motion';

export default function TrustGuide() {
  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-gold selection:text-black">
      <Navbar />
      
      <main className="max-w-4xl mx-auto px-4 pt-32 pb-20 space-y-20">
        {/* Header */}
        <div className="text-center space-y-6">
          <h1 className="text-5xl font-extrabold uppercase tracking-tighter">Can I trust <span className="text-gold">ChainLegacy</span>?</h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto font-medium">
            Everything you need to know about how we protect your legacy without ever seeing your secrets.
          </p>
        </div>

        {/* 3 Core Questions */}
        <div className="grid grid-cols-1 gap-8">
          <TrustSection 
            icon={<Zap className="h-8 w-8 text-gold" />}
            title="1. What triggers inheritance?"
            description="Inheritance is only triggered by a prolonged absence of activity signals. We monitor multiple channels to ensure we don't act prematurely."
            bullets={[
              "Manual Dashboard check-ins (I'm Alive button)",
              "App logins and usage",
              "Email and SMS confirmation clicks",
              "On-chain wallet activity (transactions you make elsewhere)"
            ]}
          />

          <TrustSection 
            icon={<XCircle className="h-8 w-8 text-red-500" />}
            title="2. How do I stop a trigger?"
            description="You are always in control. If the system starts the escalation process, you have multiple weeks to stop it."
            bullets={[
              "Click the 'Reset Timer' link in any warning email/SMS",
              "Log in to your dashboard at any time",
              "During the 'Grace Period', the trigger is active but reversible",
              "Even after a claim starts, trusted contacts can pause the process"
            ]}
          />

          <TrustSection 
            icon={<Users className="h-8 w-8 text-blue-500" />}
            title="3. Who can access my vault?"
            description="Only the beneficiaries you designate can access the vault, and only after passing 5 levels of verification."
            bullets={[
              "Level 1: Identity Matching (Name, Email, Phone)",
              "Level 2: Wallet Signature (Proof of ownership)",
              "Level 3: Security Phrase (Known only to you and them)",
              "Level 4: Multi-factor OTP (6-digit code)",
              "Level 5: Consensus (M-of-N beneficiaries must agree)"
            ]}
          />
        </div>

        {/* Security Invariants */}
        <div className="bg-card-bg border border-card-border rounded-[3rem] p-12 space-y-8">
          <div className="flex items-center gap-4">
            <Lock className="h-10 w-10 text-gold" />
            <h2 className="text-3xl font-bold uppercase tracking-tight text-white">Our Zero-Knowledge Promise</h2>
          </div>
          <p className="text-gray-400 text-lg leading-relaxed">
            We use **End-to-End Encryption**. This means your private keys and messages are turned into unreadable code *inside your browser* before they are sent to our servers.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <Eye className="h-5 w-5 text-gold mb-2" />
              <p className="text-sm font-bold text-white uppercase">We can't see it</p>
              <p className="text-xs text-gray-500">ChainLegacy staff cannot read your secrets, even with physical access to the database.</p>
            </div>
            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
              <ShieldCheck className="h-5 w-5 text-gold mb-2" />
              <p className="text-sm font-bold text-white uppercase">You hold the key</p>
              <p className="text-xs text-gray-500">Your master password is the only thing that can unlock the vault. If you lose it, we cannot recover it.</p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function TrustSection({ icon, title, description, bullets }: { icon: any, title: string, description: string, bullets: string[] }) {
  return (
    <div className="p-10 rounded-[2.5rem] bg-white/[0.02] border border-white/5 space-y-6">
      <div className="h-16 w-16 rounded-2xl bg-white/5 flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="text-2xl font-bold text-white uppercase tracking-tight">{title}</h3>
      <p className="text-gray-400 font-medium leading-relaxed">{description}</p>
      <ul className="space-y-3 pt-2">
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-3 text-sm text-gray-500 font-medium">
            <div className="h-1.5 w-1.5 rounded-full bg-gold mt-1.5 shrink-0" />
            {b}
          </li>
        ))}
      </ul>
    </div>
  );
}
