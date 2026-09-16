'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { XCircle, AlertTriangle, Key } from 'lucide-react';

export function Problem() {
  return (
    <section className="py-24 bg-black/50 border-y border-white/5 relative overflow-hidden">
      <div className="container mx-auto px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-black text-white mb-6 uppercase tracking-tight">
              The <span className="text-red-500">Unspoken</span> Risk of Crypto
            </h2>
            <p className="text-gray-400 text-lg md:text-xl max-w-2xl mx-auto">
              If your private keys disappear, so does your wealth. Forever.
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="p-8 rounded-[2rem] bg-red-500/5 border border-red-500/10 group transition-all hover:bg-red-500/10"
            >
              <div className="h-12 w-12 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6">
                <XCircle className="h-6 w-6 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-4 uppercase tracking-tight">Permanent Loss</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Lost private keys = lost assets. There is no "forgot password" for a seed phrase.
              </p>
            </motion.div>
            
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="p-8 rounded-[2rem] bg-red-500/5 border border-red-500/10 group transition-all hover:bg-red-500/10"
            >
              <div className="h-12 w-12 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6">
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-4 uppercase tracking-tight">Family Hardship</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Your loved ones will have no legal or technical way to recover your digital estate.
              </p>
            </motion.div>
            
            <motion.div
              whileHover={{ scale: 1.02 }}
              className="p-8 rounded-[2rem] bg-red-500/5 border border-red-500/10 group transition-all hover:bg-red-500/10"
            >
              <div className="h-12 w-12 bg-red-500/10 rounded-2xl flex items-center justify-center mb-6">
                <Key className="h-6 w-6 text-red-500" />
              </div>
              <h3 className="text-xl font-bold text-white mb-4 uppercase tracking-tight">Custodial Risk</h3>
              <p className="text-gray-500 text-sm leading-relaxed">
                Centralized exchanges are not safe havens for long-term inheritance. Not your keys, not your coins.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
