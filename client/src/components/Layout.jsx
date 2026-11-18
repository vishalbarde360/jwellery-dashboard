import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import RateStrip from './RateStrip';

export default function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-[#F3F6F6] text-gray-800 md:flex-row">
      <Sidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="print:hidden border-b border-paper-line bg-white px-6 py-3">
          <RateStrip />
        </header>

        <main className="flex-1 bg-[#F3F6F6] p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}