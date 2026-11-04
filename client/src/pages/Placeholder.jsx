export default function Placeholder({ title }) {
  return (
    <div className="card p-8">
      <h1 className="text-xl font-extrabold text-ink">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">This screen is not built yet. It will follow the matching PDF page.</p>
    </div>
  );
}
