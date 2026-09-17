'use client';

import { Suspense, ReactNode } from 'react';

interface SuspenseWrapperProps {
  children: ReactNode;
  fallback?: ReactNode;
}

const DEFAULT_FALLBACK = (
  <div className="py-12 text-center">
    <div className="h-8 w-8 animate-spin text-gold mx-auto" />
  </div>
);

export function SuspenseWrapper({ children, fallback = DEFAULT_FALLBACK }: SuspenseWrapperProps) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}