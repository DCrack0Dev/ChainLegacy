import EnterpriseSkeleton from '@/components/enterprise/EnterpriseSkeleton';
import { FileCheck2, ShieldCheck, HeartPulse, ShieldAlert, Users } from 'lucide-react';

export default function EnterpriseOverviewPage(): JSX.Element {
  return (
    <div className="space-y-10">
      <EnterpriseSkeleton
        eyebrow="ChainLegacy Enterprise · Dashboard"
        title="Partner Overview"
        subtitle="Integrate ChainLegacy digital inheritance into your African wallet, exchange, bank, insurer, or fintech in minutes — not months. Monitor customers, claims, guardians, liveness, and audit events end to end."
        stats={[
          { label: 'Customers', value: 1, delta: 'Simulation', tone: 'neutral' },
          { label: 'Legacy Plans Active', value: 1, delta: 'Sandbox plan only', tone: 'neutral' },
          { label: 'Claims Live', value: 0, delta: '0 open disputes', tone: 'positive' },
          { label: 'Guardians Assigned', value: 3, delta: 'Quorum 2-of-3 default', tone: 'positive' },
        ]}
        cta={[
          { label: 'Create Customer', variant: 'primary' },
          { label: 'Launch Pilot Wizard', variant: 'secondary' },
        ]}
      />

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
          <div className="flex items-center gap-3">
            <FileCheck2 className="h-5 w-5 text-gold" />
            <h2 className="text-base font-bold uppercase tracking-wider">Latest Claims (Demo / Simulation)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-500 uppercase tracking-widest text-[11px]">
                <tr>
                  <th className="py-3 pr-4">Claim ID</th>
                  <th className="py-3 pr-4">Plan</th>
                  <th className="py-3 pr-4">Status</th>
                  <th className="py-3 pr-4">Initiator</th>
                  <th className="py-3 pr-4">Next Action</th>
                </tr>
              </thead>
              <tbody className="text-gray-300">
                <tr className="border-t border-white/5">
                  <td className="py-3 pr-4 font-mono text-xs">claim_demo_001</td>
                  <td className="py-3 pr-4">Demo Customer · Default 30d</td>
                  <td className="py-3 pr-4"><span className="px-2 py-1 rounded-full bg-white/5 text-xs">pending</span></td>
                  <td className="py-3 pr-4">demo@chainlegacy.app</td>
                  <td className="py-3 pr-4 text-gray-500">SIMULATION · UI only</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-gold" />
            <h2 className="text-base font-bold uppercase tracking-wider">Security Posture</h2>
          </div>
          <ul className="space-y-3 text-sm">
            {[
              ['Firestore Enterprise Collections', 'server-admin-only rules', true],
              ['API Keys SHA-256 hashed', 'clsbox_ / clprod_ prefixes', true],
              ['Guardian Quorum N-of-M', 'tally per claim', true],
              ['Webhook HMAC-SHA256', '5-min replay tolerance', true],
              ['CSP header', 'MISSING', false],
              ['Rate limiter per-key', 'MISSING', false],
            ].map(([label, detail, ok]) => (
              <li key={label as string} className="flex items-start gap-3">
                {ok ? (
                  <ShieldCheck className="h-4 w-4 text-emerald-400 mt-0.5" />
                ) : (
                  <ShieldAlert className="h-4 w-4 text-amber-400 mt-0.5" />
                )}
                <div className="space-y-0.5">
                  <div className="text-white font-semibold">{label}</div>
                  <div className="text-xs text-gray-500">{detail}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
        <div className="flex items-center gap-3">
          <HeartPulse className="h-5 w-5 text-gold" />
          <h2 className="text-base font-bold uppercase tracking-wider">Liveness & Activity (Demo)</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
          {([
            { label: 'Plans healthy', count: 1, Icon: HeartPulse },
            { label: 'Plans warning_email', count: 0, Icon: ShieldAlert },
            { label: 'Liveness cron runs', count: 0, Icon: FileCheck2 },
            { label: 'Audit events (last 24h)', count: 2, Icon: Users },
          ] as const).map(({ label, count, Icon }) => (
            <div key={label} className="rounded-2xl border border-white/10 p-4 space-y-2">
              <Icon className="h-4 w-4 text-gold" />
              <div className="text-2xl font-bold text-white">{count}</div>
              <div className="text-[11px] uppercase tracking-widest text-gray-500">{label}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-3xl border border-white/10 bg-white/[0.03] p-6 space-y-5">
        <h2 className="text-base font-bold uppercase tracking-wider">Pilot Readiness Checklist (Verification Gate)</h2>
        <ol className="list-decimal list-inside space-y-2 text-sm text-gray-400 marker:text-gold/80">
          <li className="text-emerald-400/90">Milestone 0: P0 OTP backdoor removed + 4 legacy unauthenticated routes scope-gated</li>
          <li className="text-emerald-400/90">Organization model, tenant isolation gating (server-side orgId), SHA-256 API keys, v1 routes</li>
          <li className="text-emerald-400/90">Claim 9-state engine with quorum, HMAC webhooks, cron idempotency, audit 15-key redaction</li>
          <li className="text-gray-400">⚠ Guardian identity authentication (who posts guardian approval?) still HIGH GAP — close before pilot</li>
          <li className="text-gray-400">⚠ Rate limiter per-API-key install before any partner traffic</li>
          <li className="text-gray-400">⚠ CSP header + enterprise page Firebase redirect middleware before pilot</li>
          <li className="text-gray-400">⚠ Firestore rules-unit-testing integration tests (rules, tenant isolation)</li>
        </ol>
      </section>
    </div>
  );
}
