'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, Lock, CheckCircle2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Step {
  id: string;
  label: string;
  description: string;
}

const STEPS: Step[] = [
  { id: 'encrypt', label: 'Encrypting vault data', description: 'AES-256 local-first encryption' },
  { id: 'save', label: 'Securing beneficiaries', description: 'Linking legacy to designated recipients' },
  { id: 'secure', label: 'Activating protection', description: 'Finalizing Dead Man\'s Switch logic' },
];

interface SecureProcessingProps {
  onComplete?: () => void;
}

export const SecureProcessing = ({ onComplete }: SecureProcessingProps) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<string[]>([]);
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (currentStepIndex < STEPS.length) {
      const timer = setTimeout(() => {
        setCompletedSteps((prev) => [...prev, STEPS[currentStepIndex].id]);
        setCurrentStepIndex((prev) => prev + 1);
      }, 1000); // 1 second per step for a faster but still premium feel
      return () => clearTimeout(timer);
    } else {
      setIsSuccess(true);
      const finalTimer = setTimeout(() => {
        onComplete?.();
      }, 1500); // Give users time to see the success state
      return () => clearTimeout(finalTimer);
    }
  }, [currentStepIndex, onComplete]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-background/95 backdrop-blur-md overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[120px]" />
      <div className="absolute -top-24 -left-24 -z-10 w-96 h-96 bg-primary/5 rounded-full blur-[100px]" />
      <div className="absolute -bottom-24 -right-24 -z-10 w-96 h-96 bg-accent/5 rounded-full blur-[100px]" />

      <div className="w-full max-w-lg px-6 text-center">
        <AnimatePresence mode="wait">
          {!isSuccess ? (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.05 }}
              className="space-y-12"
            >
              <div>
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-accent/10 border border-accent/20">
                  <Shield className="h-10 w-10 text-accent animate-pulse" />
                </div>
                <h1 className="text-3xl font-bold tracking-tight text-white mb-3 uppercase tracking-widest">
                  Securing Vault
                </h1>
                <p className="text-gray-400">
                  Encrypting and finalizing your digital legacy...
                </p>
              </div>

              <div className="space-y-6">
                {STEPS.map((step, index) => {
                  const isCompleted = completedSteps.includes(step.id);
                  const isActive = currentStepIndex === index;
                  const isPending = currentStepIndex < index;

                  return (
                    <motion.div
                      key={step.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ 
                        opacity: isPending ? 0.4 : 1, 
                        x: 0,
                        scale: isActive ? 1.02 : 1
                      }}
                      className={cn(
                        "relative flex items-center space-x-4 p-4 rounded-2xl border transition-all duration-500",
                        isActive ? "bg-accent/5 border-accent/30 shadow-lg shadow-accent/5" : "bg-card/50 border-card-border"
                      )}
                    >
                      <div className="flex-shrink-0">
                        {isCompleted ? (
                          <CheckCircle2 className="h-6 w-6 text-green-500" />
                        ) : isActive ? (
                          <Loader2 className="h-6 w-6 text-accent animate-spin" />
                        ) : (
                          <div className="h-6 w-6 rounded-full border-2 border-gray-700" />
                        )}
                      </div>
                      
                      <div className="flex-1 text-left">
                        <div className="flex items-center justify-between">
                          <p className={cn(
                            "text-sm font-bold uppercase tracking-widest",
                            isCompleted ? "text-green-500/80" : isActive ? "text-accent" : "text-gray-500"
                          )}>
                            {step.label}
                          </p>
                          {isActive && (
                            <span className="text-[10px] font-mono text-accent animate-pulse">PROCESSING...</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {step.description}
                        </p>
                      </div>

                      {isActive && (
                        <motion.div
                          layoutId="pulse"
                          className="absolute inset-0 rounded-2xl bg-accent/5"
                          animate={{
                            opacity: [0.1, 0.2, 0.1],
                          }}
                          transition={{
                            duration: 2,
                            repeat: Infinity,
                          }}
                        />
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex flex-col items-center space-y-6"
            >
              <div className="h-24 w-24 bg-gold/10 border-2 border-gold rounded-full flex items-center justify-center shadow-2xl shadow-gold/20">
                <CheckCircle2 className="h-12 w-12 text-gold" />
              </div>
              <div className="space-y-2">
                <h1 className="text-4xl font-extrabold text-white tracking-tight uppercase">Legacy Secured</h1>
                <p className="text-gray-400 max-w-sm mx-auto">
                  Your vault is now active and protected by bank-grade AES-256 encryption.
                </p>
              </div>
              <div className="flex items-center space-x-2 text-[10px] font-bold text-gold uppercase tracking-[0.3em] pt-4 animate-pulse">
                <Lock className="h-3 w-3" />
                <span>Zero-Knowledge Protection Active</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-12 flex items-center justify-center space-x-2"
        >
          <Lock className="h-4 w-4 text-gray-600" />
          <span className="text-xs text-gray-600 font-medium tracking-widest uppercase">
            Military-grade security active
          </span>
        </motion.div>
      </div>
    </div>
  );
};
