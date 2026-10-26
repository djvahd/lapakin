// Format tampilan CRM. Murni, supaya mudah dites.

const rupiah = new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 });

export const formatMoney = (n: number) => rupiah.format(n);

export const PRIORITY_LABELS = ['Normal', 'Medium', 'High', 'Urgent'] as const;

// "2026-11-05" ke "5 Nov 2026" tanpa konversi zona waktu (tanggal kalender, bukan waktu).
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

// Tanggal hari ini (YYYY-MM-DD) menurut zona waktu tertentu; bawaan Asia/Jakarta, tempat pengguna sasaran.
export function todayIn(timeZone = 'Asia/Jakarta', now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Terlambat bila jatuh tempo sebelum hari ini (perbandingan string ISO sudah benar secara urutan).
export const isOverdue = (due: string | null | undefined, today: string) => Boolean(due) && (due as string) < today;
