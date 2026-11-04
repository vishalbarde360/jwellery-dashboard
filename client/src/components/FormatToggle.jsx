export default function FormatToggle({ value, onChange }) {
  return (
    <div role="group" aria-label="Print size" className="inline-flex overflow-hidden rounded-md border border-paper-line">
      {[['a4', 'A4'], ['thermal', 'Thermal 80 mm']].map(([k, l]) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)} className={`px-3 py-2 text-sm font-semibold ${value === k ? 'bg-ink text-white' : 'bg-white text-slate-700'}`}>{l}</button>
      ))}
    </div>
  );
}
