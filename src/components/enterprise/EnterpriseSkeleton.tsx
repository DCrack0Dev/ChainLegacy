import type { ReactNode } from 'react';

export function EnterpriseSkeleton({
  eyebrow,
  title,
  subtitle,
  stats,
  cta,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  stats?: { label: string; value: string | number; delta?: string; tone?: 'positive' | 'negative' | 'neutral' }[];
  cta?: { label: string; href?: string; action?: () => void; variant?: 'primary' | 'secondary' }[];
  children?: ReactNode;
}): JSX.Element {
  return (
    <section className="space-y-8">
      <header className="space-y-3">
        {eyebrow ? (
          <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gold/80">{eyebrow}</div>
        ) : null}
        <h1 className="text-3xl md:text-4xl font-bold uppercase tracking-tight text-white">{title}</h1>
        {subtitle ? <p className="text-base text-gray-400 max-w-3xl">{subtitle}</p> : null}
      </header>
      {stats?.length ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map(s => (
            <div key={s.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 space-y-2">
              <div className="text-xs uppercase tracking-widest text-gray-500">{s.label}</div>
              <div className="text-2xl font-bold text-white">{s.value}</div>
              {s.delta ? (
                <div
                  className={
                    'text-[11px] font-medium ' +
                    (s.tone === 'negative' ? 'text-red-400' : s.tone === 'positive' ? 'text-emerald-400' : 'text-gray-400')
                  }
                >
                  {s.delta}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {cta?.length ? (
        <div className="flex flex-wrap items-center gap-3">
          {cta.map((c, i) => (
            <button
              key={i}
              onClick={c.action}
              className={
                'px-5 py-3 text-xs font-semibold uppercase tracking-[0.18em] rounded-2xl transition ' +
                (c.variant === 'secondary'
                  ? 'border border-white/10 text-white/80 hover:bg-white/5'
                  : 'bg-gold text-black hover:brightness-110')
              }
            >
              {c.label}
            </button>
          ))}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export default EnterpriseSkeleton;
