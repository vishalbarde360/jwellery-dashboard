import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import RateStrip from './RateStrip';

export default function Layout() {
  const nav = useNavigate();

  // F2 = jump to Billing (matches the "New Bill (F2)" button and sidebar badge)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); nav('/billing'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nav]);

  return (
    <div className="flex min-h-screen flex-col bg-[#faf5ec] text-stone-800 md:flex-row">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-[#efe6d6] bg-[#fdf9f1] px-6 py-3 print:hidden">
          <RateStrip />
        </header>

        <main className="flex-1 bg-[#faf5ec] p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
