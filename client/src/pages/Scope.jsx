import { useEffect, useState } from 'react';
import api from '../api';

const BADGE = {
  ready: { text: 'Ready', cls: 'bg-leaf-soft text-leaf' },
  partial: { text: 'In progress', cls: 'bg-gold-soft text-gold-deep' },
  todo: { text: 'Not started', cls: 'bg-paper text-slate-500 border border-paper-line' },
};

function Plain({ title, hint, items }) {
  return (
    <section className="card p-4">
      <h2 className="font-extrabold text-ink">{title}</h2>
      <p className="mb-2 text-xs text-slate-500">{hint}</p>
      <ul className="space-y-1 text-sm">{items.map((i) => <li key={i}>{i}</li>)}</ul>
    </section>
  );
}

export default function Scope() {
  const [s, setS] = useState(null);
  useEffect(() => { api.get('/scope').then((r) => setS(r.data)); }, []);
  if (!s) return <p className="text-sm text-slate-500">Loading…</p>;

  const ready = s.p0.filter((x) => x.status === 'ready').length;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-ink">Version 1 scope</h1>
        <p className="mt-1 text-sm text-slate-600">{ready} of {s.p0.length} first-release items are fully ready.</p>
      </div>

      <section className="card divide-y divide-paper-line">
        <h2 className="p-4 font-extrabold text-ink">Version 1 (P0)</h2>
        {s.p0.map((x) => (
          <div key={x.name} className="flex items-start justify-between gap-4 p-4 text-sm">
            <div>
              <div className="font-semibold">{x.name}</div>
              {x.note && <div className="text-slate-500">{x.note}</div>}
            </div>
            <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${BADGE[x.status].cls}`}>{BADGE[x.status].text}</span>
          </div>
        ))}
      </section>

      <div className="grid gap-4 md:grid-cols-3">
        <Plain title="Next (P1)" hint="Planned right after version 1" items={s.p1} />
        <Plain title="Later (P2)" hint="Planned, not yet scheduled" items={s.p2} />
        <Plain title="Not included" hint="Deliberately left out" items={s.out} />
      </div>
    </div>
  );
}
