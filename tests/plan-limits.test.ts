import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { neon } from '@neondatabase/serverless';
import { ruleInputSchema } from '@/modules/automation/schemas';
import { AutomationError, createRule, deleteRule, setRuleActive, updateRule, type Actor } from '@/modules/automation/service';
import { scanTeam } from '@/modules/automation/scan';
import { getSubscription } from '@/lib/payments/subscription';

// Tes integrasi terhadap database sungguhan (branch dev Neon), sebagai role lapakin_app.
const ownerUrl = process.env.MIGRATION_URL;
if (!ownerUrl) throw new Error('MIGRATION_URL belum diisi di .env');
const owner = neon(ownerUrl);

const tag = `limits-test-${Date.now()}`;
let u1 = 0;
let T: Actor;

const rule = (o: Record<string, unknown> = {}) =>
  ruleInputSchema.parse({ name: 'Aturan', event: 'invoice.overdue', action: 'notify', actionConfig: { title: 'x' }, ...o });
const setPlan = (expiresSql: 'null' | 'future' | 'past') =>
  expiresSql === 'null'
    ? owner`update teams set plan_name = null, subscription_status = null, plan_expires_at = null where id = ${T.teamId}`
    : expiresSql === 'future'
      ? owner`update teams set plan_name = 'pro', subscription_status = 'active', plan_expires_at = now() + interval '1 day' where id = ${T.teamId}`
      : owner`update teams set plan_name = 'pro', subscription_status = 'active', plan_expires_at = now() - interval '1 day' where id = ${T.teamId}`;
const expectPlanRequired = async (p: Promise<unknown>) => {
  const e = await p.then(
    () => null,
    (err) => err
  );
  expect(e).toBeInstanceOf(AutomationError);
  expect((e as AutomationError).code).toBe('plan_required');
};

beforeAll(async () => {
  u1 = (await owner`insert into users (email, password_hash) values (${tag + '@test.local'}, 'x') returning id`)[0].id;
  const t = (await owner`insert into teams (name) values (${tag}) returning id`)[0].id as number;
  T = { teamId: t, userId: u1 };
  await owner`insert into team_members (user_id, team_id, role) values (${u1}, ${t}, 'owner')`;
});

afterAll(async () => {
  for (const t of ['activity_logs', 'auto_notifications', 'auto_runs', 'auto_rules', 'team_members']) {
    await owner.query(`delete from ${t} where team_id = ${T.teamId}`);
  }
  await owner`delete from teams where id = ${T.teamId}`;
  await owner`delete from users where id = ${u1}`;
});

describe('paket Free dan Pro', () => {
  it('Free (belum pernah berlangganan): tidak bisa membuat aturan', async () => {
    await setPlan('null');
    expect(await getSubscription(T.teamId)).toMatchObject({ plan: 'free', active: false });
    await expectPlanRequired(createRule(T, rule()));
  });

  it('Pro aktif bisa membuat dan mengubah aturan', async () => {
    await setPlan('future');
    expect(await getSubscription(T.teamId)).toMatchObject({ plan: 'pro', active: true });
    const r = await createRule(T, rule({ name: 'Boleh' }));
    expect((await updateRule(T, r.id, rule({ name: 'Diubah' }))).name).toBe('Diubah');
  });

  it('paket habis: aturan lama tersimpan, tidak bisa dinyalakan atau diubah aktif, tetapi boleh dimatikan dan dihapus', async () => {
    await setPlan('future');
    const r = await createRule(T, rule({ name: 'Lama' }));
    await setPlan('past');
    expect(await getSubscription(T.teamId)).toMatchObject({ plan: 'free', active: false });

    await expectPlanRequired(updateRule(T, r.id, rule({ name: 'Ubah', active: true })));
    await expectPlanRequired(setRuleActive(T, r.id, true));
    // Menyimpan sebagai nonaktif, mematikan, dan menghapus tetap diizinkan.
    expect((await updateRule(T, r.id, rule({ name: 'Rapikan', active: false }))).active).toBe(false);
    expect((await setRuleActive(T, r.id, false)).active).toBe(false);
    await deleteRule(T, r.id);
  });

  it('pemindai harian melewati toko tanpa paket aktif', async () => {
    await setPlan('future');
    await createRule(T, rule({ name: 'Pindai' }));
    await setPlan('past');
    expect(await scanTeam(T.teamId, '2026-11-10')).toEqual({ emitted: 0, failed: 0 });
  });
});
