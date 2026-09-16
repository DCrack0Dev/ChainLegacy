import React from 'react';
import Link from 'next/link';
import { Shield, Eye, Lock } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <main className="container mx-auto px-6 py-24">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <div className="mx-auto h-16 w-16 bg-gold/10 rounded-full flex items-center justify-center mb-6">
              <Eye className="h-8 w-8 text-gold" />
            </div>
            <h1 className="text-4xl font-black text-white uppercase tracking-tight">Privacy Policy</h1>
            <p className="text-gray-400">Last Updated: March 29, 2026</p>
          </div>

          <section className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-10 space-y-8">
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-gold" />
                1. Information We Collect
              </h2>
              <p className="text-gray-400 leading-relaxed">
                We collect minimal personal data necessary to operate our service. This includes your email address, phone number (if SMS notifications are enabled), and public wallet addresses. 
              </p>
              <div className="p-4 bg-gold/5 border border-gold/10 rounded-xl">
                <p className="text-gold text-sm font-medium">
                  Note: We NEVER collect or store your plaintext private keys, seed phrases, or vault secrets.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Lock className="h-5 w-5 text-gold" />
                2. Data Encryption
              </h2>
              <p className="text-gray-400 leading-relaxed">
                All sensitive information is encrypted client-side using your master password before being transmitted to our servers. We use industry-standard AES-256-GCM encryption. 
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white">3. How We Use Your Data</h2>
              <p className="text-gray-400 leading-relaxed">
                Your data is used solely for the purpose of maintaining your legacy vault and executing the liveness protocol. We do not sell your personal information to third parties.
              </p>
            </div>

            <div className="pt-8 border-t border-white/5">
              <p className="text-sm text-gray-500 text-center italic">
                Your privacy and security are our top priorities.
              </p>
            </div>
          </section>

          <div className="text-center">
            <Link href="/" className="text-gold hover:underline font-black uppercase tracking-widest text-xs">
              Back to Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
