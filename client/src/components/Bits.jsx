import { STATUS } from '../status';

export const Badge = ({ status }) => {
  const s = STATUS[status] || { label: status, cls: 'bg-paper text-slate-600' };
  return <span className={`inline-block whitespace-nowrap rounded px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
};

export const Notice = ({ msg }) =>
  msg?.text ? (
    <div role={msg.type === 'err' ? 'alert' : 'status'} className={`rounded-md px-3 py-2 text-sm ${msg.type === 'ok' ? 'bg-leaf-soft text-leaf' : 'bg-ruby-soft text-ruby'}`}>
      {msg.text}
    </div>
  ) : null;

export const Table = ({ head, children, min = 640 }) => (
  <div className="card overflow-x-auto">
    <table className="w-full text-left text-sm" style={{ minWidth: min }}>
      <thead className="border-b border-paper-line bg-paper text-slate-600">
        <tr>{head.map((h, i) => <th key={i} className="p-3 font-semibold">{h}</th>)}</tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);
