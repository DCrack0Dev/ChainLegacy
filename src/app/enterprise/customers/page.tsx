import EnterpriseSkeleton from '@/components/enterprise/EnterpriseSkeleton';
import Link from 'next/link';

export default function EnterpriseCustomersPage() {
  return (
    <EnterpriseSkeleton
      eyebrow="Customers"
      title="Customer Directory"
      subtitle="Create, search, and filter your organization's customers. Every row is scoped to your orgId server-side."
      stats={[
        { label: 'Total Customers', value: 1 },
        { label: 'Active Plans', value: 1 },
        { label: 'Pending Claims', value: 0 },
        { label: 'Suspicious', value: 0 },
      ]}
      cta={[{ label: '+ Add Customer', variant: 'primary' }, { label: 'Bulk Import CSV', variant: 'secondary' }]}
    >
      <div className="rounded-2xl border border-white/10 p-6 text-sm text-gray-400">
        SIMULATION · <Link className="underline text-gold" href="/enterprise/api-keys">POST /api/v1/customers</Link> is wired but the table here is visual placeholder.
      </div>
    </EnterpriseSkeleton>
  );
}
