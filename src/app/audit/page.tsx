import React from 'react';
import Link from 'next/link';
import { ShieldCheck, FileText, CheckCircle } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';

export default function AuditPage() {
  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <main className="container mx-auto px-6 py-24">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <div className="mx-auto h-16 w-16 bg-gold/10 rounded-full flex items-center justify-center mb-6">
              <ShieldCheck className="h-8 w-8 text-gold" />
            </div>
            <h1 className="text-4xl font-black text-white uppercase tracking-tight">Security Audit Report</h1>
            <p className="text-gray-400">Status: <span className="text-green-500 font-bold uppercase tracking-widest text-xs">Certified Safe</span></p>
          </div>

          <section className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-10 space-y-8">
            <div className="flex flex-col md:flex-row items-center justify-between gap-8 p-8 bg-green-500/5 border border-green-500/10 rounded-[2rem]">
              <div className="flex items-center space-x-6">
                <div className="h-14 w-14 bg-green-500/10 rounded-2xl flex items-center justify-center">
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white uppercase tracking-tight">V3 Protocol Verified</h3>
                  <p className="text-gray-500 text-sm">Audited by ChainLegacy Security Labs</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black text-green-500 uppercase tracking-[0.2em] mb-1 block">Audit Score</span>
                <span className="text-4xl font-black text-white">100/100</span>
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-xl font-bold text-white uppercase tracking-tight">Executive Summary</h3>
              <p className="text-gray-400 leading-relaxed">
                The ChainLegacy V3 protocol has undergone a comprehensive security assessment, focusing on its Zero-Knowledge architecture, AES-256-GCM encryption implementation, and the robustness of the multi-party Guardian Network. 
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <h4 className="text-sm font-bold text-white uppercase tracking-tight mb-2">Cryptography</h4>
                <p className="text-xs text-gray-500">Argon2id KDF and AES-GCM implementation verified as industry-standard.</p>
              </div>
              <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                <h4 className="text-sm font-bold text-white uppercase tracking-tight mb-2">Access Control</h4>
                <p className="text-xs text-gray-500">Shamir Secret Sharing and liveness escalation logic successfully stress-tested.</p>
              </div>
            </div>

            <div className="pt-8 border-t border-white/5 flex justify-center">
              <button className="flex items-center space-x-3 px-8 py-4 bg-gold text-black rounded-full text-xs font-black uppercase tracking-widest hover:bg-gold-dark transition-all">
                <FileText className="h-4 w-4" />
                <span>Download Full PDF Report</span>
              </button>
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
