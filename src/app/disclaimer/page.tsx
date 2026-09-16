import React from 'react';
import Link from 'next/link';
import { Shield, AlertTriangle, Scale } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';

export default function DisclaimerPage() {
  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <main className="container mx-auto px-6 py-24">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <div className="mx-auto h-16 w-16 bg-gold/10 rounded-full flex items-center justify-center mb-6">
              <Scale className="h-8 w-8 text-gold" />
            </div>
            <h1 className="text-4xl font-black text-white uppercase tracking-tight">Legal Disclaimer</h1>
            <p className="text-gray-400">Last Updated: March 29, 2026</p>
          </div>

          <section className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-10 space-y-8">
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-gold" />
                1. No Financial Advice
              </h2>
              <p className="text-gray-400 leading-relaxed">
                The information provided on ChainLegacy is for technical purposes only and does not constitute financial, legal, or estate planning advice. Consult with a qualified professional for your specific situation. 
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-gold" />
                2. Use at Your Own Risk
              </h2>
              <p className="text-gray-400 leading-relaxed">
                ChainLegacy is a tool designed to facilitate the transmission of encrypted information. You assume all risks associated with the use of this service, including the potential loss of access to your data if you forget your master password.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white">3. Limitation of Liability</h2>
              <p className="text-gray-400 leading-relaxed">
                In no event shall ChainLegacy or its founders be liable for any direct, indirect, incidental, or consequential damages arising from the use or inability to use our service. 
              </p>
            </div>

            <div className="pt-8 border-t border-white/5">
              <p className="text-sm text-gray-500 text-center italic">
                By using ChainLegacy, you acknowledge and agree to this legal disclaimer.
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
