import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { getTenantContext } from '@/lib/auth/tenant';
import { listNotifications } from '@/modules/automation/service';
import { MarkReadButton } from '@/modules/automation/ui/mark-read-button';

export default async function NotificationsPage() {
  const ctx = await getTenantContext();
  if (!ctx) redirect('/sign-in');

  const items = await listNotifications(ctx.teamId, ctx.user.id, { limit: 50 });
  const unread = items.filter((n) => !n.readAt).length;

  return (
    <section className="flex-1 p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg lg:text-2xl font-medium text-gray-900">Notifications</h1>
        {unread > 0 && <MarkReadButton label="Mark all as read" />}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            Latest <span className="text-sm font-normal text-muted-foreground">({unread} unread)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {items.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nothing yet. Rules in Automation create notifications here.
            </p>
          ) : (
            <ul className="divide-y">
              {items.map((n) => (
                <li key={n.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                  <div>
                    <p className={n.readAt ? 'text-gray-600' : 'font-medium text-gray-900'}>
                      {n.link ? (
                        <Link href={n.link} className="hover:underline">{n.title}</Link>
                      ) : (
                        n.title
                      )}
                    </p>
                    {n.body && <p className="text-sm text-muted-foreground">{n.body}</p>}
                    <p className="text-xs text-muted-foreground">{n.createdAt.toLocaleString()}</p>
                  </div>
                  {!n.readAt && <MarkReadButton id={n.id} label="Mark as read" />}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
