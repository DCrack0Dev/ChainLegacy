'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Navbar } from '@/components/ui/Navbar';
import { Button } from '@/components/ui/Button';
import { Shield, Clock, AlertTriangle, Send, Mail, Smartphone, CheckCircle2, Lock, Unlock } from 'lucide-react';
import { cn } from '@/lib/utils';

type SimulationState = 'ACTIVE' | 'WARNING' | 'GRACE' | 'TRIGGERED' | 'RELEASED';

export default function SimulatorPage() {
  const [day, setDay] = useState(0);
  const [state, setState] = useState<SimulationState>('ACTIVE');
  const [isAutoPlaying, setIsAutoPlaying] = useState(false);

  const stages = [
    { id: 'ACTIVE', minDay: 0, icon: <Shield className="h-5 w-5" />, title: "Vault Active", color: "text-green-500", bg: "bg-green-500/10" },
    { id: 'WARNING', minDay: 30, icon: <Mail className="h-5 w-5" />, title: "Warning Phase", color: "text-yellow-500", bg: "bg-yellow-500/10" },
    { id: 'GRACE', minDay: 40, icon: <Smartphone className="h-5 w-5" />, title: "Grace Period", color: "text-orange-500", bg: "bg-orange-500/10" },
    { id: 'TRIGGERED', minDay: 45, icon: <AlertTriangle className="h-5 w-5" />, title: "Protocol Triggered", color: "text-red-500", bg: "bg-red-500/10" },
    { id: 'RELEASED', minDay: 46, icon: <Unlock className="h-5 w-5" />, title: "Legacy Released", color: "text-gold", bg: "bg-gold/10" }
  ];

  useEffect(() => {
    let interval: any;
    if (isAutoPlaying && day < 50) {
      interval = setInterval(() => {
        setDay(prev => prev + 1);
      }, 200);
    }
    return () => clearInterval(interval);
  }, [isAutoPlaying, day]);

  useEffect(() => {
    if (day >= 46) setState('RELEASED');
    else if (day >= 45) setState('TRIGGERED');
    else if (day >= 40) setState('GRACE');
    else if (day >= 30) setState('WARNING');
    else setState('ACTIVE');
  }, [day]);

  const resetSimulation = () => {
    setDay(0);
    setState('ACTIVE');
    setIsAutoPlaying(false);
  };

  return (
    <div className="min-h-screen bg-black">
      <Navbar />
      
      <main className="container mx-auto px-6 pt-20 pb-32">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16">
            <span className="text-[10px] font-black uppercase tracking-[0.5em] text-gold mb-4 block">Interactive Demo</span>
            <h1 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tight mb-6">Inheritance <span className="text-gold italic">Simulator</span></h1>
            <p className="text-gray-400 text-lg max-w-xl mx-auto">
              Experience the liveness protocol in real-time. See how ChainLegacy protects your assets if you're unable to check in.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
            {/* Left Column: Stats & Controls */}
            <div className="space-y-8">
              <div className="p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5">
                <div className="mb-8">
                  <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Current Timeline</p>
                  <div className="flex items-baseline space-x-2">
                    <span className="text-6xl font-black text-white">{day}</span>
                    <span className="text-xl font-bold text-gray-600 uppercase tracking-tighter">Days Inactive</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <Button 
                    onClick={() => setIsAutoPlaying(!isAutoPlaying)}
                    className={cn(
                      "w-full h-14 uppercase font-black tracking-widest",
                      isAutoPlaying ? "bg-white/10 text-white" : "bg-gold text-black"
                    )}
                  >
                    {isAutoPlaying ? "Pause Simulation" : "Start Simulation"}
                  </Button>
                  <Button 
                    variant="outline" 
                    onClick={resetSimulation}
                    className="w-full h-14 border-white/10 text-white uppercase font-black tracking-widest"
                  >
                    Reset
                  </Button>
                </div>
              </div>

              <div className="p-8 rounded-[2.5rem] bg-gold/5 border border-gold/10">
                <h4 className="text-xs font-black text-gold uppercase tracking-widest mb-4">Liveness Signals</h4>
                <ul className="space-y-4">
                  <li className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Email Check-in</span>
                    <span className={cn("font-bold", day < 30 ? "text-green-500" : "text-red-500")}>{day < 30 ? "WAITING" : "FAILED"}</span>
                  </li>
                  <li className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">SMS Verification</span>
                    <span className={cn("font-bold", day < 40 ? "text-gray-600" : day < 45 ? "text-yellow-500" : "text-red-500")}>{day < 40 ? "PENDING" : day < 45 ? "WARNING" : "FAILED"}</span>
                  </li>
                  <li className="flex items-center justify-between text-xs">
                    <span className="text-gray-400">Guardian Consensus</span>
                    <span className={cn("font-bold", day < 46 ? "text-gray-600" : "text-gold")}>{day < 46 ? "INACTIVE" : "VERIFIED"}</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Right Column: Visual Timeline & Explanations */}
            <div className="lg:col-span-2 space-y-8">
              {/* Status Card */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={state}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className={cn(
                    "p-10 rounded-[3rem] border transition-all duration-500 min-h-[300px] flex flex-col justify-center",
                    stages.find(s => s.id === state)?.bg,
                    "border-white/5"
                  )}
                >
                  <div className={cn(
                    "h-20 w-20 rounded-[2rem] flex items-center justify-center mb-8",
                    "bg-black border border-white/10"
                  )}>
                    <div className={stages.find(s => s.id === state)?.color}>
                      {stages.find(s => s.id === state)?.icon}
                    </div>
                  </div>
                  <h2 className={cn(
                    "text-3xl font-black uppercase tracking-tight mb-4",
                    stages.find(s => s.id === state)?.color
                  )}>
                    {stages.find(s => s.id === state)?.title}
                  </h2>
                  <p className="text-gray-400 text-lg leading-relaxed">
                    {state === 'ACTIVE' && "The user is active and checking in normally. The vault remains locked and encrypted."}
                    {state === 'WARNING' && "The user has missed the 30-day check-in. System begins automated email and SMS outreach."}
                    {state === 'GRACE' && "Critical escalation. Beneficiaries are notified that the liveness protocol has entered the grace period."}
                    {state === 'TRIGGERED' && "Protocol fully triggered. Guardian consensus is required to authorize the decryption key release."}
                    {state === 'RELEASED' && "Consensus reached. Beneficiaries can now use their shared keys to decrypt the legacy."}
                  </p>
                </motion.div>
              </AnimatePresence>

              {/* Progress Bar */}
              <div className="p-8 rounded-[2.5rem] bg-white/[0.02] border border-white/5">
                <div className="flex justify-between mb-4">
                  {stages.map((stage, i) => (
                    <div key={i} className="flex flex-col items-center">
                      <div className={cn(
                        "h-3 w-3 rounded-full mb-2 transition-all duration-500",
                        day >= stage.minDay ? "bg-gold scale-125 shadow-[0_0_10px_rgba(212,175,55,0.5)]" : "bg-white/10"
                      )} />
                      <span className={cn(
                        "text-[8px] font-black uppercase tracking-widest",
                        day >= stage.minDay ? "text-gold" : "text-gray-600"
                      )}>
                        {stage.id}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gold"
                    initial={{ width: 0 }}
                    animate={{ width: `${(day / 50) * 100}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
