import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  LayoutDashboard,
  Users,
  ScrollText,
  ShieldCheck,
  ShieldHalf,
  FileCheck2,
  HeartPulse,
  Shield,
  Scroll,
  KeyRound,
  Webhook,
  Settings,
  Building2,
  Sparkles,
} from 'lucide-react';

const NAV = [
  { href: '/enterprise/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/enterprise/customers', label: 'Customers', icon: Users },
  { href: '/enterprise/plans', label: 'Legacy Plans', icon: ScrollText },
  { href: '/enterprise/beneficiaries', label: 'Beneficiaries', icon: ShieldHalf },
  { href: '/enterprise/guardians', label: 'Guardians', icon: ShieldCheck },
  { href: '/enterprise/claims', label: 'Claims', icon: FileCheck2 },
  { href: '/enterprise/liveness', label: 'Liveness', icon: HeartPulse },
  { href: '/enterprise/security', label: 'Security', icon: Shield },
  { href: '/enterprise/audit', label: 'Audit Trail', icon: Scroll },
  { href: '/enterprise/api-keys', label: 'API Keys', icon: KeyRound },
  { href: '/enterprise/webhooks', label: 'Webhooks', icon: Webhook },
  { href: '/enterprise/settings', label: 'Settings', icon: Settings },
];

export function EnterpriseLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div className="min-h-screen bg-dark-bg text-white">
      <div className="mx-auto max-w-[1440px] flex flex-col lg:flex-row">
        <aside className="lg:sticky lg:top-0 lg:h-screen w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-white/5 p-6 space-y-8">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-gold/10 border border-gold/30 grid place-items-center">
              <Building2 className="h-6 w-6 text-gold" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.24em] text-gold/80">ChainLegacy</div>
              <div className="text-sm font-bold uppercase tracking-tight">Enterprise</div>
            </div>
          </div>

          <div className="rounded-3xl border border-gold/20 bg-gold/[0.04] p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-gold" />
              <div className="text-[10px] uppercase tracking-[0.22em] font-semibold text-gold">Sandbox</div>
            </div>
            <div className="text-xs text-gray-400 leading-relaxed">
              Test API keys, webhooks, and claims in sandbox — no real secrets, no real SMS, no real vault unlocks.
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 p-4 space-y-2">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Organization</div>
            <div className="text-sm font-semibold text-white">ChainLegacy Demo Partner</div>
            <div className="text-[11px] text-gray-400">org_demo · active</div>
          </div>

          <nav className="space-y-1">
            {NAV.map(n => {
              const Icon = n.icon;
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-[0.16em] text-gray-400 hover:text-white hover:bg-white/5 transition"
                >
                  <Icon className="h-4 w-4 text-gold/80" />
                  <span>{n.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <main className="flex-1 p-6 md:p-10 space-y-10">{children}</main>
      </div>
    </div>
  );
}

export default EnterpriseLayout;
