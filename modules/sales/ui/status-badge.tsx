import type { OrderStatus } from '../schema';

const LABELS: Record<OrderStatus, { text: string; className: string }> = {
  draft: { text: 'Draft', className: 'bg-gray-100 text-gray-700' },
  sent: { text: 'Sent', className: 'bg-blue-100 text-blue-700' },
  rejected: { text: 'Rejected', className: 'bg-red-100 text-red-700' },
  confirmed: { text: 'Confirmed', className: 'bg-green-100 text-green-700' },
  cancelled: { text: 'Cancelled', className: 'bg-gray-200 text-gray-600' },
};

export function StatusBadge({ status }: { status: string }) {
  const s = LABELS[status as OrderStatus] ?? { text: status, className: 'bg-gray-100 text-gray-700' };
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.className}`}>{s.text}</span>;
}
