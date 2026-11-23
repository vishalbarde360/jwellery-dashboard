// Customer cha number ani invoice details gheun WhatsApp chat message tayar karun ughadto.
export const waLink = (phone, inv, shop = 'Aviraj Jewellers') => {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  const full = digits.length === 10 ? `91${digits}` : digits;
  const text =
    `Namaskar ${inv.customerName || ''},\n` +
    `${shop} madhun kharedi baddal dhanyavad.\n` +
    `Invoice No: ${inv.number}\n` +
    `Total: ₹${inv.total}\n` +
    (inv.publicUrl ? `Bill pahnyasathi: ${inv.publicUrl}` : '');
  return `https://wa.me/${full}?text=${encodeURIComponent(text)}`;
};
