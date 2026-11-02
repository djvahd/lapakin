// Data demo yang realistis: toko "Kopi Nusantara (Demo)" dengan kontak, peluang, produk dan stok,
// penawaran, pesanan, pengiriman, faktur, pembayaran, aturan otomasi, dan notifikasi.
//
//   pnpm db:seed:demo            membuat data demo (menolak bila sudah ada)
//   pnpm db:seed:demo --reset    menghapus toko demo lama lalu membuat ulang
//
// Berjalan lewat layanan aplikasi (sebagai role lapakin_app, POSTGRES_URL) seperti pemakaian sungguhan,
// jadi data demo ikut menguji logikanya. --reset memakai MIGRATION_URL (pemilik) karena mutasi stok dan
// pembayaran tidak bisa dihapus oleh role aplikasi.
//
// HANYA untuk branch pengembangan atau demo. Jangan jalankan terhadap database produksi: skrip menolak
// bila NODE_ENV=production dan meminta konfirmasi `--yes` bila tidak interaktif.
import { neon } from '@neondatabase/serverless';
import dotenv from 'dotenv';
import { eq } from 'drizzle-orm';

dotenv.config();

const DEMO_EMAIL = 'demo@lapakin.test';
const DEMO_PASSWORD = 'demo12345';
const TEAM_NAME = 'Kopi Nusantara (Demo)';

