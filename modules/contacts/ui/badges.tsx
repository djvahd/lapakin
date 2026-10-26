import type { Contact } from '../schema';
import type { TagSummary } from '../service';
import { tagStyle } from '../tag-colors';

const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';

export function TagChip({ tag }: { tag: Pick<TagSummary, 'name' | 'color'> }) {
  return (
    <span className={`${base} ${tag.color ? '' : 'bg-orange-100 text-orange-700'}`} style={tagStyle(tag.color)}>
      {tag.name}
    </span>
  );
}

export function ContactBadges({ contact, tags = [] }: { contact: Pick<Contact, 'kind' | 'isCustomer' | 'isSupplier'>; tags?: TagSummary[] }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className={`${base} bg-gray-100 text-gray-700`}>{contact.kind === 'company' ? 'Company' : 'Person'}</span>
      {contact.isCustomer && <span className={`${base} bg-green-100 text-green-700`}>Customer</span>}
      {contact.isSupplier && <span className={`${base} bg-blue-100 text-blue-700`}>Supplier</span>}
      {tags.map((t) => (
        <TagChip key={t.id} tag={t} />
      ))}
    </span>
  );
}
