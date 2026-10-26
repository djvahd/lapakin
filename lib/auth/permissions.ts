export type Role = 'owner' | 'member';

// Izin per role. Modul menambahkan izinnya sendiri di sini saat dibuat.
const permissions = {
  'team:update': ['owner'],
  'member:invite': ['owner'],
  'member:remove': ['owner'],
  'billing:manage': ['owner'],
  'contact:archive': ['owner'],
  // Mengubah atau menghapus tag memengaruhi semua anggota; membuat tag terbuka untuk semua.
  'contact:tag-manage': ['owner'],
  // Membuat, mengubah, dan memindahkan peluang terbuka untuk semua anggota.
  'crm:archive': ['owner'],
  'crm:stage-manage': ['owner'],
  // Menerima dan mengeluarkan stok terbuka untuk semua anggota; koreksi hasil hitung dan arsip hanya owner.
  'inventory:adjust': ['owner'],
  'inventory:archive': ['owner']
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof permissions;

export function can(role: string | null | undefined, permission: Permission): boolean {
  return (permissions[permission] as readonly string[]).includes(role ?? '');
}