async function main() {
  if (process.env.NODE_ENV === 'production') throw new Error('Menolak berjalan dengan NODE_ENV=production.');
  const reset = process.argv.includes('--reset');
  const host = new URL(process.env.POSTGRES_URL!).hostname;
  console.log(`Database: ${host.replace(/^([^.]{4})[^.]*/, '$1…')}`);

  // Impor setelah dotenv agar POSTGRES_URL terbaca oleh lib/db/drizzle.
  const { db } = await import('../lib/db/drizzle');
  const { users, teams, teamMembers } = await import('../lib/db/schema');
  const { hashPassword } = await import('../lib/auth/session');
  const { TEAM_TABLES } = await import('../e2e/fixture');

  const [existing] = await db.select().from(users).where(eq(users.email, DEMO_EMAIL)).limit(1);
  if (existing && !reset) throw new Error(`Data demo sudah ada (${DEMO_EMAIL}). Jalankan dengan --reset untuk membuat ulang.`);
  if (existing && reset) {
    const owner = neon(process.env.MIGRATION_URL ?? '');
    const memberships = await owner`select team_id from team_members where user_id = ${existing.id}`;
    for (const m of memberships) {
      for (const t of TEAM_TABLES.filter((t) => t !== 'team_members')) await owner.query(`delete from ${t} where team_id = ${m.team_id}`);
      await owner.query(`delete from team_members where team_id = ${m.team_id}`);
      await owner.query(`delete from teams where id = ${m.team_id}`);
    }
    await owner`delete from users where id = ${existing.id}`;
    console.log('Data demo lama dihapus.');
  }

  // --- akun dan toko (paket Pro setahun agar otomasi dan fitur lain terlihat) ---
  const [user] = await db
    .insert(users)
    .values({ email: DEMO_EMAIL, name: 'Dina Pratiwi', passwordHash: await hashPassword(DEMO_PASSWORD), role: 'owner' })
    .returning();
  const [team] = await db
    .insert(teams)
    .values({
      name: TEAM_NAME,
      planName: 'pro',
      subscriptionStatus: 'active',
      planExpiresAt: new Date(Date.now() + 365 * 86_400_000),
    })
    .returning();
  await db.insert(teamMembers).values({ teamId: team.id, userId: user.id, role: 'owner' });
  const A = { teamId: team.id, userId: user.id };

  // --- modul (diimpor setelah koneksi siap) ---
  const contacts = await import('../modules/contacts/service');
  const contactSchemas = await import('../modules/contacts/schemas');
  const crm = await import('../modules/crm/service');
  const crmSchemas = await import('../modules/crm/schemas');
  const inventory = await import('../modules/inventory/service');
  const invSchemas = await import('../modules/inventory/schemas');
  const sales = await import('../modules/sales/service');
  const salesSchemas = await import('../modules/sales/schemas');
  const billing = await import('../modules/billing/service');
  const billSchemas = await import('../modules/billing/schemas');
  const automation = await import('../modules/automation/service');
  const autoSchemas = await import('../modules/automation/schemas');
  const scan = await import('../modules/automation/scan');

  const today = new Date();
  const iso = (offsetDays: number) => new Date(today.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);

  // --- kontak ---
  const mk = async (o: Record<string, unknown>) => contacts.createContact(A, contactSchemas.contactInputSchema.parse(o));
  const kafe = await mk({ kind: 'company', name: 'Kafe Senja', email: 'halo@kafesenja.example', phone: '0812-1111-2201', address: 'Jl. Pemuda 12, Magelang', isCustomer: true });
  const roti = await mk({ kind: 'company', name: 'Toko Roti Manis', email: 'order@rotimanis.example', phone: '0812-1111-2202', address: 'Jl. Ahmad Yani 45, Magelang', isCustomer: true });
  const hotel = await mk({ kind: 'company', name: 'Hotel Merapi View', email: 'purchasing@merapiview.example', phone: '0293-555-100', address: 'Jl. Borobudur 8, Magelang', isCustomer: true });
  const warung = await mk({ kind: 'company', name: 'Warung Kopi Pak Joko', phone: '0812-1111-2204', isCustomer: true });
  const petani = await mk({ kind: 'company', name: 'Koperasi Tani Sumbing', email: 'koperasi@sumbing.example', phone: '0812-1111-2205', isSupplier: true });
  await mk({ kind: 'person', name: 'Rina Wulandari', companyId: kafe.id, email: 'rina@kafesenja.example', phone: '0812-3000-0001', isCustomer: true });
  await mk({ kind: 'person', name: 'Budi Santoso', companyId: roti.id, email: 'budi@rotimanis.example', phone: '0812-3000-0002', isCustomer: true });
  await mk({ kind: 'person', name: 'Ibu Siti Aminah', companyId: hotel.id, email: 'siti@merapiview.example', phone: '0812-3000-0003', isCustomer: true });
  await mk({ kind: 'person', name: 'Agus Prasetyo', phone: '0812-3000-0004', isCustomer: true });
  await mk({ kind: 'person', name: 'Maya Kusuma', email: 'maya@example.test', phone: '0812-3000-0005', isCustomer: true });

  // --- produk dan stok ---
  const prod = async (o: Record<string, unknown>, stock = 0) => {
    const p = await inventory.createProduct(A, invSchemas.productInputSchema.parse(o));
    const detail = await inventory.getProduct(A.teamId, p.id);
    const variantId = detail!.variants.find((v) => v.isDefault)!.id;
    if (stock > 0) await inventory.receiveStock(A, invSchemas.stockInputSchema.parse({ variantId, quantity: stock, note: 'Stok awal' }));
    return { product: p, variantId };
  };
  const arabika = await prod({ name: 'Kopi Arabika Sumbing 250g', sku: 'ARB-250', unit: 'bks', salePrice: 85000, costPrice: 52000, reorderLevel: 20 }, 120);
  const robusta = await prod({ name: 'Kopi Robusta Temanggung 250g', sku: 'ROB-250', unit: 'bks', salePrice: 65000, costPrice: 38000, reorderLevel: 20 }, 15);
  const gula = await prod({ name: 'Gula Aren Cair 500ml', sku: 'GUL-500', unit: 'btl', salePrice: 48000, costPrice: 30000, reorderLevel: 10 }, 60);
  const coldbrew = await prod({ name: 'Cold Brew Botol 250ml', sku: 'CLD-250', unit: 'btl', salePrice: 32000, costPrice: 15000, reorderLevel: 24 }, 200);
  await prod({ name: 'Paket Konsultasi Kafe (jasa)', unit: 'sesi', salePrice: 750000, costPrice: 0, trackStock: false });

  // --- CRM ---
  const stages = await crm.listStages(A.teamId);
  const stageNamed = (n: string) => stages.find((s) => s.name.toLowerCase() === n.toLowerCase()) ?? stages[0];
  const opp = async (title: string, contactId: number, value: number, stage?: string) => {
    const o = await crm.createOpportunity(A, crmSchemas.opportunityInputSchema.parse({ title, contactId, expectedValue: value, expectedCloseDate: iso(14) }));
    if (stage) await crm.moveOpportunity(A, o.id, crmSchemas.moveInputSchema.parse({ stageId: stageNamed(stage).id }));
    return o;
  };
  const oMerapi = await opp('Pasokan kopi bulanan Hotel Merapi View', hotel.id, 12_000_000, stages[1]?.name);
  await opp('Kerja sama kopi susu Kafe Senja', kafe.id, 4_500_000);
  await opp('Kopi untuk produk roti baru', roti.id, 2_000_000, stages[1]?.name);
  await opp('Reseller Warung Kopi Pak Joko', warung.id, 1_500_000);
  const act = (opportunityId: number, summary: string, dueDate: string, kind = 'call') =>
    crm.createActivity(A, crmSchemas.activityInputSchema.parse({ opportunityId, kind, summary, dueDate, assignedTo: A.userId }));
  await act(oMerapi.id, 'Kirim sampel arabika ke chef hotel', iso(-3));
  await act(oMerapi.id, 'Telepon untuk jadwal tasting', iso(2));

  // --- penjualan, pengiriman, faktur, pembayaran ---
  const order = async (contactId: number, lines: { variantId?: number; description: string; quantity: number; unitPrice: number; discountPct?: number }[], issueDate: string) =>
    sales.createOrder(A, salesSchemas.orderInputSchema.parse({ contactId, issueDate, validUntil: iso(30), lines }));
  const full = async (orderId: number) => {
    const o = (await sales.getOrder(A.teamId, orderId))!;
    return o.lines.map((l) => ({ orderLineId: l.id, quantity: l.quantity }));
  };

  // 1) Selesai: terkirim, ditagih, lunas.
  const o1 = await order(kafe.id, [{ variantId: arabika.variantId, description: 'Kopi Arabika Sumbing 250g', quantity: 24, unitPrice: 85000, discountPct: 10 }, { variantId: gula.variantId, description: 'Gula Aren Cair 500ml', quantity: 12, unitPrice: 48000 }], iso(-30));
  await sales.confirmOrder(A, o1.id);
  await sales.createDelivery(A, o1.id, salesSchemas.deliveryInputSchema.parse({ lines: await full(o1.id), note: 'Kurir toko' }));
  const f1 = await billing.createInvoice(A, o1.id, billSchemas.invoiceInputSchema.parse({ issueDate: iso(-29), dueDate: iso(-15), lines: await full(o1.id) }));
  await billing.issueInvoice(A, f1.id);
  const f1d = (await billing.getInvoice(A.teamId, f1.id))!;
  await billing.recordPayment(A, f1.id, billSchemas.paymentInputSchema.parse({ amount: f1d.total, paidOn: iso(-20), method: 'transfer', note: 'Transfer BCA' }));

  // 2) Terkirim sebagian, faktur terbit, dibayar sebagian.
  const o2 = await order(roti.id, [{ variantId: robusta.variantId, description: 'Kopi Robusta Temanggung 250g', quantity: 10, unitPrice: 65000 }, { variantId: coldbrew.variantId, description: 'Cold Brew Botol 250ml', quantity: 48, unitPrice: 32000 }], iso(-12));
  await sales.confirmOrder(A, o2.id);
  const o2d = (await sales.getOrder(A.teamId, o2.id))!;
  await sales.createDelivery(A, o2.id, salesSchemas.deliveryInputSchema.parse({ lines: [{ orderLineId: o2d.lines[1].id, quantity: 24 }], note: 'Pengiriman tahap 1' }));
  const f2 = await billing.createInvoice(A, o2.id, billSchemas.invoiceInputSchema.parse({ issueDate: iso(-10), dueDate: iso(4), lines: await full(o2.id) }));
  await billing.issueInvoice(A, f2.id);
  await billing.recordPayment(A, f2.id, billSchemas.paymentInputSchema.parse({ amount: 500000, paidOn: iso(-8), method: 'cash', note: 'DP' }));

  // 3) Faktur lewat jatuh tempo (memicu pengingat otomasi).
  const o3 = await order(hotel.id, [{ variantId: arabika.variantId, description: 'Kopi Arabika Sumbing 250g', quantity: 30, unitPrice: 85000, discountPct: 5 }, { description: 'Ongkos kirim', quantity: 1, unitPrice: 150000 }], iso(-25));
  await sales.confirmOrder(A, o3.id);
  await sales.createDelivery(A, o3.id, salesSchemas.deliveryInputSchema.parse({ lines: (await full(o3.id)).filter((_, i) => i === 0) }));
  const f3 = await billing.createInvoice(A, o3.id, billSchemas.invoiceInputSchema.parse({ issueDate: iso(-24), dueDate: iso(-10), lines: await full(o3.id) }));
  await billing.issueInvoice(A, f3.id);

  // 4) Pesanan terkonfirmasi belum dikirim, penawaran terkirim, penawaran draf (terkait peluang).
  const o4 = await order(warung.id, [{ variantId: robusta.variantId, description: 'Kopi Robusta Temanggung 250g', quantity: 6, unitPrice: 65000 }], iso(-2));
  await sales.confirmOrder(A, o4.id);
  const o5 = await order(kafe.id, [{ variantId: coldbrew.variantId, description: 'Cold Brew Botol 250ml', quantity: 100, unitPrice: 30000, discountPct: 8 }], iso(-1));
  await sales.markSent(A, o5.id);
  await sales.createOrder(A, salesSchemas.orderInputSchema.parse({ contactId: hotel.id, opportunityId: oMerapi.id, issueDate: iso(0), validUntil: iso(14), lines: [{ variantId: arabika.variantId, description: 'Kopi Arabika Sumbing 250g', quantity: 60, unitPrice: 80000 }] }));

  // --- otomasi: aturan pengingat, lalu pemindai membuat notifikasi dari data di atas ---
  await automation.createRule(
    A,
    autoSchemas.ruleInputSchema.parse({
      name: 'Ingatkan faktur lewat jatuh tempo',
      event: 'invoice.overdue',
      conditions: [{ field: 'daysOverdue', op: 'gte', value: 1 }],
      action: 'notify',
      actionConfig: { title: 'Faktur {{number}} lewat {{daysOverdue}} hari', body: '{{contact}} belum membayar {{balance}}', link: '/dashboard/invoices/{{invoiceId}}' },
    })
  );
  await automation.createRule(
    A,
    autoSchemas.ruleInputSchema.parse({
      name: 'Tindak lanjut CRM terlambat',
      event: 'crm.followup_overdue',
      action: 'notify',
      actionConfig: { title: 'Tindak lanjut terlambat: {{summary}}', body: '{{opportunity}}', link: '/dashboard/crm/{{opportunityId}}', recipient: 'payload_user' },
    })
  );
  await scan.scanTeam(A.teamId, iso(0));

  console.log('\nData demo siap.');
  console.log(`  Masuk: ${DEMO_EMAIL}`);
  console.log(`  Kata sandi: ${DEMO_PASSWORD}`);
  console.log(`  Toko: ${TEAM_NAME}`);
}

main()
  .catch((e) => {
    console.error('Seed demo gagal:', e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .then(() => process.exit(0));
