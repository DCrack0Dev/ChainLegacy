'use client';

import type { ReactNode } from 'react';
import { OrgProvider } from '@/components/enterprise/OrgContext';
import EnterpriseLayout from '@/components/enterprise/EnterpriseLayout';

export default function EnterpriseConsoleLayout({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <EnterpriseLayout>{children}</EnterpriseLayout>
    </OrgProvider>
  );
}
