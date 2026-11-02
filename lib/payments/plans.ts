// Paket berbayar Lapakin (IDR). Harga diubah di sini; tahunan = 10 bulan (diskon 2 bulan).
// Paket Free tidak punya tagihan. Pembatasan fitur per paket belum diberlakukan.
export const PERIODS = ['month', 'year'] as const;
export type Period = (typeof PERIODS)[number];

export const PLANS = {
  pro: {
    name: 'Pro',
    prices: { month: 99_000, year: 990_000 } as Record<Period, number>,
    features: ['Semua modul: Kontak, CRM, Inventory, Sales, Invoicing', 'Otomasi dan notifikasi', 'Anggota tim tanpa batas'],
  },
} as const;

export type PlanKey = keyof typeof PLANS;
export const PLAN_KEYS = Object.keys(PLANS) as [PlanKey, ...PlanKey[]];

export const planPrice = (plan: PlanKey, period: Period) => PLANS[plan].prices[period];
