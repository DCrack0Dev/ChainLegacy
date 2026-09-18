import type { ReactNode } from 'react';
import { Navbar } from '@/components/ui/Navbar';

export default function EnterpriseMarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-black min-h-screen selection:bg-gold/30 selection:text-gold">
      <Navbar />
      {children}
    </div>
  );
}
