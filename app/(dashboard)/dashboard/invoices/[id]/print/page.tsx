import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getTenantContext } from '@/lib/auth/tenant';
import { getTeamName } from '@/lib/db/queries';
import { formatNumber } from '@/modules/billing/audit-labels';
import { getInvoice } from '@/modules/billing/service';
import { PrintButton } from '@/modules/billing/ui/print-button';
import { todayIn } from '@/modules/crm/format';

// Tampilan cetak faktur. Menu dan header dashboard disembunyikan saat mencetak (print:hidden).
export default async function InvoicePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const inv = await getInvoice(ctx.teamId, id, todayIn());
  // Draft belum menjadi dokumen tagihan; hanya faktur terbit dan batal yang bisa dicetak.
  if (!inv || inv.status === 'draft') notFound();
  const store = await getTeamName(ctx.teamId);

  return (
    <section className="mx-auto max-w-3xl bg-white p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between print:hidden">
        <Link href={`/dashboard/invoices/${id}`} className="text-sm text-orange-600">← Invoice</Link>
        <PrintButton />
      </div>

      <header className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">INVOICE</h1>
          <p className="text-lg">{formatNumber(inv.number)}</p>
          {inv.status === 'void' && <p className="mt-1 text-sm font-semibold uppercase text-red-600">Void</p>}
        </div>
        <div className="text-right text-sm">
          <p className="font-medium">{store ?? ''}</p>
          <p className="text-muted-foreground">Issued {inv.issueDate}</p>
          <p className="text-muted-foreground">Due {inv.dueDate}</p>
        </div>
      </header>

      <div className="mb-6 text-sm">
        <p className="text-muted-foreground">Bill to</p>
        <p className="font-medium">{inv.contactName ?? '—'}</p>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left">
            <th className="py-2 font-medium">Description</th>
            <th className="py-2 text-right font-medium">Qty</th>
            <th className="py-2 text-right font-medium">Unit price</th>
            <th className="py-2 text-right font-medium">Disc.</th>
            <th className="py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {inv.lines.map((l) => (
            <tr key={l.id} className="border-b">
              <td className="py-2">{l.description}</td>
              <td className="py-2 text-right tabular-nums">{l.quantity}</td>
              <td className="py-2 text-right tabular-nums">{l.unitPrice.toLocaleString()}</td>
              <td className="py-2 text-right tabular-nums">{l.discountPct > 0 ? `${l.discountPct}%` : ''}</td>
              <td className="py-2 text-right tabular-nums">{l.total.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <dl className="mt-4 ml-auto w-64 space-y-1 text-sm">
        <div className="flex justify-between"><dt>Total</dt><dd className="tabular-nums">{inv.total.toLocaleString()}</dd></div>
        <div className="flex justify-between"><dt>Paid</dt><dd className="tabular-nums">{inv.paid.toLocaleString()}</dd></div>
        <div className="flex justify-between border-t pt-1 text-base font-semibold">
          <dt>Balance due</dt><dd className="tabular-nums">{inv.balance.toLocaleString()}</dd>
        </div>
      </dl>

      {inv.notes && <p className="mt-8 whitespace-pre-line text-sm text-muted-foreground">{inv.notes}</p>}
    </section>
  );
}
