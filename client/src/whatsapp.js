export const waLink = (phone, inv, shop = 'Avira Jewellers') => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;

  const full = digits.length === 10 ? `91${digits}` : digits;

  const text =
    `Dear ${inv.customerName || 'Customer'},\n\n` +
    `Thank you for shopping with ${shop}! ❤️\n` +
    `We truly appreciate your trust and support.\n\n` +
    `Invoice No: ${inv.number}\n` +
    `Total Amount: ₹${inv.total}\n\n` +
    (inv.publicUrl
      ? `View Your Invoice: ${inv.publicUrl}\n\n`
      : '') +
    `We look forward to serving you again!\n` +
    `Thank you!`;

  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
};
