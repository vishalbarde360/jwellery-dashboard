import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const MAROON = '#4a1424';
const MAROON_DARK = '#3a0f1b';
const GOLD = '#b8892f';

// `perm` = one permission, `any` = at least one of these. No perm = everyone can see it.
const SECTIONS = [
  {
    title: 'MAIN',
    items: [
      { to: '/', label: 'Dashboard', icon: '▦', end: true },
      { to: '/billing', label: 'Billing (POS)', icon: '▤', perm: 'billing.create', badge: 'F2' },
      { to: '/invoices', label: 'Invoices', icon: '☰', any: ['billing.create', 'sales.read'] },
      { to: '/customers', label: 'Customers', icon: '☺', perm: 'customers.read' },
    ],
  },
  {
    title: 'INVENTORY & MINT',
    items: [
      { to: '/inventory', label: 'Inventory (Pieces & Mint)', icon: '◈', perm: 'stock.read' },
      { to: '/register', label: 'Register Product', icon: '⊕', perm: 'products.write' },
      { to: '/labels', label: 'Labels', icon: '▥', perm: 'tags.print' },
      { to: '/purchases', label: 'Purchases', icon: '⇩', any: ['purchases.draft', 'purchases.read'] },
      { to: '/returns', label: 'Returns', icon: '↺', any: ['returns.create', 'returns.approve'] },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { to: '/rates', label: 'Daily Rates', icon: '◔', perm: 'rates.read', badge: 'Live', tone: 'green' },
      { to: '/reports', label: 'Reports', icon: '▨', perm: 'reports.read' },
    ],
  },
  {
    title: 'SYSTEM & SECURITY',
    items: [
      { to: '/users', label: 'Users', icon: '☻', perm: 'users.manage' },
      { to: '/audit', label: 'Audit Log', icon: '☷', perm: 'audit.read' },
      { to: '/settings', label: 'Shop Setup', icon: '⚙', perm: 'settings.write' },
      { to: '/system', label: 'Backups', icon: '⛁', perm: 'system.config' },
      { to: '/roles', label: 'Roles and Access', icon: '⚿' },
      { to: '/scope', label: 'Version 1 Scope', icon: '✓', badge: 'v1.0' },
    ],
  },
];

function Badge({ text, tone }) {
  const cls = tone === 'green' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-[#b8892f]/25 text-[#f1d28a]';
  return <span className={`ml-auto rounded px-1.5 py-0.5 text-[10px] font-bold ${cls}`}>{text}</span>;
}

function Panel({ branches, branch, setBranch, onNavigate }) {
  const { user, logout, can, settings } = useAuth();
  const allowed = (m) => (m.any ? m.any.some(can) : !m.perm || can(m.perm));
  const sections = SECTIONS.map((s) => ({ ...s, items: s.items.filter(allowed) })).filter((s) => s.items.length);
  const initials = (user?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();

  return (
    <div className="flex h-full flex-col text-white" style={{ background: `linear-gradient(180deg, ${MAROON} 0%, ${MAROON_DARK} 100%)` }}>
      {/* Brand */}
      <div className="flex items-center gap-3 border-b border-white/10 px-4 py-4">
        <div className="grid h-9 w-9 place-items-center rounded-lg text-lg" style={{ background: GOLD }}>◈</div>
        <div className="min-w-0">
          <div className="truncate text-sm font-extrabold">{settings?.shopName || 'Aviraj Jewellery'}</div>
          <div className="text-[9px] font-bold tracking-widest text-[#c9a46a]/80">ENTERPRISE POS & INVENTORY</div>
        </div>
      </div>

      {/* Menu (scrolls by itself if it gets long) */}
      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-3">
        {sections.map((s) => (
          <div key={s.title}>
            <div className="px-2 pb-1 text-[10px] font-bold tracking-widest text-[#c9a46a]/70">{s.title}</div>
            <ul className="space-y-0.5">
              {s.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition ${
                        isActive ? 'bg-white/10 font-bold text-white' : 'text-[#ecdcc6] hover:bg-white/5'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        <span className="w-4 text-center text-[13px]" style={{ color: isActive ? '#f1d28a' : GOLD }}>{it.icon}</span>
                        <span className="truncate">{it.label}</span>
                        {it.badge && <Badge text={it.badge} tone={it.tone} />}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Branch + user */}
      <div className="space-y-2 border-t border-white/10 p-3">
        {branches?.length > 0 && (
          <select
            value={branch}
            onChange={(e) => setBranch(e.target.value)}
            aria-label="Branch"
            className="w-full rounded-lg border border-white/15 bg-white/5 px-2.5 py-2 text-xs font-semibold text-[#ecdcc6] outline-none"
          >
            {branches.map((b) => <option key={b} value={b} className="text-black">{b}</option>)}
          </select>
        )}
        <div className="flex items-center gap-2.5 rounded-lg bg-white/5 px-2.5 py-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold" style={{ background: GOLD }}>{initials}</div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-bold">{user?.name}</div>
            <div className="truncate text-[10px] text-[#c9a46a]/80">{user?.roleLabel}</div>
          </div>
          <button onClick={logout} title="Sign out" aria-label="Sign out" className="rounded p-1.5 text-[#ecdcc6] hover:bg-white/10">⎋</button>
        </div>
      </div>
    </div>
  );
}

export default function Sidebar({ branches = [] }) {
  const { settings } = useAuth();
  const [open, setOpen] = useState(false);
  const [branch, setBranch] = useState(branches[0] || '');
  const props = { branches, branch, setBranch };

  return (
    <>
      {/* Mobile: top bar + slide-in menu */}
      <div className="print:hidden flex items-center gap-3 px-4 py-3 text-white md:hidden" style={{ background: MAROON }}>
        <button onClick={() => setOpen(true)} aria-label="Open menu" className="text-xl">☰</button>
        <span className="font-extrabold">{settings?.shopName || 'Aviraj Jewellery'}</span>
      </div>
      {open && (
        <div className="print:hidden fixed inset-0 z-40 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 shadow-xl"><Panel {...props} onNavigate={() => setOpen(false)} /></div>
        </div>
      )}

      {/* Desktop: fixed sidebar */}
      <aside className="print:hidden sticky top-0 hidden h-screen w-64 shrink-0 md:block">
        <Panel {...props} />
      </aside>
    </>
  );
}