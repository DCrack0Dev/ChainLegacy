import { SuspenseWrapper } from '@/components/enterprise/SuspenseWrapper';
import { EnterpriseClaimsContent } from './ClaimsContent';

export default function EnterpriseClaimsPage() {
  return (
    <SuspenseWrapper>
      <EnterpriseClaimsContent />
    </SuspenseWrapper>
  );
}