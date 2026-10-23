'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { doc, updateDoc, serverTimestamp, onSnapshot, arrayUnion } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cn, toJSDate } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { Navbar } from '@/components/ui/Navbar';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/Card';
import { Shield, Clock, Heart, Users, AlertTriangle, Edit2, X, Lock, History, MessageSquare, Activity, CheckCircle2, Eye, EyeOff, Settings, Plus, ArrowRight, Wallet, Download, Play, ShieldAlert, Trash2, Send, Unlock, Smartphone, Zap } from 'lucide-react';
import { formatDistanceToNow, addDays, addMinutes, isAfter, differenceInDays, format } from 'date-fns';
import { decrypt } from '@/lib/encryption';
import { Input } from '@/components/ui/Input';
import { ConfirmationModal } from '@/components/ui/ConfirmationModal';
import { motion, AnimatePresence } from 'framer-motion';
import { useAccount, useBalance } from 'wagmi';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import {
  VaultStatusCard, BeneficiaryCard, ActivityCard, IdentityCard, SecurityLogsCard,
  DelayedReleaseBanner, SimulationModal, SecurityOverview, EditIntervalModal,
  WalletCard, RecentDevicesCard,
} from '@/components/dashboard/DashboardCards';

export default function DashboardPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  
  const [userData, setUserData] = useState<any>(null);
  const [vaultData, setVaultData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [userLoaded, setUserLoaded] = useState(false);
  const [vaultLoaded, setVaultLoaded] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [showCheckInConfirm, setShowCheckInConfirm] = useState(false);
  const [isSimulationOpen, setIsSimulationOpen] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

  // Edit Interval States
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [newInterval, setNewInterval] = useState('30');
  const [password, setPassword] = useState('');
  const [editError, setEditError] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
      return;
    }

    if (user) {
      console.log('Dashboard: Starting data fetch for', user.uid);
      
      // Fetch both user and vault data
      const unsubUser = onSnapshot(doc(db, 'users', user.uid), (userDoc) => {
        console.log('Dashboard: User doc received', userDoc.exists());
        if (userDoc.exists()) {
          const data = userDoc.data();
          setUserData(data);
          setUserLoaded(true);
          
          if (!data.hasSetup) {
            console.log('Dashboard: No setup found, redirecting...');
            router.push('/dashboard/setup');
          }
        } else {
          setUserLoaded(true);
        }
      }, (error) => {
        console.error('Dashboard: User snapshot error', error);
        setUserLoaded(true);
      });

      const unsubVault = onSnapshot(doc(db, 'vaults', user.uid), (vaultDoc) => {
        console.log('Dashboard: Vault doc received', vaultDoc.exists());
        if (vaultDoc.exists()) {
          setVaultData(vaultDoc.data());
        } else {
          console.warn('Dashboard: Vault document missing for user', user.uid);
          setVaultData({
            contacts: [],
            status: 'active',
            lastCheckIn: Date.now(),
            interval: 30
          });
        }
        setVaultLoaded(true);
      }, (error) => {
        console.error('Dashboard: Vault snapshot error', error);
        setVaultLoaded(true);
      });

      return () => {
        unsubUser();
        unsubVault();
      };
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    if (userLoaded && vaultLoaded) {
      setLoading(false);
    }
  }, [userLoaded, vaultLoaded]);

  // STEP 4: FORCE UI TO USE VAULT ONLY (Derived state moved up to fix ReferenceError)
  const activeVault = useMemo(() => vaultData || {
    contacts: [],
    status: 'active',
    lastCheckIn: Date.now(),
    interval: 30,
    createdAt: Date.now()
  }, [vaultData]);

  const currentPlan = useMemo(() => userData?.plan || 'free', [userData]);
  const isProMember = useMemo(() => currentPlan !== 'free', [currentPlan]);

  const handleCheckIn = useCallback(async () => {
    if (!user) return;
    setShowCheckInConfirm(true);
  }, [user]);

  const confirmCheckIn = useCallback(async () => {
    if (!user) return;
    setShowCheckInConfirm(false);
    setCheckingIn(true);
    const now = Date.now();
    try {
      // Update both user (for status/logs) and vault (for lastCheckIn)
      await updateDoc(doc(db, 'users', user.uid), {
        updatedAt: serverTimestamp(),
        logs: arrayUnion({
          action: 'presence_verified',
          timestamp: new Date().toISOString(),
          details: 'User verified presence. Inactivity timer reset.'
        })
      });
      
      await updateDoc(doc(db, 'vaults', user.uid), {
        lastCheckIn: now,
        status: 'active',
        updatedAt: now
      });
    } catch (error) {
      console.error('Check-in error', error);
    } finally {
      setCheckingIn(false);
    }
  }, [user]);

  const handleDownloadProof = useCallback(async () => {
    if (!userData || !activeVault) return;
    setIsGeneratingPdf(true);
    
    try {
      const doc = new jsPDF('p', 'mm', 'a4');
      const pageWidth = doc.internal.pageSize.getWidth();
      const pageHeight = doc.internal.pageSize.getHeight();
      
      // 1. STYLED BACKGROUND (Luxury Dark Theme)
      doc.setFillColor(10, 10, 12); // Deeper Black/Navy
      doc.rect(0, 0, pageWidth, pageHeight, 'F');

      // 2. BORDER (Gold Frame)
      doc.setDrawColor(212, 175, 55);
      doc.setLineWidth(1.5);
      doc.rect(10, 10, pageWidth - 20, pageHeight - 20);
      doc.setLineWidth(0.5);
      doc.rect(12, 12, pageWidth - 24, pageHeight - 24);

      // 3. BRANDING & LOGO (ChainLegacy)
      try {
        const logoImg = new Image();
        logoImg.src = '/logo.png';
        await new Promise((resolve, reject) => {
          logoImg.onload = resolve;
          logoImg.onerror = reject;
        });
        doc.addImage(logoImg, 'PNG', 25, 25, 18, 18);
      } catch (e) {
        console.warn('Logo load failed');
      }

      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(22);
      doc.text('ChainLegacy', 48, 38);
      
      // 4. HEADER TITLE
      doc.setTextColor(212, 175, 55); // Gold
      doc.setFont('times', 'bold'); // Serif style for legal feel
      doc.setFontSize(32);
      doc.text('DIGITAL ASSET INHERITANCE', pageWidth / 2, 75, { align: 'center' });
      doc.setFontSize(24);
      doc.text('CERTIFICATE', pageWidth / 2, 88, { align: 'center' });

      doc.setTextColor(100, 100, 100);
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(10);
      doc.text('Securing Your Digital Legacy Beyond Time', pageWidth / 2, 98, { align: 'center' });

      // 5. DATA VALIDATION & RENDERING
      let y = 120;
      const drawField = (label: string, value: string, isBadge: boolean = false) => {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(150, 150, 150);
        doc.setFontSize(9);
        doc.text(label.toUpperCase(), 35, y);

        if (isBadge) {
          const isTriggered = activeVault.status === 'triggered';
          doc.setFillColor(isTriggered ? 150 : 20, isTriggered ? 20 : 150, 20); // Red or Green
          doc.roundedRect(35, y + 3, 45, 8, 2, 2, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(8);
          doc.text(value.toUpperCase(), 57.5, y + 8.5, { align: 'center' });
        } else {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(12);
          doc.text(value || 'NOT CONFIGURED', 35, y + 10);
        }
        y += 25;
      };

      const vaultOwner = userData.name || 'ANONYMOUS OWNER';
      const vaultEmail = userData.email || 'NOT PROVIDED';
      const intervalStr = activeVault.interval ? `${activeVault.interval} DAYS` : 'NOT CONFIGURED';
      const statusText = activeVault.status === 'triggered' ? 'INHERITANCE RELEASED' : 'ACTIVE & PROTECTED';
      
      drawField('Vault Owner', vaultOwner);
      drawField('Account Email', vaultEmail);
      drawField('Protection Status', statusText, true);
      drawField('Check-in Interval', intervalStr);
      drawField('Secured Date', format(toJSDate(activeVault.createdAt), 'PPPP'));

      // 6. BENEFICIARIES LIST
      y = 120;
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(150, 150, 150);
      doc.setFontSize(9);
      doc.text('REGISTERED BENEFICIARIES', 115, y);
      
      const beneficiaries = activeVault.contacts?.filter((c: any) => c.role === 'beneficiary') || [];
      if (beneficiaries.length > 0) {
        beneficiaries.forEach((b: any, i: number) => {
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(10);
          doc.text(`${i + 1}. ${b.name}`, 115, y + 10 + (i * 12));
          doc.setFontSize(8);
          doc.setTextColor(100, 100, 100);
          doc.text(`${b.email} (${b.share || 0}%)`, 115, y + 15 + (i * 12));
        });
      } else {
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'italic');
        doc.text('NOT ASSIGNED', 115, y + 10);
      }

      // 7. TRUST ELEMENTS & SEAL
      // Circular Seal
      doc.setDrawColor(212, 175, 55);
      doc.setFillColor(212, 175, 55, 0.05);
      doc.circle(pageWidth - 45, pageHeight - 65, 20, 'FD');
      doc.setFontSize(6);
      doc.setTextColor(212, 175, 55);
      doc.text('VERIFIED & SECURED', pageWidth - 45, pageHeight - 68, { align: 'center' });
      doc.text('CHAINLEGACY', pageWidth - 45, pageHeight - 64, { align: 'center' });
      doc.text('PROTOCOL V3', pageWidth - 45, pageHeight - 60, { align: 'center' });

      // Signature Line
      doc.setDrawColor(50, 50, 50);
      doc.line(35, pageHeight - 45, 95, pageHeight - 45);
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(8);
      doc.text('Authorized by ChainLegacy Secure Protocol', 35, pageHeight - 40);

      // Security Badge
      doc.setFillColor(20, 20, 20);
      doc.roundedRect(pageWidth - 100, pageHeight - 48, 65, 12, 2, 2, 'F');
      doc.setTextColor(212, 175, 55);
      doc.setFont('helvetica', 'bold');
      doc.text('ZERO-KNOWLEDGE ENCRYPTED', pageWidth - 67.5, pageHeight - 40, { align: 'center' });

      // 8. VERIFICATION BLOCK (FOOTER)
      doc.setTextColor(80, 80, 80);
      doc.setFontSize(7);
      const verificationText = "This certificate verifies that the above digital estate is secured under the ChainLegacy Zero-Knowledge Protocol. Access is governed by cryptographic verification and multi-party consensus.";
      doc.text(doc.splitTextToSize(verificationText, pageWidth - 70), pageWidth / 2, pageHeight - 25, { align: 'center' });

      doc.setFontSize(8);
      doc.text(`Vault ID: #CL-${user?.uid.toUpperCase()} | Generated: ${format(new Date(), 'PPpp')}`, pageWidth / 2, pageHeight - 15, { align: 'center' });

      doc.save(`ChainLegacy_Certificate_${user?.uid.slice(0, 8)}.pdf`);
    } catch (error) {
      console.error('PDF generation error', error);
    } finally {
      setIsGeneratingPdf(false);
    }
  }, [userData, activeVault, user]);

  const handleUpdateInterval = useCallback(async () => {
    if (!user || !userData) return;
    setEditError('');
    setIsUpdating(true);

    // Offload heavy decryption check
    setTimeout(async () => {
      try {
        if (userData.lastIntervalUpdate) {
          const lastUpdate = toJSDate(userData.lastIntervalUpdate);
          const daysSinceUpdate = differenceInDays(new Date(), lastUpdate);
          if (daysSinceUpdate < 18) {
            throw new Error(`You can only update your interval once every 18 days. ${18 - daysSinceUpdate} days remaining.`);
          }
        }

        try {
          decrypt(userData.encryptedSecret, password);
        } catch (err) {
          throw new Error('Incorrect password. Please enter the master password used to encrypt this vault.');
        }

        await updateDoc(doc(db, 'users', user.uid), {
          lastIntervalUpdate: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        await updateDoc(doc(db, 'vaults', user.uid), {
          interval: parseFloat(newInterval),
          lastCheckIn: Date.now(),
          status: 'active',
          updatedAt: Date.now(),
        });

        setIsEditModalOpen(false);
        setPassword('');
      } catch (err: any) {
        setEditError(err.message);
      } finally {
        setIsUpdating(false);
      }
    }, 50);
  }, [user, userData, newInterval, password]);

  const openEditModal = useCallback(() => {
    if (userData) {
      setNewInterval((userData.interval || 30).toString());
      setIsEditModalOpen(true);
    }
  }, [userData]);

  if (authLoading || loading) return (
    <div className="min-h-screen bg-black">
      <Navbar />
      <div className="mx-auto max-w-7xl px-6 pt-12">
        <div className="h-64 w-full bg-white/[0.03] rounded-[3rem] animate-pulse mb-16" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 mb-16">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-64 bg-white/[0.02] rounded-[2rem] animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <div className="h-96 bg-white/[0.02] rounded-[2rem] animate-pulse" />
            <div className="h-48 bg-white/[0.02] rounded-[2rem] animate-pulse" />
          </div>
          <div className="lg:col-span-3 space-y-8">
            <div className="h-96 bg-white/[0.02] rounded-[2rem] animate-pulse" />
            <div className="h-48 bg-white/[0.02] rounded-[2rem] animate-pulse" />
          </div>
        </div>
      </div>
    </div>
  );
  if (!userData) {
    console.error('Dashboard: User data missing for UID:', user?.uid);
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-white/10 bg-white/[0.02] p-8 text-center rounded-[2rem]">
          <AlertTriangle className="h-12 w-12 text-gold mx-auto mb-6" />
          <h2 className="text-2xl font-bold text-white mb-4">Account Not Found</h2>
          <p className="text-gray-400 mb-8 font-medium">We couldn't retrieve your account information. Please try logging in again.</p>
          <Button 
            variant="accent" 
            className="w-full bg-gold text-black rounded-2xl h-14 font-bold uppercase tracking-widest"
            onClick={() => router.push('/login')}
          >
            Go to Login
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black pb-20 selection:bg-gold selection:text-black">
      <AnimatePresence>
        {isSimulationOpen && (
          <SimulationModal
            isOpen={isSimulationOpen}
            onClose={() => setIsSimulationOpen(false)}
            userData={{ ...userData, ...activeVault }}
          />
        )}
        {isEditModalOpen && (
          <EditIntervalModal
            isOpen={isEditModalOpen}
            onClose={() => setIsEditModalOpen(false)}
            onUpdate={handleUpdateInterval}
            isUpdating={isUpdating}
            error={editError}
            newInterval={newInterval}
            setNewInterval={setNewInterval}
            password={password}
            setPassword={setPassword}
          />
        )}
      </AnimatePresence>

      <ConfirmationModal
        isOpen={showCheckInConfirm}
        onClose={() => setShowCheckInConfirm(false)}
        onConfirm={confirmCheckIn}
        title="Confirm Protection"
        description="Your vault remains secured. This action resets the inheritance trigger sequence."
        confirmText="Confirm Presence"
        variant="gold"
      />
      <Navbar />
      
      <div className="mx-auto max-w-7xl px-6 pt-12">
        {activeVault.status === 'warning' && (
          <DelayedReleaseBanner userData={{ ...userData, ...activeVault }} onCancel={handleCheckIn} />
        )}

        {/* Hero Section */}
        <div className="relative mb-16 overflow-hidden rounded-[3rem] bg-gradient-to-b from-white/[0.05] to-transparent p-12 border border-white/[0.05]">
          <div className="absolute top-0 right-0 p-12 opacity-5">
            <Shield className="h-48 w-48 text-gold" />
          </div>
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-8">
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <SecurityOverview userData={{ ...userData, ...activeVault }} />
                <Link href="/pricing">
                  <div className={cn(
                    "inline-flex items-center space-x-2 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest transition-all",
                    isProMember 
                      ? "border-gold/30 bg-gold/10 text-gold shadow-[0_0_15px_rgba(212,175,55,0.2)]" 
                      : "border-white/10 bg-white/5 text-gray-500 hover:text-white hover:border-white/20"
                  )}>
                    <Zap className={cn("h-2.5 w-2.5", isProMember ? "text-gold" : "text-gray-600")} />
                    <span>{currentPlan === 'legacy_elite' ? 'Legacy Elite' : 
                           currentPlan === 'premium' ? 'Premium Active' : 
                           currentPlan === 'pro' ? 'Pro Member' : 'Free Plan'}</span>
                  </div>
                </Link>
              </div>
              <h1 className="text-5xl font-extrabold text-white tracking-tighter sm:text-6xl">
                Your legacy is <span className="text-gold">protected.</span>
              </h1>
              <p className="text-lg text-gray-500 font-medium max-w-lg leading-relaxed">
                Military-grade encryption securing your assets for the next generation.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              {currentPlan !== 'legacy_elite' && (
                <Link href="/pricing">
                  <Button className="bg-white/5 hover:bg-white/10 text-white font-bold px-6 py-6 rounded-2xl border border-white/10 transition-all uppercase tracking-widest text-[10px]">
                    {isProMember ? 'Upgrade Plan' : 'Upgrade to Pro'}
                  </Button>
                </Link>
              )}
              <Button 
                onClick={handleCheckIn}
                disabled={checkingIn}
                className="bg-gold hover:bg-gold-dark text-black font-extrabold px-8 py-6 rounded-2xl shadow-[0_0_30px_rgba(212,175,55,0.2)] transition-all hover:scale-105 active:scale-95 uppercase tracking-widest text-xs"
              >
                {checkingIn ? 'Verifying...' : "I'm Alive & Well"}
              </Button>
            </div>
          </div>
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-8 mb-16">
          <VaultStatusCard userData={{ ...userData, ...activeVault }} onEditInterval={openEditModal} />
          <BeneficiaryCard beneficiaries={activeVault.contacts?.filter((c: any) => c.role === 'beneficiary') || []} />
          <WalletCard />
          <ActivityCard userData={{ ...userData, ...activeVault }} />
        </div>

        {/* Quick Actions & More */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-1 space-y-8">
            <div className="space-y-4">
              <h3 className="text-xs font-bold text-gray-600 uppercase tracking-[0.3em] mb-6">Quick Actions</h3>
              <button 
                onClick={() => setIsSimulationOpen(true)}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-gold/5 border border-gold/10 hover:bg-gold/10 hover:border-gold/30 transition-all group"
              >
                <div className="flex items-center space-x-3">
                  <Play className="h-4 w-4 text-gold" />
                  <span className="text-sm font-bold text-white/80 group-hover:text-white">Test My Plan</span>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-700 group-hover:text-gold transition-colors" />
              </button>
              
              <button 
                onClick={handleDownloadProof}
                disabled={isGeneratingPdf}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-gold/20 transition-all group disabled:opacity-50"
              >
                <div className="flex items-center space-x-3">
                  <Download className="h-4 w-4 text-gold" />
                  <span className="text-sm font-bold text-white/80 group-hover:text-white">
                    {isGeneratingPdf ? 'Generating...' : 'Download Proof'}
                  </span>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-700 group-hover:text-gold transition-colors" />
              </button>

              <Link href="/dashboard/setup" className="block">
                <button className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-gold/20 transition-all group">
                  <div className="flex items-center space-x-3">
                    <Plus className="h-4 w-4 text-gold" />
                    <span className="text-sm font-bold text-white/80 group-hover:text-white">Add Beneficiary</span>
                  </div>
                  <ArrowRight className="h-4 w-4 text-gray-700 group-hover:text-gold transition-colors" />
                </button>
              </Link>

              <button 
                onClick={openEditModal}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.05] hover:border-gold/20 transition-all group"
              >
                <div className="flex items-center space-x-3">
                  <Settings className="h-4 w-4 text-gold" />
                  <span className="text-sm font-bold text-white/80 group-hover:text-white">Vault Settings</span>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-700 group-hover:text-gold transition-colors" />
              </button>
            </div>

            <IdentityCard userData={{ ...userData, ...activeVault }} />
          </div>

          <div className="lg:col-span-3 space-y-8">
            <SecurityLogsCard logs={userData.logs || []} />
            <RecentDevicesCard sessions={userData.sessions || []} />
          </div>
        </div>
      </div>
    </div>
  );
}
