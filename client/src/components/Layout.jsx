import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import RateStrip from './RateStrip';

// Menu grows as PDF pages are added. `perm` hides items the role can't use.
const MENU = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/billing', label: 'Billing', perm: 'billing.create' },
  { to: '/invoices', label: 'Invoices', any: ['billing.create', 'sales.read'] },
  { to: '/customers', label: 'Customers', perm: 'customers.read' },
  { to: '/inventory', label: 'Inventory', perm: 'stock.read' },
  { to: '/register', label: 'Register product', perm: 'products.write' },
  { to: '/labels', label: 'Labels', perm: 'tags.print' },
  { to: '/rates', label: 'Daily rates', perm: 'rates.read' },
  { to: '/purchases', label: 'Purchases', any: ['purchases.draft', 'purchases.read'] },
  { to: '/returns', label: 'Returns', any: ['returns.create', 'returns.approve'] },
  { to: '/reports', label: 'Reports', perm: 'reports.read' },
  { to: '/users', label: 'Users', perm: 'users.manage' },
  { to: '/audit', label: 'Audit log', perm: 'audit.read' },
  { to: '/settings', label: 'Shop setup', perm: 'settings.write' },
  { to: '/system', label: 'Backups', perm: 'system.config' },
  { to: '/roles', label: 'Roles and access' },
  { to: '/scope', label: 'Version 1 scope' },
];

export default function Layout() {
  const { user, logout, can, settings } = useAuth();
  return (
    <div className="flex min-h-screen bg-[#F3F6F6] text-gray-800">
      
      {/* 🍫 साईडबारला इथे h-screen sticky top-0 क्लासेस दिले आहेत जेणेकरून तो एकाच ठिकाणी फिक्स राहील */}
      <aside className="print:hidden hidden h-screen sticky top-0 w-56 shrink-0 flex-col bg-ink text-ink-100 md:flex border-r border-ink-700">
        <div className="px-5 py-5">
          <div className="truncate text-lg font-extrabold tracking-tight text-ink-100">{settings.shopName || 'Aviraj '}</div>
          <div className="text-xs text-ink-100 opacity-80">Aviraj  Jewellery POS</div>
        </div>
        
        {/* मेनू सूची जर मोठी झाली तर फक्त मेनू आतल्या आत स्क्रॉल होईल */}
        <nav className="flex-1 space-y-1 px-3 overflow-y-auto">
          {MENU.filter((m) => (m.any ? m.any.some(can) : !m.perm || can(m.perm))).map((m) => (
            <NavLink
              key={m.to}
              to={m.to}
              end={m.end}
              className={({ isActive }) =>
                `block rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                  isActive ? 'bg-ink-100 text-ink' : 'text-ink-100 hover:bg-ink-500'
                }`
              }
            >
              {m.label}
            </NavLink>
          ))}
        </nav>
        
        <div className="border-t border-ink-700 px-5 py-4 text-sm mt-auto">
          <div className="font-semibold text-ink-100">{user?.name}</div>
          <div className="mb-2 text-xs text-ink-100 opacity-80">{user?.roleLabel}</div>
          <button onClick={logout} className="text-xs font-semibold text-gold-soft underline underline-offset-2">Sign out</button>
        </div>
      </aside>

      {/* 🖥️ उजवीकडील मुख्य स्क्रीन भाग */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="print:hidden border-b border-paper-line bg-white px-6 py-3">
          <RateStrip />
        </header>
        
        <main className="flex-1 p-6 bg-[#F3F6F6]">
          <Outlet />
        </main>
      </div>

    </div>
  );
}
