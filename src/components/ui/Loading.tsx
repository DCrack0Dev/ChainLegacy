import React from 'react';
import { Loader2, Shield } from 'lucide-react';

export const Loading = () => (
  <div className="flex min-h-screen items-center justify-center bg-background relative overflow-hidden">
    {/* Background decoration */}
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 -z-10 w-[600px] h-[600px] bg-accent/5 rounded-full blur-[120px]" />
    
    <div className="flex flex-col items-center space-y-6">
      <div className="relative">
        <div className="h-20 w-20 rounded-full border-2 border-accent/10 flex items-center justify-center">
          <Shield className="h-8 w-8 text-accent/20" />
        </div>
        <div className="absolute inset-0 h-20 w-20 border-t-2 border-accent rounded-full animate-spin" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-accent font-bold uppercase tracking-[0.2em] text-sm">
          Securing your legacy
        </p>
        <div className="flex justify-center space-x-1">
          <div className="h-1 w-1 bg-accent/40 rounded-full animate-bounce [animation-delay:-0.3s]" />
          <div className="h-1 w-1 bg-accent/40 rounded-full animate-bounce [animation-delay:-0.15s]" />
          <div className="h-1 w-1 bg-accent/40 rounded-full animate-bounce" />
        </div>
      </div>
    </div>
  </div>
);
