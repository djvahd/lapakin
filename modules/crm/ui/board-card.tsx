import Link from 'next/link';
import { CalendarClock } from 'lucide-react';
import type { BoardItem } from '../service';
import { PRIORITY_LABELS, formatDate, formatMoney, isOverdue } from '../format';
import { MoveSelect } from './move-select';

const priorityStyle = ['', 'bg-blue-100 text-blue-700', 'bg-orange-100 text-orange-700', 'bg-red-100 text-red-700'];

export function BoardCard({
  item,
  stages,
  today,
}: {
  item: BoardItem;
  stages: { id: number; name: string; kind: string }[];
  today: string;
}) {
  const lateFollowUp = isOverdue(item.nextActivityDue, today);

  return (
    <li className="space-y-2 rounded-md border bg-white p-3 shadow-xs">
      <Link href={`/dashboard/crm/${item.id}`} className="block space-y-1 hover:underline">
        <span className="block text-sm font-medium text-gray-900">{item.title}</span>
      </Link>
      {item.contactName && <p className="text-xs text-muted-foreground">{item.contactName}</p>}
      <div className="flex flex-wrap items-center justify-between gap-1 text-xs">
        <span className="font-medium text-gray-900">{formatMoney(item.expectedValue)}</span>
        {item.priority > 0 && (
          <span className={`rounded-full px-2 py-0.5 font-medium ${priorityStyle[item.priority]}`}>{PRIORITY_LABELS[item.priority]}</span>
        )}
      </div>
      {(item.expectedCloseDate || item.openActivities > 0) && (
        <div className="space-y-0.5 text-xs text-muted-foreground">
          {item.expectedCloseDate && <p>Close {formatDate(item.expectedCloseDate)}</p>}
          {item.openActivities > 0 && (
            <p className={`flex items-center gap-1 ${lateFollowUp ? 'font-medium text-red-600' : ''}`}>
              <CalendarClock className="h-3 w-3" />
              {item.openActivities} follow-up{item.openActivities === 1 ? '' : 's'}
              {item.nextActivityDue ? ` · ${lateFollowUp ? 'overdue ' : 'next '}${formatDate(item.nextActivityDue)}` : ''}
            </p>
          )}
        </div>
      )}
      {item.ownerName && <p className="text-xs text-muted-foreground">{item.ownerName}</p>}
      <MoveSelect opportunityId={item.id} currentStageId={item.stageId} stages={stages} compact />
    </li>
  );
}
