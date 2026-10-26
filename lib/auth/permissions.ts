export type Role = 'owner' | 'member';

// Izin per role. Modul menambahkan izinnya sendiri di sini saat dibuat.
const permissions = {
  'team:update': ['owner'],
  'member:invite': ['owner'],
  'member:remove': ['owner'],
  'billing:manage': ['owner'],
  'contact:archive': ['owner']
} as const satisfies Record<string, readonly Role[]>;

export type Permission = keyof typeof permissions;

export function can(role: string | null | undefined, permission: Permission): boolean {
  return (permissions[permission] as readonly string[]).includes(role ?? '');
}
