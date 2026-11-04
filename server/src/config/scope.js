// Version 1 scope (PDF page 04). status: ready | partial | todo
export const SCOPE = {
  p0: [
    { name: 'Login and roles', status: 'ready' },
    { name: 'Business setup', status: 'ready', note: 'Shop name, GSTIN, logo, time zone, numbering. One branch for now; more branches are P1.' },
    { name: 'Products and tags', status: 'ready' },
    { name: 'Barcode scan and labels', status: 'ready', note: 'Barcode generation and 50 x 25 mm labels. Check the label size on your printer.' },
    { name: 'Pricing engine', status: 'ready' },
    { name: 'POS billing', status: 'ready' },
    { name: 'Cash, UPI, card, split pay', status: 'ready', note: 'Bank transfer is included too.' },
    { name: 'Invoices and printing', status: 'partial', note: 'A4 and thermal 80 mm print from the browser. Please test on your real thermal printer.' },
    { name: 'Stock and purchases', status: 'ready' },
    { name: 'Returns', status: 'ready' },
    { name: 'Customers and suppliers', status: 'ready' },
    { name: 'Reports', status: 'ready', note: 'Dashboard, sales, stock, tax with CSV, audit log. Profit reports are P1.' },
    { name: 'Audit and backups', status: 'partial', note: 'Turn on BACKUP_ENABLED and run npm run restore:test on your server once to prove it.' },
  ],
  p1: ['Branches and transfers', 'Hold and resume bills', 'Cashier shifts', 'Exchanges', 'Old-gold buying', 'Stock counts', 'Profit reports', 'Offline billing (to confirm)'],
  p2: ['Repairs', 'Custom orders and advances', 'WhatsApp invoices', 'Loyalty points', 'Owner mobile dashboard', 'AI analytics'],
  out: ['Manufacturing', 'Full ERP', 'Diamond grading by image', 'Gold trading', 'Online marketplace', 'Unverified tax logic'],
};
