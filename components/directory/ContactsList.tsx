import { CopyButton } from "@/components/common/CopyButton";
import type { OrganizationContact } from "@/lib/services/directory";

/** Name, title, email and phone for a set of contacts — the disclosure body under an organization row, or a profile section. */
export function ContactsList({ contacts, emptyMessage = "No contacts on file." }: { contacts: OrganizationContact[]; emptyMessage?: string }) {
  if (contacts.length === 0) return <p className="text-sm text-muted-foreground">{emptyMessage}</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {contacts.map((contact) => (
        <li key={contact.id} className="rounded-lg border bg-background/60 p-3 text-sm">
          <p className="font-medium text-foreground">{contact.name}</p>
          {contact.title ? <p className="text-xs text-muted-foreground">{contact.title}</p> : null}
          {contact.email || contact.phone ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {contact.email ? (
                <span className="inline-flex min-w-0 items-center gap-0.5">
                  <a href={`mailto:${contact.email}`} className="truncate text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm">
                    {contact.email}
                  </a>
                  <CopyButton iconOnly value={contact.email} what="email address" whose={contact.name} className="size-6" />
                </span>
              ) : null}
              {contact.phone ? <span className="text-muted-foreground">{contact.phone}</span> : null}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
