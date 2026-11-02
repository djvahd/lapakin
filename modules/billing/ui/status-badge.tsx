// Satu lencana untuk status faktur: draft/batal dari status, faktur terbit dari status bayarnya.
type Props = { status: string; paymentStatus: 'unpaid' | 'partial' | 'paid'; overdue: boolean };

export function InvoiceBadge({ status, paymentStatus, overdue }: Props) {
  let text: string;
  let className: string;
  if (status === 'draft') [text, className] = ['Draft', 'bg-gray-100 text-gray-700'];
  else if (status === 'void') [text, className] = ['Void', 'bg-gray-200 text-gray-600'];
  else if (paymentStatus === 'paid') [text, className] = ['Paid', 'bg-green-100 text-green-700'];
  else if (overdue) [text, className] = ['Overdue', 'bg-red-100 text-red-700'];
  else if (paymentStatus === 'partial') [text, className] = ['Partially paid', 'bg-yellow-100 text-yellow-800'];
  else [text, className] = ['Unpaid', 'bg-blue-100 text-blue-700'];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>{text}</span>;
}
