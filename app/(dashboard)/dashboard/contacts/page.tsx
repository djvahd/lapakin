import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Plus, SearchX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { can } from '@/lib/auth/permissions';
import { getTenantContext } from '@/lib/auth/tenant';
import { listHref, parseListParams } from '@/modules/contacts/form';
import { listContacts, listTags } from '@/modules/contacts/service';
import { ContactBadges } from '@/modules/contacts/ui/badges';
import { fieldClass } from '@/modules/contacts/ui/contact-form';
import { TagsPanel } from '@/modules/contacts/ui/tags-panel';

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const query = parseListParams(await searchParams);
  const [result, tags] = await Promise.all([listContacts(ctx.teamId, query), listTags(ctx.teamId)]);

  // Halaman di luar jangkauan (mis. setelah filter): kembali ke halaman terakhir.
  if (result.items.length === 0 && result.total > 0) {
    redirect(listHref(query, { page: result.pageCount }));
  }

  const filtered = Boolean(query.q || query.kind || query.role || query.tagId || query.archived);

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">Contacts</h1>
        <Link href="/dashboard/contacts/new">
          <Button className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="mr-2 h-4 w-4" /> New contact
          </Button>
        </Link>
      </div>

      <form method="get" className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5" role="search">
        <Input name="q" defaultValue={query.q ?? ''} placeholder="Search name, email, phone" aria-label="Search" className="lg:col-span-2" />
        <select name="kind" defaultValue={query.kind ?? ''} className={fieldClass} aria-label="Type">
          <option value="">All types</option>
          <option value="company">Companies</option>
          <option value="person">People</option>
        </select>
        <select name="role" defaultValue={query.role ?? ''} className={fieldClass} aria-label="Relationship">
          <option value="">Customers and suppliers</option>
          <option value="customer">Customers</option>
          <option value="supplier">Suppliers</option>
        </select>
        <select name="tag" defaultValue={query.tagId ?? ''} className={fieldClass} aria-label="Tag">
          <option value="">All tags</option>
          {tags.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="archived" value="1" defaultChecked={query.archived} /> Show archived
        </label>
        <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
          <Button type="submit" variant="outline">Filter</Button>
          {filtered && (
            <Link href="/dashboard/contacts">
              <Button type="button" variant="ghost">Reset</Button>
            </Link>
          )}
        </div>
      </form>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>
            {query.archived ? 'Archived contacts' : 'All contacts'}{' '}
            <span className="text-sm font-normal text-muted-foreground">({result.total})</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {result.items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <SearchX className="mb-4 h-12 w-12 text-orange-500" />
              <h3 className="mb-2 text-lg font-semibold text-gray-900">
                {filtered ? 'No contacts match your filters' : 'No contacts yet'}
              </h3>
              <p className="max-w-sm text-sm text-gray-500">
                {filtered ? 'Try a different search or reset the filters.' : 'Add your first customer, supplier, or company.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y">
              {result.items.map((c) => (
                <li key={c.id} className="py-3">
                  <Link href={`/dashboard/contacts/${c.id}`} className="block hover:bg-gray-50 -mx-2 px-2 py-1 rounded">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-gray-900">{c.name}</span>
                      <ContactBadges contact={c} tags={c.tags} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {[c.companyName, c.email, c.phone].filter(Boolean).join(' · ') || 'No details'}
                    </p>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {result.pageCount > 1 && (
            <nav className="mt-4 flex items-center justify-between text-sm" aria-label="Pagination">
              {result.page > 1 ? (
                <Link href={listHref(query, { page: result.page - 1 })} className="text-orange-600">← Previous</Link>
              ) : (
                <span />
              )}
              <span className="text-muted-foreground">Page {result.page} of {result.pageCount}</span>
              {result.page < result.pageCount ? (
                <Link href={listHref(query, { page: result.page + 1 })} className="text-orange-600">Next →</Link>
              ) : (
                <span />
              )}
            </nav>
          )}
        </CardContent>
      </Card>

      <TagsPanel tags={tags} canManage={can(ctx.role, 'contact:tag-manage')} />
    </section>
  );
}
