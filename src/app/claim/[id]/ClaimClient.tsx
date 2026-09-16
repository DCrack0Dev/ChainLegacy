'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Navbar } from '@/components/ui/Navbar';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { EncryptionService } from '@/services/encryption';
import { cn } from '@/lib/utils';
import { Shield, Lock, Unlock, Eye, EyeOff, CheckCircle2, AlertTriangle, Loader2, Smartphone, MessageSquare, Smartphone as Phone } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useSignMessage } from 'wagmi';
import { ConnectButton } from '@rainbow-me/rainbowkit';

export default function ClaimClient({ id, initialData }: { id: string, initialData: any }) {
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [isWalletVerified, setIsWalletVerified] = useState(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  const [signing, setSigning] = useState(false);
  const [userData, setUserData] = useState<any>(initialData);
  const [error, setError] = useState('');
  
  // Verification fields
  const [step, setStep] = useState(1); 

  if (!mounted) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="h-12 w-12 border-2 border-gold/20 border-t-gold rounded-full animate-spin" />
      </div>
    );
  }

  const handleVerifyWallet = async () => {
    if (!address) return;
    setSigning(true);
    try {
      const message = `I am the designated beneficiary for ChainLegacy vault ${id}. Timestamp: ${new Date().toISOString()}`;
      await signMessageAsync({ message });
      
      const beneficiary = userData.beneficiary || 
                         userData.contacts?.find((c: any) => c.role === 'beneficiary') ||
                         (userData.beneficiaries && userData.beneficiaries[0]);
      
      if (beneficiary?.walletAddress && address.toLowerCase() !== beneficiary.walletAddress.toLowerCase()) {
        throw new Error(`Connected wallet (${address}) does not match the registered beneficiary wallet.`);
      }
      
      setIsWalletVerified(true);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Failed to verify wallet signature.');
    } finally {
      setSigning(false);
    }
  };

  const [vName, setVName] = useState('');
  const [vEmail, setVEmail] = useState('');
  const [vPhone, setVPhone] = useState('');
  const [vPhrase, setVPhrase] = useState('');

  const [otp, setOtp] = useState('');
  const [isApproved, setIsApproved] = useState(
    initialData?.approvalStatus === 'approved' || 
    (initialData?.trustedContacts && initialData.trustedContacts.some((c: any) => c.status === 'approved'))
  );
  const [password, setPassword] = useState('');
  const [decryptedSecret, setDecryptedSecret] = useState('');
  const [decryptedMessage, setDecryptedMessage] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [approving, setApproving] = useState(false);
  const [decrypting, setDecrypting] = useState(false);

  useEffect(() => {
    if (initialData?.status !== 'triggered') {
      setError('This legacy process has not been triggered yet.');
    }
  }, [initialData]);

  const handleVerifyIdentity = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setError('');
    
    try {
      const res = await fetch('/api/claim/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          action: 'verify-identity',
          data: { name: vName, email: vEmail, phone: vPhone }
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Verification failed.');

      const beneficiary = userData.beneficiary || 
                         userData.contacts?.find((c: any) => c.role === 'beneficiary') ||
                         (userData.beneficiaries && userData.beneficiaries[0]);

      if (beneficiary?.walletAddress) {
        setStep(2); // Go to wallet verification
      } else {
        setStep(3); // Skip wallet verification
      }
    } catch (err: any) {
      setError(err.message || 'Identity verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setError('');
    
    // Abuse Prevention: Local Rate Limiting
    if (userData?.claimAttempts >= 5) {
      setError('Too many failed attempts. Vault temporarily locked.');
      setVerifying(false);
      return;
    }

    try {
      const res = await fetch('/api/claim/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          action: 'verify-otp',
          data: { otp }
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Verification failed.');

      // IDENTITY & OTP VERIFIED -> SENSITIVE DATA RECEIVED
      setUserData((prev: any) => ({
        ...prev,
        encryptedSecret: result.encryptedSecret,
        encryptedMessage: result.encryptedMessage,
        videoUrl: result.videoUrl,
        personalPhrase: result.personalPhrase
      }));

      setStep(5); // Move to final check steps
    } catch (err: any) {
      setError(err.message || 'Verification failed.');
    } finally {
      setVerifying(false);
    }
  };

  const handleVerifyPhrase = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (vPhrase.trim().toLowerCase() === userData.personalPhrase?.trim().toLowerCase()) {
      setStep(4);
    } else {
      setError('Confirmation phrase is incorrect.');
    }
  };

  const handleSimulateApproval = async () => {
    setApproving(true);
    setError('');
    
    try {
      const res = await fetch('/api/claim/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id,
          action: 'simulate-approval'
        })
      });

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Approval failed.');

      setIsApproved(true);
      setStep(6);
    } catch (err: any) {
      setError(err.message || 'Failed to process approval.');
    } finally {
      setApproving(false);
    }
  };

  const handleDecrypt = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setDecrypting(true);

    try {
      if (!isApproved && userData.approvalStatus !== 'approved') {
        throw new Error('Trusted contact approval is required before decryption.');
      }
      
      if (!userData.encryptedSecret) {
        throw new Error('No secret found for this legacy.');
      }
      
      const secret = await EncryptionService.decryptText(userData.encryptedSecret, password);
      setDecryptedSecret(secret);

      if (userData.encryptedMessage) {
        const message = await EncryptionService.decryptText(userData.encryptedMessage, password);
        setDecryptedMessage(message);
      }

      setShowSecret(true);
    } catch (err: any) {
      setError(err.message || 'Invalid decryption password. Please try again.');
    } finally {
      setDecrypting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <Navbar />
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="mx-auto max-w-2xl px-4 pt-20 text-center"
      >
        <div className="mb-12">
          <div className="mx-auto h-20 w-20 bg-gold/10 rounded-full flex items-center justify-center mb-6 relative">
            <Lock className="h-10 w-10 text-gold" />
            <div className="absolute inset-0 rounded-full border border-gold/30 animate-ping" />
          </div>
          <h1 className="text-4xl font-extrabold text-white mb-4 tracking-tight uppercase">Secure Vault Access</h1>
          <p className="text-gray-400 max-w-md mx-auto">
            This vault is protected by <span className="text-gold font-bold uppercase tracking-widest">AES-256</span> encryption. Please complete the verification steps to access the legacy left by <span className="text-white font-semibold">{userData?.email}</span>.
          </p>
        </div>

        {error && (
          <div className="mb-8 p-4 bg-red-500/10 border border-red-500/20 rounded-xl flex items-center space-x-3 text-left">
            <AlertTriangle className="h-5 w-5 text-red-500 shrink-0" />
            <p className="text-red-500 text-sm font-medium">{error}</p>
          </div>
        )}

        {/* Progress Stepper */}
        <div className="flex items-center justify-center mb-8 space-x-2">
          {[1, 2, 3, 4, 5, 6].map((s) => (
            <div key={s} className="flex items-center">
              <div className={cn(
                "h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300",
                step === s ? "bg-gold text-black shadow-lg shadow-gold/20 scale-110" : 
                step > s ? "bg-gold/20 text-gold" : "bg-card-border text-gray-500"
              )}>
                {step > s ? <CheckCircle2 className="h-4 w-4" /> : s}
              </div>
              {s < 6 && <div className={cn("w-8 h-[2px] transition-colors duration-500", step > s ? "bg-gold/20" : "bg-card-border")} />}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.2 }}
          >
            {step === 1 ? (
              <Card className="text-left">
                <CardHeader 
                  title="Step 1: Identity Verification" 
                  subtitle="Please confirm the registered identity of the legacy owner."
                />
                <form onSubmit={handleVerifyIdentity}>
                  <CardContent className="space-y-4">
                    <Input
                      label="Owner's Full Name"
                      placeholder="John Doe"
                      value={vName}
                      onChange={(e) => setVName(e.target.value)}
                      required
                    />
                    <Input
                      label="Owner's Registered Email"
                      type="email"
                      placeholder="john@example.com"
                      value={vEmail}
                      onChange={(e) => setVEmail(e.target.value)}
                      required
                    />
                    <Input
                      label="Owner's Registered Phone"
                      placeholder="+1 (555) 000-0000"
                      value={vPhone}
                      onChange={(e) => setVPhone(e.target.value)}
                      required
                    />
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" variant="accent" className="w-full">
                      Verify Identity
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            ) : step === 2 ? (
              <Card className="text-left border-gold/50">
                <CardHeader 
                  title="Step 2: Wallet Verification" 
                  subtitle="Verify ownership of the registered beneficiary wallet."
                />
                <CardContent className="space-y-6">
                  <div className="p-4 bg-gold/5 border border-gold/20 rounded-xl space-y-4">
                    <p className="text-sm text-gray-400">
                      The owner has registered a wallet address for this legacy. Please connect and sign a message to prove ownership.
                    </p>
                    <div className="flex justify-center">
                      <ConnectButton />
                    </div>
                  </div>
                  
                  {isConnected && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2">
                      <div className="p-3 bg-white/5 border border-white/10 rounded-lg">
                        <p className="text-[10px] text-gray-500 uppercase font-bold mb-1">Connected Address</p>
                        <p className="text-xs font-mono text-gold truncate">{address}</p>
                      </div>
                      <Button 
                        onClick={handleVerifyWallet} 
                        variant="accent" 
                        className="w-full"
                        isLoading={signing}
                      >
                        Sign & Verify Ownership
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : step === 3 ? (
              <Card className="text-left">
                <CardHeader 
                  title="Step 3: Security Phrase" 
                  subtitle="Provide the personal confirmation phrase set by the owner."
                />
                <form onSubmit={handleVerifyPhrase}>
                  <CardContent>
                    <div className="space-y-4">
                      <p className="text-sm text-gray-400 leading-relaxed">
                        The owner set a secret phrase that only you should know. This is an additional layer of protection.
                      </p>
                      <Input
                        label="What is the confirmation phrase?"
                        placeholder="Enter the phrase exactly..."
                        value={vPhrase}
                        onChange={(e) => setVPhrase(e.target.value)}
                        required
                      />
                    </div>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" variant="accent" className="w-full">
                      Confirm Phrase
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            ) : step === 4 ? (
              <Card className="text-left">
                <CardHeader 
                  title="Step 4: Secure Verification" 
                  subtitle="Enter the 6-digit code sent to your email/phone."
                />
                <form onSubmit={handleVerifyOtp}>
                  <CardContent className="space-y-4">
                    <Input
                      label="Verification Code"
                      placeholder="000000"
                      maxLength={6}
                      value={otp}
                      onChange={(e) => setOtp(e.target.value)}
                      required
                      className="text-center text-2xl tracking-[0.5em] font-mono"
                    />
                    <p className="text-xs text-gray-500 mt-2 text-center">
                      * Click "Request OTP" first. Code is delivered via email to vault owner and expires after 15 minutes (5 attempts).
                    </p>
                  </CardContent>
                  <CardFooter>
                    <Button type="submit" variant="accent" className="w-full" isLoading={verifying}>
                      Verify OTP
                    </Button>
                  </CardFooter>
                </form>
              </Card>
            ) : step === 5 ? (
              <Card className="text-left border-yellow-500/30">
                <CardHeader 
                  title="Step 4: Trusted Contact Approval" 
                  subtitle="Phase 5 security check required."
                />
                <CardContent className="space-y-4">
                  <div className="flex items-center space-x-4 p-4 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
                    <div className="h-10 w-10 rounded-full bg-yellow-500/10 flex items-center justify-center shrink-0">
                      <Shield className="h-5 w-5 text-yellow-500" />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Pending Approval</p>
                      <p className="text-xs text-gray-400">Trusted contact: {userData?.trustedContact?.name} ({userData?.trustedContact?.email})</p>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-accent/5 border border-accent/10 rounded-lg">
                    <p className="text-sm text-gray-400 leading-relaxed">
                      A secure approval request has been sent to the trusted contact. Once they approve, you will be able to proceed with decryption.
                    </p>
                  </div>

                  <div className="pt-4">
                    <Button 
                      onClick={handleSimulateApproval} 
                      variant="outline" 
                      className="w-full border-yellow-500/50 text-yellow-500 hover:bg-yellow-500/10"
                      isLoading={approving}
                    >
                      Simulate Trusted Contact Approval (Demo)
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-8 text-left">
                {!decryptedSecret ? (
                  <Card>
                    <CardHeader 
                      title="Decrypt Legacy" 
                      subtitle="Provide the decryption password shared with you."
                    />
                    <form onSubmit={handleDecrypt}>
                      <CardContent>
                        <div className="p-4 bg-accent/5 border border-accent/10 rounded-lg flex items-start space-x-3 mb-6">
                          <Shield className="h-5 w-5 text-accent mt-0.5" />
                          <p className="text-sm text-accent/80">
                            The secret is encrypted with AES-256. You need the original password set by the owner to decrypt it.
                          </p>
                        </div>
                        <Input
                          label="Decryption Password"
                          type="password"
                          placeholder="••••••••"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                        />
                      </CardContent>
                      <CardFooter>
                        <Button type="submit" variant="accent" className="w-full" isLoading={decrypting}>
                          <Unlock className="mr-2 h-4 w-4" />
                          Decrypt & View Secret
                        </Button>
                      </CardFooter>
                    </form>
                  </Card>
                ) : (
                  <Card className="border-gold/50 shadow-gold/10">
                    <CardHeader 
                      title="Legacy Unlocked" 
                      subtitle="Your digital inheritance has been successfully decrypted."
                    />
                    <CardContent className="space-y-6">
                      {userData.videoUrl && (
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-gold uppercase tracking-[0.2em]">Video Message from Owner</p>
                          <div className="relative rounded-2xl overflow-hidden border border-gold/30 shadow-2xl bg-black">
                            <video 
                              src={userData.videoUrl} 
                              controls 
                              className="w-full aspect-video"
                            />
                          </div>
                        </div>
                      )}

                      {decryptedMessage && (
                        <div className="space-y-3">
                          <p className="text-xs font-bold text-gold uppercase tracking-[0.2em]">Message from Owner</p>
                          <div className="p-4 bg-gold/5 border border-gold/20 rounded-xl">
                            <p className="text-white text-sm leading-relaxed whitespace-pre-wrap">{decryptedMessage}</p>
                          </div>
                        </div>
                      )}

                      <div className="space-y-3">
                        <p className="text-xs font-bold text-gold uppercase tracking-[0.2em]">The Secured Secret</p>
                        <div className="relative group">
                          <div className="p-6 bg-card-border rounded-xl font-mono text-sm break-all min-h-[100px] border border-gold/20 flex items-center justify-center">
                            {showSecret ? (
                              <p className="text-gold-light text-center leading-relaxed whitespace-pre-wrap">{decryptedSecret}</p>
                            ) : (
                              <div className="flex flex-col items-center space-y-2 opacity-50">
                                <EyeOff className="h-8 w-8" />
                                <p className="uppercase tracking-widest text-xs">Data is Encrypted</p>
                              </div>
                            )}
                          </div>
                          <button
                            onClick={() => setShowSecret(!showSecret)}
                            className="absolute top-2 right-2 p-2 rounded-md bg-background/50 hover:bg-background transition-colors text-gray-400 hover:text-gold"
                          >
                            {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-2 text-sm text-gold bg-gold/10 p-3 rounded-lg border border-gold/20">
                        <CheckCircle2 className="h-4 w-4" />
                        <p>Successfully decrypted using AES-256 military-grade protocol.</p>
                      </div>
                    </CardContent>
                    <CardFooter>
                      <Button variant="outline" className="w-full" onClick={() => window.print()}>
                        Download/Print Legacy
                      </Button>
                    </CardFooter>
                  </Card>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-16 flex flex-col items-center justify-center space-y-4 opacity-50 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500">
          <div className="flex items-center space-x-6">
            <Shield className="h-8 w-8 text-accent" />
            <Lock className="h-8 w-8 text-accent" />
            <Unlock className="h-8 w-8 text-accent" />
          </div>
          <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-accent">Bank-Grade Security Protocol</p>
        </div>
      </motion.div>
    </div>
  );
}
