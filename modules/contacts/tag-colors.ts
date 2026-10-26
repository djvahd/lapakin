// Pilihan warna tag. Nilai disimpan sebagai heksadesimal (skema Zod menerima #rrggbb).
export const TAG_COLORS = [
  { name: 'Red', hex: '#dc2626' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Purple', hex: '#9333ea' },
  { name: 'Gray', hex: '#6b7280' },
] as const;

// Latar tipis dari warna yang sama (alpha ~12%) dengan teks berwarna; tanpa warna memakai gaya bawaan.
export const tagStyle = (color: string | null | undefined) =>
  color ? { backgroundColor: `${color}1f`, color } : undefined;
