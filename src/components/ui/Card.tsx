import React from 'react';
import { cn } from '@/lib/utils';

export const Card = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('rounded-xl border border-card-border bg-card p-6 shadow-xl', className)}>
    {children}
  </div>
);

export const CardHeader = ({ title, subtitle, className }: { title: string; subtitle?: string; className?: string }) => (
  <div className={cn('mb-6 space-y-1.5', className)}>
    <h3 className="text-2xl font-semibold leading-none tracking-tight text-white">{title}</h3>
    {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
  </div>
);

export const CardContent = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('space-y-4', className)}>{children}</div>
);

export const CardFooter = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <div className={cn('mt-6 flex items-center pt-0', className)}>{children}</div>
);
