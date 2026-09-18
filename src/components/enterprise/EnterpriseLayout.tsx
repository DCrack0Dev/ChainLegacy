'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
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
  User,
  Plus,
  Fingerprint,
  Key,
  ArrowRight,
} from 'lucide-react';
import { useOrg } from '@/components/enterprise/OrgContext';
import { cn } from '@/lib/utils';

const NAV = [
  { href: '/enterprise/overview', label: 'Overview', icon: LayoutDashboard },
  { href: '/enterprise/customers', label: 'Customers', icon: Users },
  { href: '/enterprise/plans', label: 'Legacy Plans', icon: ScrollText },
  { href: '/enterprise/verification', label: 'Identity Verification', icon: Fingerprint },
  { href: '/enterprise/vaults', label: 'Vaults', icon: Key },
  { href: '/enterprise/beneficiaries', label: 'Beneficiaries', icon: ShieldHalf },
  { href: '/enterprise/guardians', label: 'Guardians', icon: ShieldCheck },
  { href: '/enterprise/claims', label: 'Claims', icon: FileCheck2 },
  { href: '/enterprise/claims/transitions', label: 'Claim Transitions', icon: ArrowRight },
  { href: '/enterprise/liveness', label: 'Liveness', icon: HeartPulse },
  { href: '/enterprise/security', label: 'Security', icon: Shield },
  { href: '/enterprise/audit', label: 'Audit Trail', icon: Scroll },
  { href: '/enterprise/api-keys', label: 'API Keys', icon: KeyRound },
  { href: '/enterprise/webhooks', label: 'Webhooks', icon: Webhook },
  { href: '/enterprise/settings', label: 'Settings', icon: Settings },
];

export function EnterpriseLayout({ children }: { children: ReactNode }): JSX.Element {
  const pathname = usePathname();
  const { organizations, activeOrg, loading, error, setActiveOrgId } = useOrg();
  const isOnboard = pathname?.startsWith('/enterprise/onboard');

  if (isOnboard) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-3xl px-6 py-10">{children}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-bg text-white">
      <div className="mx-auto max-w-[1440px] flex flex-col lg:flex-row">
        <aside className="lg:sticky lg:top-0 lg:h-screen w-full lg:w-72 border-b lg:border-b-0 lg:border-r border-white/5 p-6 space-y-8 overflow-y-auto">
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
              <div className="text-[10px] uppercase tracking-[0.22em] font-semibold text-gold">Workspace</div>
            </div>
            <div className="text-xs text-gray-400 leading-relaxed">
              Organization context is enforced by the server from your Firebase session — not by a client-only org id.
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 p-4 space-y-3">
            <div className="text-[10px] uppercase tracking-widest text-gray-500">Current workspace</div>
            {loading ? (
              <div className="h-10 bg-white/5 rounded-xl animate-pulse" />
            ) : activeOrg ? (
              <>
                <div className="text-sm font-semibold text-white">{activeOrg.name}</div>
                <div className="text-[11px] text-gray-400 font-mono">
                  {activeOrg.id} · {activeOrg.status}
                </div>
                {organizations.length > 1 && (
                  <select
                    className="w-full mt-1 bg-black/40 border border-white/10 rounded-xl px-3 py-2 text-xs text-white"
                    value={activeOrg.id}
                    onChange={(e) => setActiveOrgId(e.target.value)}
                  >
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-xs text-gray-500">
                  {error || 'No organization linked to this account yet.'}
                </p>
                <Link
                  href="/enterprise/onboard"
                  className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gold"
                >
                  <Plus className="h-3.5 w-3.5" /> Create Organization
                </Link>
              </div>
            )}
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-gold pt-1"
            >
              <User className="h-3.5 w-3.5" /> Personal Account
            </Link>
          </div>

          <nav className="space-y-1">
            {NAV.map((n) => {
              const Icon = n.icon;
              const active = pathname === n.href || pathname?.startsWith(n.href + '/');
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold uppercase tracking-[0.16em] transition',
                    active
                      ? 'text-white bg-white/10'
                      : 'text-gray-400 hover:text-white hover:bg-white/5',
                  )}
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
