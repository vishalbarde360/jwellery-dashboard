import { HttpError } from '../utils/errors.js';

// Product registration: the extra fields change with the category.
// `short` is the word printed on the small label.
export const CATEGORIES = {
  ring: { label: 'Ring', fields: [
    { key: 'size', short: 'Size', label: 'Ring size', type: 'number', min: 1, max: 40, required: true },
    { key: 'gender', short: 'For', label: 'For', type: 'select', options: ['Women', 'Men', 'Kids', 'Unisex'] },
    { key: 'mainStone', short: 'Stone', label: 'Main stone', type: 'text' },
  ] },
  chain: { label: 'Chain', fields: [
    { key: 'length', short: 'Len', label: 'Length (inches)', type: 'number', min: 1, max: 100, required: true },
    { key: 'linkStyle', short: 'Link', label: 'Link style', type: 'select', options: ['Rope', 'Box', 'Curb', 'Figaro', 'Snake', 'Other'] },
  ] },
  necklace: { label: 'Necklace', fields: [
    { key: 'length', short: 'Len', label: 'Length (inches)', type: 'number', min: 1, max: 100, required: true },
    { key: 'soldAs', short: '', label: 'Sold as', type: 'select', options: ['Necklace only', 'Set with earrings'] },
  ] },
  bangle: { label: 'Bangle', fields: [
    { key: 'size', short: 'Size', label: 'Inner size (for example 2.4, 2.6)', type: 'text', required: true },
    { key: 'pieces', short: 'Pcs', label: 'Pieces in the set', type: 'number', min: 1, max: 24 },
  ] },
  bracelet: { label: 'Bracelet', fields: [
    { key: 'length', short: 'Len', label: 'Length (inches)', type: 'number', min: 1, max: 20, required: true },
    { key: 'linkStyle', short: 'Link', label: 'Link style', type: 'select', options: ['Rope', 'Box', 'Curb', 'Figaro', 'Snake', 'Other'] },
  ] },
  earring: { label: 'Earring', fields: [
    { key: 'style', short: '', label: 'Style', type: 'select', options: ['Stud', 'Drop', 'Hoop', 'Jhumka', 'Other'], required: true },
    { key: 'soldAs', short: '', label: 'Sold as', type: 'select', options: ['Pair', 'Single'] },
  ] },
  pendant: { label: 'Pendant', fields: [
    { key: 'design', short: '', label: 'Design', type: 'text' },
    { key: 'chainIncluded', short: 'Chain', label: 'Chain included', type: 'select', options: ['Yes', 'No'] },
  ] },
  anklet: { label: 'Anklet', fields: [
    { key: 'length', short: 'Len', label: 'Length (inches)', type: 'number', min: 1, max: 20, required: true },
    { key: 'soldAs', short: '', label: 'Sold as', type: 'select', options: ['Pair', 'Single'] },
  ] },
  coin: { label: 'Coin or bar', fields: [
    { key: 'denomination', short: 'Wt', label: 'Denomination (g)', type: 'number', min: 0.1, max: 10000, required: true },
    { key: 'mint', short: '', label: 'Mint or brand', type: 'text' },
  ] },
  other: { label: 'Other', fields: [{ key: 'note', short: '', label: 'Details', type: 'text' }] },
};

export const categoryList = () => Object.entries(CATEGORIES).map(([key, c]) => ({ key, label: c.label, fields: c.fields }));

// Keep only the fields that belong to the category, coerce numbers, enforce choices and required fields.
export function validateAttrs(category, attrs = {}) {
  const cat = CATEGORIES[category];
  if (!cat) throw new HttpError(400, 'Choose a category');
  const out = {};
  for (const f of cat.fields) {
    let v = attrs?.[f.key];
    if (v === undefined || v === null || String(v).trim() === '') {
      if (f.required) throw new HttpError(400, `${f.label} is required for a ${cat.label.toLowerCase()}`);
      continue;
    }
    if (f.type === 'number') {
      v = Number(v);
      if (!Number.isFinite(v) || (f.min !== undefined && v < f.min) || (f.max !== undefined && v > f.max)) {
        throw new HttpError(400, `${f.label} must be between ${f.min} and ${f.max}`);
      }
    } else if (f.type === 'select') {
      if (!f.options.includes(v)) throw new HttpError(400, `${f.label}: choose one of ${f.options.join(', ')}`);
    } else v = String(v).trim().slice(0, 60);
    out[f.key] = v;
  }
  return out;
}
