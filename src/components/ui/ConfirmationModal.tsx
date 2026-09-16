'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Shield, AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';
import { cn } from '@/lib/utils';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'primary' | 'danger' | 'gold';
  isLoading?: boolean;
}

export const ConfirmationModal = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'gold',
  isLoading = false,
}: ConfirmationModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
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
            className="relative w-full max-w-md bg-card border border-card-border rounded-2xl p-6 shadow-2xl"
          >
            <button
              onClick={onClose}
              className="absolute top-4 right-4 text-gray-500 hover:text-white transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="flex flex-col items-center text-center space-y-4">
              <div className={cn(
                "h-12 w-12 rounded-full flex items-center justify-center mb-2",
                variant === 'danger' ? "bg-red-500/10 text-red-500" : "bg-gold/10 text-gold"
              )}>
                {variant === 'danger' ? <AlertTriangle className="h-6 w-6" /> : <Shield className="h-6 w-6" />}
              </div>
              
              <div className="space-y-2">
                <h3 className="text-xl font-bold text-white">{title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">
                  {description}
                </p>
              </div>

              <div className="flex w-full space-x-3 pt-4">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={onClose}
                  disabled={isLoading}
                >
                  {cancelText}
                </Button>
                <Button
                  variant={variant === 'gold' ? 'primary' : (variant === 'danger' ? 'primary' : variant)}
                  className={cn(
                    "flex-1",
                    variant === 'gold' ? "bg-gold hover:bg-gold-dark text-black font-bold" : ""
                  )}
                  onClick={onConfirm}
                  isLoading={isLoading}
                >
                  {confirmText}
                </Button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
