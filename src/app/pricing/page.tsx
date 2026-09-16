'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navbar } from '@/components/ui/Navbar';
import { Button } from '@/components/ui/Button';
import { Check, Star, Zap, Shield, Crown, Info, HelpCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

export default function PricingPage() {
  const { user, loading: authLoading } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [userData, setUserData] = useState<any>(null);
  const router = useRouter();

  useEffect(() => {
    if (user) {
      const fetchUser = async () => {
        try {
          const docSnap = await getDoc(doc(db, 'users', user.uid));
          if (docSnap.exists()) {
            setUserData(docSnap.data());
          }
        } catch (err) {
          console.error('Error fetching user data:', err);
        }
      };
      fetchUser();
    }
  }, [user]);

  if (authLoading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="h-12 w-12 border-2 border-gold/20 border-t-gold rounded-full animate-spin" />
    </div>
  );

  const tiers = [
    {
      id: 'free',
      name: "Free",
      price: "R0",
      description: "Basic protection for beginners.",
      features: [
        "1 Beneficiary",
        "Email Liveness Check",
        "Text Message Storage",
        "7-Day Trigger Window",
        "AES-256-GCM Security"
      ],
      icon: <Zap className="h-6 w-6" />,
      cta: "Current Plan",
      popular: false
    },
    {
      id: 'pro',
      name: "Pro",
      price: "R149",
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
      id: 'premium',
      name: "Premium",
      price: "R399",
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
      id: 'legacy_elite',
      name: "Legacy Elite",
      price: "R999",
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

  const handleUpgrade = async (tierId: string) => {
    if (!user) {
      router.push('/login');
      return;
    }
    
    if (tierId === 'free') return;

    const tier = tiers.find(t => t.id === tierId);
    if (!tier) return;

    setLoading(true);
    setError(null);
    console.log('Starting simulated upgrade for tier:', tierId);

    try {
      // Direct simulation for all environments
      await handleSimulatedUpgrade(tierId, user.uid);
    } catch (err: any) {
      console.error('Upgrade failed:', err);
      setError('Could not process upgrade: ' + err.message);
      setLoading(false);
    }
  };

  const handleSimulatedUpgrade = async (tierId: string, userId: string) => {
    try {
      console.log('Processing simulated payment for:', tierId);
      const response = await fetch('/api/billing/charge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: 'tok_simulated_success',
          amountInCents: 0,
          tierId,
          userId
        }),
      });
      if (response.ok) {
        console.log('Upgrade successful!');
        // Force a re-fetch of user data before redirecting
        const docSnap = await getDoc(doc(db, 'users', userId));
        if (docSnap.exists()) {
          setUserData(docSnap.data());
        }
        router.push('/dashboard');
      } else {
        const errorData = await response.json();
        setError(errorData.error || 'Upgrade failed on backend');
      }
    } catch (e) {
      setError('Simulation error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      
      <main className="container mx-auto px-6 pt-24 pb-32">
        <div className="max-w-4xl mx-auto text-center mb-24">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <span className="text-[10px] font-black uppercase tracking-[0.5em] text-gold mb-6 block">Pricing & Plans</span>
            <h1 className="text-4xl md:text-7xl font-black text-white uppercase tracking-tight mb-8">
              Protect Your <span className="text-gold italic underline decoration-gold/30">Wealth.</span>
            </h1>
            <p className="text-xl text-gray-400 leading-relaxed max-w-2xl mx-auto">
              Choose a plan that scales with your digital footprint. Upgrade or downgrade at any time.
            </p>
            {error && (
              <div className="mt-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-center space-x-3 text-red-500 text-sm font-bold uppercase tracking-tight">
                <AlertTriangle className="h-5 w-5" />
                <span>{error}</span>
              </div>
            )}
          </motion.div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8 mb-32">
          {tiers.map((tier, index) => {
            const isCurrent = userData?.plan === tier.id || (tier.id === 'free' && !userData?.plan);
            
            return (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
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
                    <span className="text-gray-500 text-[10px] font-black uppercase tracking-widest block">/ month</span>
                  </div>
                </div>
                
                <h3 className="text-2xl font-bold text-white mb-4 uppercase tracking-tight">{tier.name}</h3>
                <p className="text-gray-500 text-xs mb-10 leading-relaxed">{tier.description}</p>
                
                <div className="space-y-4 mb-12 flex-1">
                  {tier.features.map((feature, fIndex) => (
                    <div key={fIndex} className="flex items-center space-x-3">
                      <Check className="h-4 w-4 text-gold shrink-0" />
                      <span className="text-gray-400 text-xs font-medium">{feature}</span>
                    </div>
                  ))}
                </div>
                
                <Button 
                  onClick={() => handleUpgrade(tier.id)}
                  isLoading={loading}
                  disabled={isCurrent || loading}
                  variant={tier.popular ? "primary" : "outline"}
                  className={cn(
                    "w-full uppercase tracking-widest font-black h-14",
                    tier.popular ? "bg-gold hover:bg-gold-dark text-black" : "border-white/10 hover:bg-white/5",
                    isCurrent && "opacity-50 cursor-default border-green-500/20 text-green-500 hover:bg-transparent"
                  )}
                >
                  {isCurrent ? "Current Plan" : tier.cta}
                </Button>
              </motion.div>
            );
          })}
        </div>

        {/* FAQ Section */}
        <div className="max-w-3xl mx-auto">
          <h2 className="text-3xl font-black text-white uppercase tracking-tight text-center mb-16">Frequently Asked Questions</h2>
          <div className="space-y-6">
            <FaqItem 
              question="How do I pay?" 
              answer="We currently support a simplified payment simulation for demonstration purposes. In production, we will support major credit cards and digital payments."
            />
            <FaqItem 
              question="Is my payment secure?" 
              answer="Yes. Our simulation uses secure, industry-standard protocols. In production, all payment information will be processed by PCI-compliant infrastructure."
            />
            <FaqItem 
              question="Can I cancel anytime?" 
              answer="Yes. You can cancel your subscription at any time. Your vault will remain active until the end of the billing period."
            />
            <FaqItem 
              question="What happens if I downgrade?" 
              answer="If you downgrade, some features like video messages or multi-beneficiary support will be restricted. Your data remains encrypted and safe."
            />
            <FaqItem 
              question="Do you have an annual plan?" 
              answer="Yes, annual plans are available for Legacy Elite users with a 20% discount. Contact our support team for details."
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function FaqItem({ question, answer }: { question: string; answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
      <div className="flex items-center justify-between">
        <h4 className="text-lg font-bold text-white uppercase tracking-tight">{question}</h4>
        <HelpCircle className={cn("h-5 w-5 text-gold transition-transform", isOpen && "rotate-180")} />
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <p className="text-gray-500 text-sm mt-6 leading-relaxed">
              {answer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
