import { SuspenseWrapper } from '@/components/enterprise/SuspenseWrapper';
import { EnterpriseBeneficiariesContent } from './BeneficiariesContent';

export default function EnterpriseBeneficiariesPage() {
  return (
    <SuspenseWrapper>
      <EnterpriseBeneficiariesContent />
    </SuspenseWrapper>
  );
}