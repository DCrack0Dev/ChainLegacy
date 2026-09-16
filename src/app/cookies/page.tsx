import React from 'react';
import Link from 'next/link';
import { Shield, Cookie, HelpCircle } from 'lucide-react';
import { Navbar } from '@/components/ui/Navbar';

export default function CookiesPage() {
  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <main className="container mx-auto px-6 py-24">
        <div className="max-w-4xl mx-auto space-y-12">
          <div className="text-center space-y-4">
            <div className="mx-auto h-16 w-16 bg-gold/10 rounded-full flex items-center justify-center mb-6">
              <Cookie className="h-8 w-8 text-gold" />
            </div>
            <h1 className="text-4xl font-black text-white uppercase tracking-tight">Cookie Policy</h1>
            <p className="text-gray-400">Last Updated: March 29, 2026</p>
          </div>

          <section className="bg-white/[0.02] border border-white/5 rounded-[2rem] p-10 space-y-8">
            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Shield className="h-5 w-5 text-gold" />
                1. What are Cookies?
              </h2>
              <p className="text-gray-400 leading-relaxed">
                Cookies are small text files stored on your device that help us provide a secure and functional experience. 
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-gold" />
                2. How We Use Cookies
              </h2>
              <p className="text-gray-400 leading-relaxed">
                We use cookies primarily for session management and authentication. These cookies are essential for maintaining your secure login state while using the ChainLegacy platform.
              </p>
            </div>

            <div className="space-y-4">
              <h2 className="text-xl font-bold text-white">3. Third-Party Cookies</h2>
              <p className="text-gray-400 leading-relaxed">
                ChainLegacy may use third-party services like Stripe for billing and Firebase for authentication, which may also set cookies to ensure the security and functionality of their respective services.
              </p>
            </div>

            <div className="pt-8 border-t border-white/5">
              <p className="text-sm text-gray-500 text-center italic">
                By using ChainLegacy, you consent to our use of essential cookies.
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
