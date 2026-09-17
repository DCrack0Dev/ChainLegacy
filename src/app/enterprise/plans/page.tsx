import { SuspenseWrapper } from '@/components/enterprise/SuspenseWrapper';
import { EnterprisePlansContent } from './PlansContent';

export default function EnterprisePlansPage() {
  return (
    <SuspenseWrapper>
      <EnterprisePlansContent />
    </SuspenseWrapper>
  );
}