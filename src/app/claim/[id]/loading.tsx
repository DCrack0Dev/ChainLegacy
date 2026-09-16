import React from 'react';
import { Shield, Lock, Unlock } from 'lucide-react';

export default function Loading() {
  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Mock Navbar */}
      <nav className="border-b border-card-border bg-background/50 backdrop-blur-md sticky top-0 z-50">
        <div className="mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">
          <div className="h-8 w-32 bg-white/5 rounded-lg animate-pulse" />
          <div className="flex space-x-4">
            <div className="h-8 w-20 bg-white/5 rounded-lg animate-pulse" />
            <div className="h-8 w-24 bg-white/5 rounded-lg animate-pulse" />
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-2xl px-4 pt-20 text-center">
        <div className="mb-12">
          <div className="mx-auto h-20 w-20 bg-white/5 rounded-full flex items-center justify-center mb-6 animate-pulse" />
          <div className="h-10 w-64 bg-white/5 rounded-xl mx-auto mb-4 animate-pulse" />
          <div className="h-4 w-80 bg-white/5 rounded-lg mx-auto animate-pulse" />
        </div>

        {/* Mock Card */}
        <div className="p-8 bg-card border border-card-border rounded-2xl space-y-6">
          <div className="space-y-2 text-left">
            <div className="h-6 w-48 bg-white/5 rounded-lg animate-pulse" />
            <div className="h-4 w-64 bg-white/5 rounded-lg animate-pulse" />
          </div>
          
          <div className="space-y-4">
            <div className="h-12 w-full bg-white/5 rounded-xl animate-pulse" />
            <div className="h-12 w-full bg-white/5 rounded-xl animate-pulse" />
            <div className="h-12 w-full bg-white/5 rounded-xl animate-pulse" />
          </div>

          <div className="h-12 w-full bg-accent/20 rounded-xl animate-pulse" />
        </div>

        <div className="mt-16 flex flex-col items-center justify-center space-y-4 opacity-20">
          <div className="flex items-center space-x-6">
            <Shield className="h-8 w-8 text-gray-500" />
            <Lock className="h-8 w-8 text-gray-500" />
            <Unlock className="h-8 w-8 text-gray-500" />
          </div>
          <div className="h-2 w-48 bg-white/5 rounded-full animate-pulse" />
        </div>
      </div>
    </div>
  );
}
