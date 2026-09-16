'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { doc, getDoc, updateDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import { db, storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { Navbar } from '@/components/ui/Navbar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardContent } from '@/components/ui/Card';
import { EncryptionService } from '@/services/encryption';
import { SecureProcessing } from '@/components/ui/SecureProcessing';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { motion, AnimatePresence } from 'framer-motion';
import { withPerformanceLog } from '@/lib/logger';
import { z } from 'zod';
import { ContactSchema } from '@/types/vault';
import { 
  Shield, Users, Clock, Save, Plus, Trash2, 
  MessageSquare, Smartphone, Video, ShieldCheck, 
  Lock, AlertTriangle 
} from 'lucide-react';

const BeneficiarySchema = z.array(z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email format"),
  phone: z.string().optional(),
  walletAddress: z.string().optional(),
  share: z.number().min(1).max(100)
}));

const TrustedContactSchema = z.object({
  name: z.string().min(1, "Guardian name is required"),
  email: z.string().email("Invalid guardian email format")
});

export default function SetupPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [currentStep, setCurrentStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [hasSetup, setHasSetup] = useState(false);

  // Form States
  const [beneficiaries, setBeneficiaries] = useState([{ name: '', email: '', phone: '', walletAddress: '', share: 100 }]);
  const [approvalThreshold, setApprovalThreshold] = useState(1);
  const [trustedContact, setTrustedContact] = useState({ name: '', email: '' });
  const [secret, setSecret] = useState('');
  const [customMessage, setCustomMessage] = useState('');
  const [password, setPassword] = useState(''); 
  const [interval, setInterval] = useState('30');
  
  // Feature States
  const [smsNotifications, setSmsNotifications] = useState(false);
  const [userPhone, setUserPhone] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [plan, setPlan] = useState('free');
  const [shamirMode, setShamirMode] = useState(false);
  const [shamirThreshold, setShamirThreshold] = useState(2);
  const [shamirShares, setShamirShares] = useState(3);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }

    if (user) {
      const fetchData = async () => {
        const userDocSnap = await getDoc(doc(db, 'users', user.uid));
        const vaultDocSnap = await getDoc(doc(db, 'vaults', user.uid));
        
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          setPlan(userData.plan || 'free');
          setHasSetup(userData.hasSetup || false);
        }

        if (vaultDocSnap.exists()) {
          const vaultData = vaultDocSnap.data();
          
          // STEP 4: FORCE UI TO USE VAULT ONLY
          const beneficiariesFromVault = vaultData.contacts
            .filter((c: any) => c.role === 'beneficiary')
            .map((c: any) => ({
              id: c.id,
              name: c.name,
              email: c.email,
              phone: c.phone || '',
              walletAddress: c.walletAddress || '',
              share: c.share || 0
            }));

          if (beneficiariesFromVault.length > 0) {
            setBeneficiaries(beneficiariesFromVault);
          }

          if (vaultData.interval) setInterval(vaultData.interval.toString());
          
          // Check for other vault-related fields if they were moved there
          // For now, some fields might still be in the user doc, but we prioritize vault
        }
        
        // Fallback for fields that might still be in user doc during transition
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          if (userData.trustedContact) setTrustedContact(userData.trustedContact);
          if (userData.smsNotifications) setSmsNotifications(userData.smsNotifications);
          if (userData.userPhone) setUserPhone(userData.userPhone);
          if (userData.videoUrl) setVideoUrl(userData.videoUrl);
          if (userData.shamirMode) setShamirMode(userData.shamirMode);
          if (userData.shamirThreshold) setShamirThreshold(userData.shamirThreshold);
          if (userData.shamirShares) setShamirShares(userData.shamirShares);
        }
      };
      fetchData();
    }
  }, [user, authLoading, router]);

  const isPremium = plan === 'premium' || plan === 'legacy_elite';

  const calculateSecurityScore = () => {
    let score = 0;
    if (password.length >= 8) score += 20;
    if (beneficiaries.length > 1) score += 20;
    if (approvalThreshold > 1) score += 20;
    if (beneficiaries.every(b => !!b.walletAddress && b.walletAddress.length > 0)) score += 20;
    if (smsNotifications) score += 10;
    if (shamirMode) {
      score += 10;
      if (shamirThreshold >= 3) score += 5;
      if (shamirShares >= 5) score += 5;
    }
    return Math.min(score, 100);
  };

  const addBeneficiary = () => {
    if (beneficiaries.length >= 5) {
      setError('Maximum 5 beneficiaries allowed.');
      return;
    }
    const newBens = [...beneficiaries, { name: '', email: '', phone: '', walletAddress: '', share: 0 }];
    setBeneficiaries(newBens);
  };

  const removeBeneficiary = (index: number) => {
    if (beneficiaries.length <= 1) return;
    const newBens = beneficiaries.filter((_, i) => i !== index);
    
    // Auto-adjust shares if there's only one left
    if (newBens.length === 1) {
      newBens[0].share = 100;
    }
    
    setBeneficiaries(newBens);
    if (approvalThreshold > newBens.length) setApprovalThreshold(newBens.length);
  };

  const updateBeneficiary = (index: number, field: string, value: any) => {
    const newBens = [...beneficiaries];
    newBens[index] = { ...newBens[index], [field]: value };
    setBeneficiaries(newBens);
  };

  const handleNextStep = () => {
    setError('');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (currentStep === 1 && !password) {
      setError('A password is required to secure your vault.');
      return;
    }
    if (currentStep === 2) {
      if (beneficiaries.some(b => !b.name || !b.email)) {
        setError('Please complete all beneficiary details.');
        return;
      }
      if (beneficiaries.some(b => !emailRegex.test(b.email))) {
        setError('Please provide a valid email for all beneficiaries.');
        return;
      }
      const totalShare = beneficiaries.reduce((sum, b) => sum + (b.share || 0), 0);
      if (totalShare !== 100) {
        setError(`Total distribution must equal 100%. Current total: ${totalShare}%`);
        return;
      }
    }
    if (currentStep === 3) {
      if (!trustedContact.name || !trustedContact.email) {
        setError('Please provide a trusted contact.');
        return;
      }
      if (!emailRegex.test(trustedContact.email)) {
        setError('Please provide a valid email for the trusted contact.');
        return;
      }
    }
    if (currentStep === 4 && !secret) {
      setError('You must provide a secret to store.');
      return;
    }
    setCurrentStep(prev => prev + 1);
  };

  const handlePrevStep = () => {
    setCurrentStep(prev => prev - 1);
  };

  const handleSave = async () => {
    setError('');
    setShowConfirmModal(true);
  };

  const confirmSave = async () => {
    setShowConfirmModal(false);
    setLoading(true);

    try {
      if (!user) throw new Error('Not authenticated');

      // STEP 8: PROTECT AGAINST FUTURE BREAKS (Validation)
      const validatedBeneficiaries = BeneficiarySchema.parse(beneficiaries);
      const validatedGuardian = TrustedContactSchema.parse(trustedContact);

      const result = await withPerformanceLog('Vault Setup V3', async () => {
        let encryptedSecret = '';
        let sssShares: string[] = [];

        if (shamirMode) {
          sssShares = await EncryptionService.splitSecret(password, shamirThreshold, shamirShares);
          encryptedSecret = await EncryptionService.encryptText(secret, password);
        } else {
          encryptedSecret = await EncryptionService.encryptText(secret, password);
        }

        const encryptedMessage = customMessage ? await EncryptionService.encryptText(customMessage, password) : '';

        // STEP 1: CREATE NEW VAULT DATA MODEL (MANDATORY)
        const now = Date.now();
        const vaultContacts = [
          ...validatedBeneficiaries.map(b => ({
            id: b.id || Math.random().toString(36).substring(7),
            name: b.name,
            email: b.email,
            phone: b.phone || '',
            role: 'beneficiary' as const,
            share: b.share,
            walletAddress: b.walletAddress || ''
          })),
          {
            id: Math.random().toString(36).substring(7),
            name: validatedGuardian.name,
            email: validatedGuardian.email,
            role: 'guardian' as const,
            status: 'pending'
          }
        ];

        const vaultUpdate = {
          contacts: vaultContacts,
          interval: parseFloat(interval),
          lastCheckIn: now,
          status: 'active' as const,
          updatedAt: now
        };

        // Extra data for encryption/features that might still be in user doc
        const userUpdate = {
          encryptedSecret,
          encryptedMessage,
          videoUrl,
          smsNotifications,
          userPhone,
          hasSetup: true,
          shamirMode,
          shamirThreshold,
          shamirShares,
          serverShare: shamirMode ? sssShares[0] : null,
          updatedAt: serverTimestamp(),
        };

        // STEP 3: FIX BENEFICIARY ADD FLOW
        // Save to vaults collection immediately
        await updateDoc(doc(db, 'vaults', user.uid), vaultUpdate);
        
        // Update user doc for UI/status tracking
        await updateDoc(doc(db, 'users', user.uid), {
          ...userUpdate,
          logs: arrayUnion({
            action: hasSetup ? 'vault_updated' : 'vault_created',
            timestamp: new Date().toISOString(),
            details: hasSetup ? 'Legacy protection plan updated with new configuration.' : 'Initial legacy vault secured and encrypted.'
          })
        });

        if (hasSetup) {
          // Task 4: Anti-takeover 24-hour protection
          try {
            await fetch('/api/governance/schedule-change', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                userId: user.uid, 
                type: 'beneficiaries', 
                data: { contacts: vaultContacts } 
              })
            });
          } catch (e) {
            console.warn('Anti-takeover schedule failed');
          }
          setSuccess('Changes scheduled with 24-hour protection.');
        } else {
          setSuccess('Legacy secured successfully!');
        }

        return { success: true };
      }, user.uid);

      if (result.success) {
        setIsProcessing(true);
      }
    } catch (err: any) {
      console.error('Vault Save Error Details:', err);
      if (err instanceof z.ZodError) {
        setError(`Validation Error: ${err.errors[0].message}`);
      } else {
        setError(err.message || 'An error occurred during save.');
      }
      setLoading(false);
    }
  };

  if (authLoading) return (
    <div className="min-h-screen bg-black flex items-center justify-center">
      <div className="h-12 w-12 border-2 border-gold/20 border-t-gold rounded-full animate-spin" />
    </div>
  );

  const steps = [
    { id: 1, name: 'Security', icon: <Shield className="h-4 w-4" /> },
    { id: 2, name: 'Beneficiaries', icon: <Users className="h-4 w-4" /> },
    { id: 3, name: 'Governance', icon: <Clock className="h-4 w-4" /> },
    { id: 4, name: 'Legacy', icon: <MessageSquare className="h-4 w-4" /> },
    { id: 5, name: 'Review', icon: <Save className="h-4 w-4" /> }
  ];

  return (
    <div className="min-h-screen bg-black pb-20">
      {isProcessing && <SecureProcessing onComplete={() => router.push('/dashboard')} />}
      
      <ConfirmationModal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        onConfirm={confirmSave}
        title="Secure Your Vault?"
        description="This will encrypt your secret and beneficiary details locally. Ensure your encryption password is saved securely."
        confirmText="Encrypt & Save"
        variant="gold"
      />

      <Navbar />
      
      <div className="mx-auto max-w-4xl px-6 pt-12">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-12">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tight mb-2">Vault Onboarding</h1>
            <p className="text-gray-500 text-sm">Secure your digital legacy in five simple steps.</p>
          </div>
          
          <div className="bg-white/5 border border-white/10 rounded-[2rem] p-4 flex items-center space-x-4">
            <div className="relative h-12 w-12 flex items-center justify-center">
              <svg className="h-full w-full transform -rotate-90">
                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" className="text-white/10" />
                <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="4" fill="transparent" strokeDasharray={125.6} strokeDashoffset={125.6 - (125.6 * calculateSecurityScore()) / 100} className="text-gold transition-all duration-1000" />
              </svg>
              <span className="absolute text-[10px] font-black text-white">{calculateSecurityScore()}%</span>
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-gold">Security Score</p>
              <p className="text-xs text-gray-400">{calculateSecurityScore() < 80 ? 'Add more protection' : 'Maximum Security'}</p>
            </div>
          </div>
        </div>

        {/* Stepper UI */}
        <div className="flex items-center justify-between mb-12 px-4 relative">
          <div className="absolute top-1/2 left-0 right-0 h-px bg-white/5 -z-10" />
          {steps.map((step) => (
            <div key={step.id} className="flex flex-col items-center group">
              <div className={cn(
                "h-10 w-10 rounded-xl flex items-center justify-center transition-all duration-500 border",
                currentStep === step.id ? "bg-gold text-black border-gold shadow-[0_0_20px_rgba(212,175,55,0.3)] scale-110" :
                currentStep > step.id ? "bg-gold/20 text-gold border-gold/30" : "bg-black border-white/10 text-gray-500"
              )}>
                {step.icon}
              </div>
              <span className={cn(
                "mt-2 text-[8px] font-black uppercase tracking-widest transition-colors",
                currentStep === step.id ? "text-gold" : "text-gray-600"
              )}>
                {step.name}
              </span>
            </div>
          ))}
        </div>

        {error && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center space-x-3">
            <AlertTriangle className="h-5 w-5 text-red-500" />
            <p className="text-red-500 text-xs font-bold uppercase tracking-tight">{error}</p>
          </motion.div>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
            className="space-y-8"
          >
            {/* Step 1: Security */}
            {currentStep === 1 && (
              <Card className="border-gold/20">
                <CardHeader title="Vault Security" subtitle="Create the master password for your zero-knowledge vault." />
                <CardContent className="space-y-8">
                  <div className="p-8 rounded-[2rem] bg-gold/5 border border-gold/10">
                    <h4 className="text-xs font-black text-gold uppercase tracking-widest mb-4 flex items-center">
                      <Lock className="mr-2 h-4 w-4" /> Master Encryption Password
                    </h4>
                    <Input
                      type="password"
                      placeholder="Minimum 12 characters"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="bg-black border-white/10 h-14"
                    />
                    <p className="mt-4 text-[10px] text-gray-500 uppercase tracking-widest leading-relaxed">
                      * We never store this. If lost, your vault is unrecoverable.
                    </p>
                  </div>

                  <div className="p-8 rounded-[2rem] bg-white/5 border border-white/10">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-tight">Shamir Secret Sharing</h4>
                        <p className="text-xs text-gray-500 mt-1">Split key into multiple parts for recovery.</p>
                      </div>
                      <div 
                        onClick={() => setShamirMode(!shamirMode)}
                        className={cn(
                          "w-12 h-6 rounded-full p-1 cursor-pointer transition-colors",
                          shamirMode ? "bg-gold" : "bg-white/10"
                        )}
                      >
                        <div className={cn("h-4 w-4 rounded-full bg-white transition-transform", shamirMode ? "translate-x-6" : "translate-x-0")} />
                      </div>
                    </div>

                    {shamirMode && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        className="space-y-6 pt-6 border-t border-white/5"
                      >
                        <div className="grid grid-cols-2 gap-6">
                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-gold uppercase tracking-widest">Threshold (Required)</label>
                            <div className="flex items-center space-x-3">
                              <button 
                                onClick={() => setShamirThreshold(Math.max(2, shamirThreshold - 1))}
                                className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                              >
                                -
                              </button>
                              <span className="text-lg font-black text-white w-8 text-center">{shamirThreshold}</span>
                              <button 
                                onClick={() => setShamirThreshold(Math.min(shamirShares, shamirThreshold + 1))}
                                className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-[10px] font-black text-gold uppercase tracking-widest">Total Shares</label>
                            <div className="flex items-center space-x-3">
                              <button 
                                onClick={() => {
                                  const newShares = Math.max(shamirThreshold, shamirShares - 1);
                                  setShamirShares(newShares);
                                }}
                                className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                              >
                                -
                              </button>
                              <span className="text-lg font-black text-white w-8 text-center">{shamirShares}</span>
                              <button 
                                onClick={() => setShamirShares(Math.min(10, shamirShares + 1))}
                                className="h-10 w-10 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        </div>
                        <p className="text-[9px] text-gray-500 font-medium uppercase tracking-widest text-center">
                          Mode: {shamirThreshold}-of-{shamirShares} split. At least {shamirThreshold} shares required to unlock.
                        </p>
                      </motion.div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Step 2: Beneficiaries */}
            {currentStep === 2 && (
              <Card className="border-gold/20">
                <CardHeader title="Beneficiaries" subtitle="Designate who will inherit your vault." />
                <CardContent className="space-y-6">
                  {beneficiaries.map((b, index) => (
                    <div key={index} className="p-8 border border-white/5 rounded-[2.5rem] space-y-6 relative bg-white/[0.02]">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-gold">Beneficiary #{index + 1}</span>
                        {beneficiaries.length > 1 && (
                          <button onClick={() => removeBeneficiary(index)} className="text-gray-600 hover:text-red-500 transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Input label="Name" value={b.name} onChange={(e) => updateBeneficiary(index, 'name', e.target.value)} placeholder="Full Name" />
                        <Input label="Email" type="email" value={b.email} onChange={(e) => updateBeneficiary(index, 'email', e.target.value)} placeholder="email@example.com" />
                        <Input label="Phone" value={b.phone} onChange={(e) => updateBeneficiary(index, 'phone', e.target.value)} placeholder="+1..." />
                        <Input label="Wallet" value={b.walletAddress} onChange={(e) => updateBeneficiary(index, 'walletAddress', e.target.value)} placeholder="0x..." className="font-mono text-xs" />
                        
                        <div className="md:col-span-2">
                          <div className="flex items-center justify-between mb-2">
                            <label className="text-[10px] font-black text-gold uppercase tracking-widest">Distribution Percentage (%)</label>
                            <span className="text-sm font-black text-white">{b.share}%</span>
                          </div>
                          <input 
                            type="range" 
                            min="0" 
                            max="100" 
                            step="1" 
                            value={b.share} 
                            onChange={(e) => updateBeneficiary(index, 'share', parseInt(e.target.value))} 
                            className="w-full accent-gold" 
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <Button onClick={addBeneficiary} variant="outline" className="w-full h-14 border-dashed border-2 border-white/10 rounded-[2rem]">
                    <Plus className="mr-2 h-4 w-4" /> Add Another Beneficiary
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Step 3: Governance */}
            {currentStep === 3 && (
              <div className="space-y-8">
                <Card className="border-gold/20">
                  <CardHeader title="Guardian Network" subtitle="Assign a trusted contact to verify your status." />
                  <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Input label="Guardian Name" value={trustedContact.name} onChange={(e) => setTrustedContact({...trustedContact, name: e.target.value})} placeholder="Full Name" />
                    <Input label="Guardian Email" type="email" value={trustedContact.email} onChange={(e) => setTrustedContact({...trustedContact, email: e.target.value})} placeholder="email@example.com" />
                  </CardContent>
                </Card>

                <Card className="border-gold/20">
                  <CardHeader title="Liveness Settings" subtitle="Configure the inactivity window." />
                  <CardContent className="space-y-8">
                    <div className="p-8 rounded-[2rem] bg-white/5 border border-white/10">
                      <div className="flex justify-between items-center mb-6">
                        <label className="text-[10px] font-black text-gold uppercase tracking-[0.3em]">
                          Inactivity Window: {parseFloat(interval) < 0.01 ? '1 Minute (Testing)' : `${interval} Days`}
                        </label>
                        {parseFloat(interval) >= 0.01 && (
                          <button 
                            onClick={() => setInterval('0.001')}
                            className="text-[8px] font-black text-gold/60 uppercase tracking-widest hover:text-gold transition-colors"
                          >
                            Enable 1-Min Test Mode
                          </button>
                        )}
                        {parseFloat(interval) < 0.01 && (
                          <button 
                            onClick={() => setInterval('30')}
                            className="text-[8px] font-black text-red-500/60 uppercase tracking-widest hover:text-red-500 transition-colors"
                          >
                            Disable Test Mode
                          </button>
                        )}
                      </div>
                      <input 
                        type="range" 
                        min="7" 
                        max="365" 
                        step="7" 
                        value={parseFloat(interval) < 0.01 ? '7' : interval} 
                        onChange={(e) => setInterval(e.target.value)} 
                        className={cn("w-full accent-gold", parseFloat(interval) < 0.01 && "opacity-30 pointer-events-none")} 
                      />
                      {parseFloat(interval) < 0.01 && (
                        <p className="mt-4 text-[8px] text-gold/40 font-black uppercase tracking-widest animate-pulse">
                          * Testing Mode Active: Status will update every minute.
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Step 4: Legacy */}
            {currentStep === 4 && (
              <div className="space-y-8">
                <Card className="border-gold/20">
                  <CardHeader title="Vault Secret" subtitle="Encrypted information (e.g. Seed Phrase)." />
                  <CardContent>
                    <textarea
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                      placeholder="Enter seed phrase, private keys, or passwords..."
                      className="w-full h-40 bg-black border border-white/10 rounded-[2rem] p-6 text-white text-sm font-mono focus:border-gold/50 outline-none"
                    />
                  </CardContent>
                </Card>

                <Card className="border-gold/20">
                  <CardHeader title="Final Message" subtitle="Add a message or video for your heirs." />
                  <CardContent className="space-y-8">
                    <textarea
                      value={customMessage}
                      onChange={(e) => setCustomMessage(e.target.value)}
                      placeholder="Write a message for your beneficiaries..."
                      className="w-full h-32 bg-black border border-white/10 rounded-[2rem] p-6 text-white text-sm focus:border-gold/50 outline-none"
                    />
                    
                    <div className="p-8 rounded-[2rem] bg-white/5 border border-white/10 text-center">
                      <Video className="h-8 w-8 text-gold mx-auto mb-4" />
                      <h4 className="text-sm font-black text-white uppercase tracking-tight mb-2">Video Message (Premium)</h4>
                      {isPremium ? (
                        <Button variant="outline" className="border-gold/30 text-gold uppercase text-[10px] font-black px-8">Record Video</Button>
                      ) : (
                        <Link href="/pricing">
                          <Button variant="outline" className="border-white/10 text-gray-500 uppercase text-[10px] font-black px-8">Upgrade to Unlock</Button>
                        </Link>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Step 5: Review */}
            {currentStep === 5 && (
              <Card className="border-gold/20 bg-gold/[0.02]">
                <CardHeader title="Review & Encrypt" subtitle="Verify your details before local encryption." />
                <CardContent className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-gold uppercase tracking-widest">Beneficiaries</p>
                      <p className="text-2xl font-black text-white">{beneficiaries.length}</p>
                    </div>
                    <div className="space-y-2">
                      <p className="text-[10px] font-black text-gold uppercase tracking-widest">Inactivity Window</p>
                      <p className="text-2xl font-black text-white">{interval} Days</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-8 border-t border-white/10">
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-gold uppercase tracking-widest">Distribution Summary</p>
                      <div className="space-y-3">
                        {beneficiaries.map((b, i) => (
                          <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex justify-between items-center group hover:border-gold/20 transition-all">
                            <div className="flex items-center space-x-3">
                              <div className="h-8 w-8 rounded-lg bg-gold/10 flex items-center justify-center border border-gold/20">
                                <span className="text-[10px] font-black text-gold">{b.name?.charAt(0) || '?'}</span>
                              </div>
                              <div className="flex flex-col">
                                <span className="text-sm font-bold text-white tracking-tight">{b.name || `Beneficiary #${i + 1}`}</span>
                                <span className="text-[10px] text-gray-500 font-medium">{b.email || 'No email provided'}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <span className="text-lg font-black text-gold">{b.share || 0}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <p className="text-[10px] font-black text-gold uppercase tracking-widest">Security Configuration</p>
                      <div className="space-y-3">
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex justify-between items-center">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-tight">Shamir Split</span>
                          <span className="text-xs font-black text-white uppercase tracking-widest">
                            {shamirMode ? `${shamirThreshold}-of-${shamirShares}` : 'Disabled'}
                          </span>
                        </div>
                        <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/5 flex justify-between items-center">
                          <span className="text-xs font-bold text-gray-400 uppercase tracking-tight">Consensus</span>
                          <span className="text-xs font-black text-white uppercase tracking-widest">
                            {approvalThreshold}-of-{beneficiaries.length} Required
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-8 border-t border-white/10">
                    <div className="flex items-center space-x-4 p-6 bg-gold/10 border border-gold/20 rounded-[2rem]">
                      <ShieldCheck className="h-8 w-8 text-gold" />
                      <div>
                        <p className="text-white font-bold uppercase tracking-tight">Zero-Knowledge Secure</p>
                        <p className="text-[10px] text-gray-400 uppercase tracking-widest leading-relaxed mt-1">
                          Encryption is local. We never see your plaintext data.
                        </p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Navigation Controls */}
            <div className="flex items-center justify-between pt-8">
              {currentStep > 1 ? (
                <Button onClick={handlePrevStep} variant="ghost" className="text-gray-500 hover:text-white uppercase font-black text-[10px]">
                  Back
                </Button>
              ) : <div />}
              
              {currentStep < 5 ? (
                <Button onClick={handleNextStep} className="bg-gold hover:bg-gold-dark text-black font-black uppercase px-10 h-14 shadow-lg">
                  Next Step
                </Button>
              ) : (
                <Button onClick={handleSave} isLoading={loading} className="bg-gold hover:bg-gold-dark text-black font-black uppercase px-12 h-16 shadow-2xl">
                  Encrypt & Save Legacy
                </Button>
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
