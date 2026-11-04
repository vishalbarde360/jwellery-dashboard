import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Placeholder from './pages/Placeholder';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';
import Roles from './pages/Roles';
import Scope from './pages/Scope';
import Billing from './pages/Billing';
import Inventory from './pages/Inventory';
import Purchases from './pages/Purchases';
import Returns from './pages/Returns';
import Settings from './pages/Settings';
import Rates from './pages/Rates';
import Customers from './pages/Customers';
import Invoices from './pages/Invoices';
import Labels from './pages/Labels';
import Reports from './pages/Reports';
import System from './pages/System';
import RegisterProduct from './pages/RegisterProduct';
import InvoiceDetail from './pages/InvoiceDetail';
import InvoiceByNo from './pages/InvoiceByNo';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/billing" element={<ProtectedRoute perm="billing.create"><Billing /></ProtectedRoute>} />
        <Route path="/inventory" element={<ProtectedRoute perm="stock.read"><Inventory /></ProtectedRoute>} />
        <Route path="/invoices" element={<Invoices />} />
        <Route path="/invoices/no/:no" element={<InvoiceByNo />} />
        <Route path="/invoices/:id" element={<InvoiceDetail />} />
        <Route path="/register" element={<ProtectedRoute perm="products.write"><RegisterProduct /></ProtectedRoute>} />
        <Route path="/customers" element={<Customers />} />
        <Route path="/labels" element={<ProtectedRoute perm="tags.print"><Labels /></ProtectedRoute>} />
        <Route path="/rates" element={<Rates />} />
        <Route path="/reports" element={<ProtectedRoute perm="reports.read"><Reports /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute perm="settings.write"><Settings /></ProtectedRoute>} />
        <Route path="/system" element={<ProtectedRoute perm="system.config"><System /></ProtectedRoute>} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/returns" element={<Returns />} />
        <Route path="/users" element={<ProtectedRoute perm="users.manage"><Users /></ProtectedRoute>} />
        <Route path="/audit" element={<ProtectedRoute perm="audit.read"><AuditLog /></ProtectedRoute>} />
        <Route path="/roles" element={<Roles />} />
        <Route path="/scope" element={<Scope />} />
      </Route>
    </Routes>
  );
}
