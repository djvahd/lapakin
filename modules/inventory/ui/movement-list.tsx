import Link from 'next/link';
import type { MovementListItem } from '../service';

const KIND_LABEL: Record<string, string> = {
  receipt: 'Received',
  issue: 'Issued',
  adjustment: 'Count adjustment',
  sale: 'Sale',
  return: 'Return',
};

// Daftar mutasi stok (buku besar), terbaru di atas. Dipakai halaman riwayat dan halaman produk.
export function MovementList({ items, showProduct = true }: { items: MovementListItem[]; showProduct?: boolean }) {
  if (items.length === 0) return <p className="text-sm text-muted-foreground">No stock movements yet.</p>;

  return (
    <ul className="divide-y">
      {items.map((m) => (
        <li key={m.id} className="py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-gray-900">
              {showProduct ? (
                <Link href={`/dashboard/inventory/${m.productId}`} className="hover:underline">
                  {m.productName}
                </Link>
              ) : null}
              {m.variantName && <span className="text-muted-foreground">{showProduct ? ' · ' : ''}{m.variantName}</span>}
              {!showProduct && !m.variantName && 'Default'}
            </span>
            <span className={`text-sm font-medium ${m.quantity < 0 ? 'text-red-600' : 'text-green-600'}`}>
              {m.quantity > 0 ? '+' : ''}
              {m.quantity}
            </span>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {[
              KIND_LABEL[m.kind] ?? m.kind,
              m.note,
              m.userName,
              new Date(m.createdAt).toLocaleString(),
            ]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </li>
      ))}
    </ul>
  );
}
