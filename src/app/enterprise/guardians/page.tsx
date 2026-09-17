import { SuspenseWrapper } from '@/components/enterprise/SuspenseWrapper';
import { EnterpriseGuardiansContent } from './GuardiansContent';

export default function EnterpriseGuardiansPage() {
  return (
    <SuspenseWrapper>
      <EnterpriseGuardiansContent />
    </SuspenseWrapper>
  );
}