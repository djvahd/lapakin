import { describe, expect, it } from 'vitest';
import { moduleActivityText } from '@/lib/activity-labels';

describe('moduleActivityText', () => {
  it('menulis aksi kontak lengkap dengan nama dari metadata', () => {
    expect(moduleActivityText('CONTACT_CREATED', { name: 'PT Maju' })).toBe('You added contact "PT Maju"');
    expect(moduleActivityText('CONTACT_UPDATED', { name: 'Budi' })).toBe('You updated contact "Budi"');
    expect(moduleActivityText('CONTACT_ARCHIVED', { name: 'Budi' })).toBe('You archived contact "Budi"');
    expect(moduleActivityText('CONTACT_RESTORED', { name: 'Budi' })).toBe('You restored contact "Budi"');
    expect(moduleActivityText('CONTACT_TAG_CREATED', { name: 'VIP' })).toBe('You added the tag "VIP"');
    expect(moduleActivityText('CONTACT_TAG_UPDATED', { name: 'VIP' })).toBe('You updated the tag "VIP"');
    expect(moduleActivityText('CONTACT_TAG_DELETED', { name: 'VIP' })).toBe('You deleted the tag "VIP"');
  });

  it('menulis aksi CRM dengan judul peluang, tahap tujuan, dan ringkasan tindak lanjut', () => {
    expect(moduleActivityText('CRM_OPPORTUNITY_CREATED', { title: 'Proyek A' })).toBe('You added opportunity "Proyek A"');
    expect(moduleActivityText('CRM_OPPORTUNITY_UPDATED', { title: 'Proyek A' })).toBe('You updated opportunity "Proyek A"');
    expect(moduleActivityText('CRM_OPPORTUNITY_MOVED', { title: 'Proyek A', toStage: 'Won' })).toBe(
      'You moved opportunity "Proyek A" to Won'
    );
    expect(moduleActivityText('CRM_OPPORTUNITY_MOVED', { title: 'Proyek A' })).toBe('You moved opportunity "Proyek A"');
    expect(moduleActivityText('CRM_OPPORTUNITY_ARCHIVED', { title: 'Proyek A' })).toBe('You archived opportunity "Proyek A"');
    expect(moduleActivityText('CRM_OPPORTUNITY_RESTORED', { title: 'Proyek A' })).toBe('You restored opportunity "Proyek A"');
    expect(moduleActivityText('CRM_ACTIVITY_CREATED', { summary: 'Telepon' })).toBe('You scheduled a follow-up "Telepon"');
    expect(moduleActivityText('CRM_ACTIVITY_DONE', { summary: 'Telepon' })).toBe('You completed a follow-up "Telepon"');
    expect(moduleActivityText('CRM_ACTIVITY_REOPENED', null)).toBe('You reopened a follow-up');
  });

  it('tetap menghasilkan teks bila metadata kosong atau bentuknya salah', () => {
    expect(moduleActivityText('CONTACT_CREATED', null)).toBe('You added contact');
    expect(moduleActivityText('CONTACT_CREATED', undefined)).toBe('You added contact');
    expect(moduleActivityText('CONTACT_CREATED', 'teks')).toBe('You added contact');
    expect(moduleActivityText('CONTACT_CREATED', ['a'])).toBe('You added contact');
    expect(moduleActivityText('CONTACT_CREATED', { name: 123 })).toBe('You added contact');
  });

  it('aksi bawaan starter dan aksi tak dikenal menghasilkan null (ditangani halaman)', () => {
    expect(moduleActivityText('SIGN_IN', null)).toBeNull();
    expect(moduleActivityText('SOMETHING_ELSE', {})).toBeNull();
  });
});
