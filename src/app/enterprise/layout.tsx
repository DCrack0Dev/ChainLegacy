import { ReactNode } from 'react';
import EnterpriseLayout from '@/components/enterprise/EnterpriseLayout';

export default function Layout({ children }: { children: ReactNode }): JSX.Element {
  return <EnterpriseLayout>{children}</EnterpriseLayout>;
}
