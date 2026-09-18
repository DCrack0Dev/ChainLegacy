'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Button } from '@/components/ui/Button';
import Link from 'next/link';
import { Building2, ShieldCheck, User, Mail, MessageSquare, Phone } from 'lucide-react';

const SALES_CONTACTS = {
  email: 'demitechwebservices@gmail.com',
  whatsapp: '+27650241517',
  phone: '+27650241517',
  whatsappUrl: 'https://wa.me/27650241517',
  phoneUrl: 'tel:+27650241517',
  emailUrl: 'mailto:demitechwebservices@gmail.com',
};

export function FinalCTA() {
  return (
    <section className="py-24 bg-gold relative overflow-hidden">
      <div className="container mx-auto px-6 relative z-10 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="max-w-4xl mx-auto"
        >
          <div className="h-16 w-16 bg-black rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-black/20">
            <ShieldCheck className="h-8 w-8 text-gold" />
          </div>
          <h2 className="text-4xl md:text-6xl font-black text-black mb-6 leading-[1.1] tracking-tight uppercase">
            One platform. <span className="text-white">Two experiences.</span>
          </h2>
          <p className="text-black/70 text-lg md:text-xl mb-12 max-w-2xl mx-auto font-medium">
            Individuals secure their own legacy. Organizations manage legacy services for customers.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl mx-auto mb-10 text-left">
            <Link href="/register?intent=personal" className="rounded-[1.5rem] bg-black/10 hover:bg-black/15 border border-black/10 p-5 transition">
              <div className="flex items-center gap-2 mb-2 text-black font-black uppercase tracking-wider text-sm">
                <User className="h-4 w-4" /> Personal
              </div>
              <p className="text-sm text-black/60">Create a personal vault and legacy plan.</p>
            </Link>
            <Link href="/enterprise" className="rounded-[1.5rem] bg-black/10 hover:bg-black/15 border border-black/10 p-5 transition">
              <div className="flex items-center gap-2 mb-2 text-black font-black uppercase tracking-wider text-sm">
                <Building2 className="h-4 w-4" /> Enterprise
              </div>
              <p className="text-sm text-black/60">Create an organization and manage customers.</p>
            </Link>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Link href="/register?intent=personal" className="w-full sm:w-auto">
              <Button size="xl" className="w-full bg-black hover:bg-black/90 text-gold font-black shadow-2xl uppercase tracking-widest h-16 px-12">
                Create Personal Account
              </Button>
            </Link>
            <Link href="/enterprise" className="w-full sm:w-auto">
              <Button variant="outline" size="xl" className="w-full border-black/20 text-black hover:bg-black/5 uppercase tracking-widest font-black h-16 px-12">
                Explore Enterprise
              </Button>
            </Link>
          </div>

          <div className="mt-16 pt-8 border-t border-black/20">
            <h3 className="text-lg font-black text-black mb-6 text-center uppercase tracking-tight">
              Enterprise Inquiries
            </h3>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <a href={SALES_CONTACTS.emailUrl}>
                <Button variant="outline" className="w-full sm:w-auto border-black/30 text-black hover:bg-black/10 uppercase tracking-widest font-black h-14 px-10">
                  <Mail className="mr-2 h-4 w-4" />
                  Email Sales
                </Button>
              </a>
              <a href={SALES_CONTACTS.whatsappUrl} target="_blank" rel="noopener noreferrer">
                <Button variant="outline" className="w-full sm:w-auto border-green-500/30 text-green-600 hover:bg-green-500/10 uppercase tracking-widest font-black h-14 px-10">
                  <MessageSquare className="mr-2 h-4 w-4" />
                  WhatsApp Sales
                </Button>
              </a>
              <a href={SALES_CONTACTS.phoneUrl}>
                <Button variant="outline" className="w-full sm:w-auto border-blue-500/30 text-blue-600 hover:bg-blue-500/10 uppercase tracking-widest font-black h-14 px-10">
                  <Phone className="mr-2 h-4 w-4" />
                  Call Sales
                </Button>
              </a>
            </div>
          </div>

          <p className="mt-12 text-black/40 text-[10px] font-black uppercase tracking-[0.3em]">
            Zero-Knowledge • AES-256 GCM • Argon2id
          </p>
        </motion.div>
      </div>

      <div className="absolute top-0 right-0 w-96 h-96 bg-black/5 rounded-full blur-[100px] -mr-48 -mt-48" />
      <div className="absolute bottom-0 left-0 w-96 h-96 bg-black/5 rounded-full blur-[100px] -ml-48 -mb-48" />
    </section>
  );
}
