// Six roles. Every limit is enforced on the SERVER (see middleware/auth.js `need`).
// Hiding a button in the UI is never security.

export const ROLE_INFO = {
  owner: {
    label: 'Owner',
    does: 'Sets up the shop, users and pricing rules. Sees all reports. Approves large discounts and refunds. Reviews the audit log.',
    cannot: 'Nothing is blocked, but every action is logged.',
  },
  manager: {
    label: 'Store manager',
    does: 'Runs the day. Approves returns, transfers and stock corrections.',
    cannot: 'Change system settings.',
  },
  cashier: {
    label: 'Cashier',
    does: 'Scans, bills, takes payment, prints receipts and holds bills.',
    cannot: 'See cost prices, change stock, or refund without permission.',
  },
  inventory: {
    label: 'Inventory manager',
    does: 'Adds products, prints tags, receives and counts stock.',
    cannot: 'Create sales or approve own adjustments.',
  },
  accountant: {
    label: 'Accountant',
    does: 'Reviews sales, purchases, tax and payments. Exports records.',
    cannot: 'Create bills or change stock.',
  },
  sysadmin: {
    label: 'System administrator',
    does: 'Technical setup, integrations, logs and access policy.',
    cannot: 'Act on money records by default.',
  },
};

// 'discount.large', 'refund.large' and 'settings.write' are held only by the owner (via '*').
// 'price.override' lets a manager change a piece's price on a bill (always logged).
export const PERMISSIONS = {
  owner: ['*'],
  manager: [
    'billing.create', 'billing.hold', 'billing.discount',
    'returns.create', 'returns.approve', 'transfers.approve',
    'stock.read', 'stock.adjust.approve', 'stock.inspect', 'stock.count',
    'rates.read', 'rates.write', 'cost.read', 'reports.read', 'sales.read', 'price.override',
    'customers.read', 'customers.write',
  ],
  cashier: ['billing.create', 'billing.hold', 'receipt.print', 'returns.create', 'stock.read', 'rates.read', 'customers.read', 'customers.write'],
  inventory: ['products.write', 'tags.print', 'stock.read', 'stock.receive', 'stock.inspect', 'purchases.draft', 'stock.count', 'stock.adjust.request', 'cost.read', 'rates.read'],
  accountant: ['sales.read', 'purchases.read', 'tax.read', 'payments.read', 'reports.read', 'export.data', 'cost.read', 'stock.read', 'rates.read', 'customers.read'],
  sysadmin: ['users.manage', 'access.policy', 'system.config', 'integrations.manage', 'logs.read', 'audit.read'],
};

export const ROLES = Object.keys(PERMISSIONS);

export const can = (role, perm) => {
  const list = PERMISSIONS[role] || [];
  return list.includes('*') || list.includes(perm);
};
