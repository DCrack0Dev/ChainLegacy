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

// --- Sub-components (Memoized) ---

const VaultStatusCard = React.memo(({ userData, onEditInterval }: { userData: any, onEditInterval: () => void }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const lastCheckInDate = useMemo(() => toJSDate(userData.lastCheckIn), [userData.lastCheckIn]);
  const interval = userData.interval || 30;
  const isTestMode = interval < 0.01;

  const triggerDate = useMemo(() => {
    if (isTestMode) {
      return addMinutes(lastCheckInDate, 1);
    }
    return addDays(lastCheckInDate, interval);
  }, [lastCheckInDate, interval, isTestMode]);

  const getTimeRemaining = useCallback(() => {
    if (isTestMode) {
      const diffMs = triggerDate.getTime() - currentTime.getTime();
      const diffSeconds = Math.max(0, Math.floor(diffMs / 1000));
      if (diffSeconds < 60) return `${diffSeconds} Sec`;
      return `${Math.floor(diffSeconds / 60)} Min`;
    }
    const daysLeft = differenceInDays(triggerDate, currentTime);
    return `${Math.max(0, daysLeft)} Days`;
  }, [triggerDate, currentTime, isTestMode]);

  const timeRemaining = getTimeRemaining();
  const status = userData.status || 'active';

  return (
    <Card className="h-full border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-500 group rounded-[2rem] overflow-hidden">
      <div className="p-8 space-y-8">
        <div className="flex items-center justify-between">
          <div className="h-12 w-12 rounded-2xl bg-gold/10 flex items-center justify-center border border-gold/20">
            <Lock className="h-6 w-6 text-gold" />
          </div>
          <button 
            onClick={onEditInterval}
            className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-gold transition-colors"
          >
            <Settings className="h-4 w-4" />
          </button>
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Vault Status</h3>
          <p className="text-3xl font-bold text-white tracking-tight">Fully Encrypted</p>
        </div>

        <div className="space-y-4 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 font-medium tracking-tight">Time to Trigger</span>
            <span className="text-gold font-bold tabular-nums">{timeRemaining}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 font-medium tracking-tight">Check-in Interval</span>
            <span className="text-white font-bold">{interval >= 1 ? `${interval} Days` : '1 Min'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 font-medium tracking-tight">Last Verified</span>
            <span className="text-white/80 font-medium">
              {formatDistanceToNow(lastCheckInDate, { addSuffix: true })}
            </span>
          </div>
        </div>

        <div className="pt-4">
          <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden">
            <motion.div 
              className="h-full bg-gold shadow-[0_0_10px_rgba(212,175,55,0.5)]"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 1.5 }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
});

const BeneficiaryCard = React.memo(({ beneficiaries }: { beneficiaries: any[] }) => {
  const primaryBeneficiary = beneficiaries?.[0];
  const totalBeneficiaries = beneficiaries?.length || 0;

  return (
    <Card className="h-full border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-500 group rounded-[2rem] overflow-hidden">
      <div className="p-8 space-y-8 text-left">
        <div className="flex items-center justify-between">
          <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center border border-primary/20">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <Link href="/dashboard/setup">
            <button className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-primary transition-colors">
              <Plus className="h-4 w-4" />
            </button>
          </Link>
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">
            {totalBeneficiaries > 1 ? 'Recipients' : 'Recipient'}
          </h3>
          <p className="text-3xl font-bold text-white tracking-tight">
            {totalBeneficiaries > 0 ? (totalBeneficiaries > 1 ? `${totalBeneficiaries} Registered` : primaryBeneficiary.name) : 'Not Registered'}
          </p>
        </div>

        <div className="space-y-4 pt-4 border-t border-white/5">
          {totalBeneficiaries > 0 ? (
            <div className="space-y-4">
              {beneficiaries.slice(0, 2).map((b, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="h-8 w-8 rounded-lg bg-white/5 flex items-center justify-center group-hover:bg-primary/10 transition-colors">
                      <span className="text-[10px] font-bold text-gray-400 group-hover:text-primary">{b.name.charAt(0)}</span>
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold text-white/80 group-hover:text-white transition-colors line-clamp-1">{b.name}</span>
                      <span className="text-[10px] text-gray-500 line-clamp-1">{b.email}</span>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-primary uppercase">{b.share || 0}%</span>
                </div>
              ))}
              {totalBeneficiaries > 2 && (
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest pl-11">
                  + {totalBeneficiaries - 2} More Beneficiaries
                </p>
              )}
              <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-widest text-gray-600 pt-2 border-t border-white/5">
                <span>Total Distribution</span>
                <span className="text-primary">100%</span>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500 italic">No beneficiary added yet</p>
          )}
        </div>
      </div>
    </Card>
  );
});

const ActivityCard = React.memo(({ userData }: { userData: any }) => {
  const events = [
    { 
      label: 'Check-in Verified', 
      date: toJSDate(userData.lastCheckIn), 
      icon: <CheckCircle2 className="h-3 w-3" />,
      color: 'text-gold'
    },
    { 
      label: 'Vault Configured', 
      date: toJSDate(userData.createdAt), 
      icon: <Lock className="h-3 w-3" />,
      color: 'text-primary'
    },
  ].filter(e => e.date).sort((a, b) => b.date.getTime() - a.date.getTime());

  return (
    <Card className="h-full border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-500 group rounded-[2rem] overflow-hidden">
      <div className="p-8 space-y-8 text-left">
        <div className="flex items-center justify-between">
          <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10">
            <Activity className="h-6 w-6 text-gray-400" />
          </div>
          <button className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white transition-colors">
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Timeline</h3>
          <p className="text-3xl font-bold text-white tracking-tight">Security Log</p>
        </div>

        <div className="space-y-6 pt-4 border-t border-white/5 relative before:absolute before:left-4 before:top-8 before:bottom-8 before:w-[1px] before:bg-white/5">
          {events.map((event, i) => (
            <div key={i} className="flex items-start space-x-4 relative">
              <div className={cn(
                "h-8 w-8 rounded-lg bg-card border border-white/5 flex items-center justify-center z-10",
                event.color
              )}>
                {event.icon}
              </div>
              <div className="pt-1">
                <p className="text-sm font-bold text-white tracking-tight">{event.label}</p>
                <p className="text-[10px] text-gray-500 font-medium">
                  {formatDistanceToNow(event.date, { addSuffix: true })}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
});

const IdentityCard = React.memo(({ userData }: { userData: any }) => (
  <Card className="border-white/5 bg-white/[0.01] rounded-[2rem] overflow-hidden group">
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-[0.3em]">Vault Identity</h3>
        <Shield className="h-4 w-4 text-gray-700 group-hover:text-gold transition-colors" />
      </div>
      
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-gold/20 transition-all duration-500">
            <span className="text-xl font-extrabold text-gold">{userData?.name?.charAt(0) || 'V'}</span>
          </div>
          <div>
            <p className="text-lg font-bold text-white tracking-tight">{userData?.name || 'Anonymous Vault'}</p>
            <p className="text-xs text-gray-500 font-medium tracking-tight uppercase">{userData?.email}</p>
          </div>
        </div>

        <div className="pt-6 border-t border-white/5 grid grid-cols-2 gap-4">
          <div className="space-y-1">
            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Protection Plan</p>
            <p className="text-xs font-bold text-white tracking-tight uppercase">
              {userData?.plan === 'legacy_elite' ? 'Legacy Elite' : 
               userData?.plan === 'premium' ? 'Premium' : 
               userData?.plan === 'pro' ? 'Pro' : 'Standard'}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Vault ID</p>
            <p className="text-xs font-mono text-gray-400">#CL-{userData?.uid?.slice(0, 6).toUpperCase()}</p>
          </div>
        </div>
      </div>
    </div>
  </Card>
));

const SecurityLogsCard = React.memo(({ logs }: { logs: any[] }) => (
  <Card className="border-white/5 bg-white/[0.01] rounded-[2rem] overflow-hidden">
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-[0.3em]">Security Audit</h3>
        <History className="h-4 w-4 text-gray-700" />
      </div>
      
      {logs && logs.length > 0 ? (
        <div className="space-y-4">
          {logs.slice().reverse().map((log: any, index: number) => (
            <div key={index} className="flex items-start justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 group hover:border-white/10 transition-colors">
              <div className="flex items-start space-x-4">
                <div className={cn(
                  "mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 shadow-[0_0_8px_rgba(255,255,255,0.2)]",
                  log.action.includes('triggered') ? "bg-red-500 shadow-red-500/50" : "bg-gold shadow-gold/50"
                )} />
                <div>
                  <p className="text-sm font-bold text-white/80 group-hover:text-white transition-colors">{log.details}</p>
                  <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-1">
                    {formatDistanceToNow(new Date(log.timestamp), { addSuffix: true })}
                  </p>
                </div>
              </div>
              <div className="text-[10px] font-mono text-gray-700 group-hover:text-gray-500 transition-colors">
                ID: {Math.random().toString(16).slice(2, 8).toUpperCase()}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <History className="h-10 w-10 text-gray-800 mb-4" />
          <p className="text-sm text-gray-600 font-medium">No audit logs found</p>
        </div>
      )}
    </div>
  </Card>
));

const DelayedReleaseBanner = React.memo(({ userData, onCancel }: { userData: any, onCancel: () => void }) => {
  const [timeLeft, setTimeLeft] = useState('');
  
  useEffect(() => {
    const timer = setInterval(() => {
      const releaseDate = userData.releasePendingStartedAt 
        ? (userData.interval < 0.01 
            ? addMinutes(toJSDate(userData.releasePendingStartedAt), 1)
            : addDays(toJSDate(userData.releasePendingStartedAt), 1)) // 24h delay
        : new Date();
      
      const diff = releaseDate.getTime() - new Date().getTime();
      if (diff <= 0) {
        setTimeLeft('Releasing now...');
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((diff % (1000 * 60)) / 1000);
        setTimeLeft(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [userData]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-12 p-8 rounded-[2.5rem] bg-red-500/10 border border-red-500/20 backdrop-blur-md relative overflow-hidden"
    >
      <div className="absolute top-0 right-0 p-8 opacity-5">
        <ShieldAlert className="h-32 w-32 text-red-500" />
      </div>
      
      <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-8">
        <div className="flex items-center space-x-6 text-left">
          <div className="h-16 w-16 rounded-2xl bg-red-500/20 flex items-center justify-center border border-red-500/30 animate-pulse">
            <Clock className="h-8 w-8 text-red-500" />
          </div>
          <div>
            <h2 className="text-2xl font-extrabold text-white tracking-tight mb-1 uppercase">Inheritance Release in Progress</h2>
            <p className="text-red-400 font-bold uppercase tracking-widest text-xs">Security Delay Active: {timeLeft}</p>
          </div>
        </div>
        
        <Button 
          variant="secondary"
          onClick={onCancel}
          className="bg-white text-black hover:bg-white/90 font-extrabold px-8 py-4 rounded-2xl shadow-xl transition-all hover:scale-105 active:scale-95 uppercase tracking-widest text-xs"
        >
          Cancel Trigger & Reset Vault
        </Button>
      </div>
    </motion.div>
  );
});

const SimulationModal = React.memo(({ isOpen, onClose, userData }: any) => {
  const [step, setStep] = useState(0);
  const steps = [
    { title: 'Trigger Event', desc: 'Missed check-in detected by system.', icon: <Play className="h-6 w-6" /> },
    { title: 'Email Sent', desc: 'Secure claim link sent to beneficiary.', icon: <Send className="h-6 w-6" /> },
    { title: 'Verification', desc: 'Beneficiary identity & phrase verified.', icon: <Shield className="h-6 w-6" /> },
    { title: 'Approval', desc: 'Trusted contact confirms the release.', icon: <CheckCircle2 className="h-6 w-6" /> },
    { title: 'Unlock', desc: 'Vault decrypted using your secure password.', icon: <Unlock className="h-6 w-6" /> },
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/90 backdrop-blur-md" />
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="relative w-full max-w-2xl bg-card border border-white/10 rounded-[3rem] p-12 shadow-2xl overflow-hidden text-center">
        <div className="absolute top-0 right-0 p-12 opacity-5">
          <Play className="h-48 w-48 text-gold" />
        </div>

        <div className="relative z-10 space-y-12">
          <div className="space-y-4">
            <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full border border-gold/20 bg-gold/5">
              <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold">Simulation Mode</span>
            </div>
            <h2 className="text-4xl font-extrabold text-white tracking-tight uppercase">Test Your Legacy Plan</h2>
            <p className="text-gray-500 max-w-md mx-auto font-medium">See exactly what happens when your inheritance plan is triggered.</p>
          </div>

          <div className="grid grid-cols-5 gap-4 relative">
            <div className="absolute top-6 left-8 right-8 h-[2px] bg-white/5" />
            {steps.map((s, i) => (
              <div key={i} className="relative space-y-4">
                <div className={cn(
                  "h-12 w-12 rounded-2xl mx-auto flex items-center justify-center border transition-all duration-500",
                  step >= i ? "bg-gold border-gold text-black shadow-lg shadow-gold/20" : "bg-white/5 border-white/5 text-gray-600"
                )}>
                  {s.icon}
                </div>
                <p className={cn(
                  "text-[10px] font-bold uppercase tracking-widest",
                  step >= i ? "text-gold" : "text-gray-600"
                )}>{s.title}</p>
              </div>
            ))}
          </div>

          <div className="p-8 rounded-[2rem] bg-white/[0.02] border border-white/5 min-h-[120px] flex items-center justify-center">
            <div className="space-y-2">
              <p className="text-lg font-bold text-white uppercase tracking-tight">{steps[step].title}</p>
              <p className="text-sm text-gray-500 font-medium">{steps[step].desc}</p>
            </div>
          </div>

          <div className="flex space-x-4">
            <Button variant="secondary" className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs" onClick={onClose}>Close Simulation</Button>
            {step < steps.length - 1 ? (
              <Button variant="accent" className="flex-1 bg-gold hover:bg-gold-dark text-black rounded-2xl h-14 font-bold uppercase tracking-widest text-xs shadow-lg shadow-gold/20" onClick={() => setStep(step + 1)}>Next Step</Button>
            ) : (
              <Button variant="accent" className="flex-1 bg-green-500 hover:bg-green-600 text-black rounded-2xl h-14 font-bold uppercase tracking-widest text-xs" onClick={() => setStep(0)}>Restart</Button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
});

const SecurityOverview = React.memo(({ userData }: { userData: any }) => {
  return (
    <div className="inline-flex items-center space-x-2 px-4 py-1.5 rounded-full border border-gold/20 bg-gold/5 backdrop-blur-md">
      <div className="h-1.5 w-1.5 rounded-full bg-gold animate-pulse shadow-[0_0_8px_rgba(212,175,55,0.8)]" />
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-gold/90">System Status: Active</span>
    </div>
  );
});

const EditIntervalModal = React.memo(({ isOpen, onClose, currentInterval, onUpdate, isUpdating, error, newInterval, setNewInterval, password, setPassword }: any) => {
  if (!isOpen) return null;
  
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-md bg-card border border-white/10 rounded-[2.5rem] p-8 shadow-2xl overflow-hidden"
      >
        <div className="absolute top-0 right-0 p-8 opacity-5">
          <Settings className="h-32 w-32 text-gold" />
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h3 className="text-2xl font-extrabold text-white tracking-tight mb-2">Vault Settings</h3>
            <p className="text-sm text-gray-500 font-medium">Configure your inheritance trigger interval.</p>
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-500 text-xs font-bold uppercase tracking-widest flex items-center space-x-3">
              <AlertTriangle className="h-4 w-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="space-y-6">
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">
                  Trigger Interval {parseFloat(newInterval) < 0.01 ? '(1-Min Test Mode)' : '(Days)'}
                </label>
                {parseFloat(newInterval) >= 0.01 ? (
                  <button 
                    onClick={() => setNewInterval('0.001')}
                    className="text-[8px] font-black text-gold/60 uppercase tracking-widest hover:text-gold transition-colors"
                  >
                    Enable Test Mode
                  </button>
                ) : (
                  <button 
                    onClick={() => setNewInterval('30')}
                    className="text-[8px] font-black text-red-500/60 uppercase tracking-widest hover:text-red-500 transition-colors"
                  >
                    Disable Test Mode
                  </button>
                )}
              </div>
              <Input
                type="number"
                min="1"
                placeholder="30"
                value={parseFloat(newInterval) < 0.01 ? '' : newInterval}
                onChange={(e) => setNewInterval(e.target.value)}
                disabled={parseFloat(newInterval) < 0.01}
                className={cn("bg-white/5 border-white/5 rounded-2xl h-14 font-bold text-white focus:border-gold/50 transition-all", parseFloat(newInterval) < 0.01 && "opacity-50")}
              />
              <p className="text-[10px] text-gray-600 italic">
                {parseFloat(newInterval) < 0.01 
                  ? "Test mode: Vault will progress every minute for verification." 
                  : "Minimum 1 day. Determines how long before liveness checks start."}
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-bold text-gray-600 uppercase tracking-widest">Verify Encryption Password</label>
              <Input
                type="password"
                placeholder="Enter password to confirm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="bg-white/5 border-white/5 rounded-2xl h-14 font-bold text-white focus:border-gold/50 transition-all"
              />
            </div>
          </div>

          <div className="flex space-x-3 pt-4">
            <Button
              variant="secondary"
              className="flex-1 rounded-2xl h-14 font-bold uppercase tracking-widest text-xs"
              onClick={onClose}
              disabled={isUpdating}
            >
              Cancel
            </Button>
            <Button
              variant="accent"
              className="flex-1 bg-gold hover:bg-gold-dark text-black rounded-2xl h-14 font-bold uppercase tracking-widest text-xs shadow-lg shadow-gold/20"
              onClick={onUpdate}
              isLoading={isUpdating}
            >
              Update Vault
            </Button>
          </div>
        </div>
      </motion.div>
    </div>
  );
});

const WalletCard = React.memo(() => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { address, isConnected } = useAccount();
  const { data: balance, isLoading, isError } = useBalance({
    address: address,
  });

  if (!mounted) {
    return (
      <Card className="h-full border-white/5 bg-white/[0.02] rounded-[2rem] overflow-hidden flex items-center justify-center">
        <div className="h-12 w-12 border-2 border-gold/20 border-t-gold rounded-full animate-spin" />
      </Card>
    );
  }

  if (!isConnected) {
    return (
      <Card className="h-full border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-500 group rounded-[2rem] overflow-hidden flex items-center justify-center">
        <div className="p-8 text-center space-y-4">
          <div className="h-12 w-12 rounded-2xl bg-white/5 flex items-center justify-center border border-white/10 mx-auto">
            <Wallet className="h-6 w-6 text-gray-500" />
          </div>
          <div>
            <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Web3 Identity</p>
            <p className="text-white/60 text-xs">Connect wallet to view assets</p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card className="h-full border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all duration-500 group rounded-[2rem] overflow-hidden">
      <div className="p-8 space-y-8 text-left">
        <div className="flex items-center justify-between">
          <div className="h-12 w-12 rounded-2xl bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
            <Wallet className="h-6 w-6 text-blue-400" />
          </div>
          <div className="px-3 py-1 rounded-full bg-green-500/10 border border-green-500/20">
            <span className="text-[10px] font-bold text-green-500 uppercase tracking-widest">Connected</span>
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-widest mb-1">Active Wallet</h3>
          <p className="text-xl font-mono font-bold text-white tracking-tight break-all">
            {address?.slice(0, 6)}...{address?.slice(-4)}
          </p>
        </div>

        <div className="space-y-4 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 font-medium tracking-tight">Balance</span>
            <span className="text-white font-bold tabular-nums">
              {isLoading ? (
                <span className="opacity-50 animate-pulse">0.0000 ETH</span>
              ) : isError ? (
                <span className="text-red-500/50">Error</span>
              ) : (
                `${balance?.formatted ? parseFloat(balance.formatted).toFixed(4) : '0.0000'} ${balance?.symbol || 'ETH'}`
              )}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 font-medium tracking-tight">Network</span>
            <span className="text-white/80 font-medium uppercase tracking-widest text-[10px]">
              Ethereum Mainnet
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
});

SecurityOverview.displayName = 'SecurityOverview';
EditIntervalModal.displayName = 'EditIntervalModal';
VaultStatusCard.displayName = 'VaultStatusCard';
BeneficiaryCard.displayName = 'BeneficiaryCard';
ActivityCard.displayName = 'ActivityCard';
IdentityCard.displayName = 'IdentityCard';
SecurityLogsCard.displayName = 'SecurityLogsCard';

const RecentDevicesCard = React.memo(({ sessions }: { sessions: any[] }) => (
  <Card className="border-white/5 bg-white/[0.01] rounded-[2rem] overflow-hidden">
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h3 className="text-xs font-bold text-gray-600 uppercase tracking-[0.3em]">Recent Devices</h3>
        <Smartphone className="h-4 w-4 text-gray-700" />
      </div>
      
      {sessions && sessions.length > 0 ? (
        <div className="space-y-4">
          {sessions.slice(-3).reverse().map((session: any, index: number) => (
            <div key={index} className="flex items-center justify-between p-4 rounded-2xl bg-white/[0.02] border border-white/5 group hover:border-white/10 transition-colors">
              <div className="flex items-center space-x-4">
                <div className="h-10 w-10 rounded-xl bg-white/5 flex items-center justify-center border border-white/10 group-hover:border-gold/20 transition-all">
                  <Smartphone className="h-5 w-5 text-gray-500 group-hover:text-gold" />
                </div>
                <div>
                  <p className="text-sm font-bold text-white/80 group-hover:text-white transition-colors">{session.os} • {session.browser}</p>
                  <p className="text-[10px] text-gray-600 font-bold uppercase tracking-widest mt-1">
                    {session.ip} • {formatDistanceToNow(new Date(session.timestamp), { addSuffix: true })}
                  </p>
                </div>
              </div>
              {index === 0 && (
                <div className="px-2 py-1 rounded-md bg-green-500/10 border border-green-500/20">
                  <span className="text-[8px] font-bold text-green-500 uppercase tracking-widest">Current</span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Smartphone className="h-10 w-10 text-gray-800 mb-4" />
          <p className="text-sm text-gray-600 font-medium">No session data found</p>
        </div>
      )}
    </div>
  </Card>
));
RecentDevicesCard.displayName = 'RecentDevicesCard';

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
