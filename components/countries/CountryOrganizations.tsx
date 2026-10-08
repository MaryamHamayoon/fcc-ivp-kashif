import Link from "next/link";
import { ContactsList } from "@/components/directory/ContactsList";
import type { CountryOrganization } from "@/lib/services/directory";

/** The organizations this country hosts, each with its contacts inline — one country rarely has more than a handful. */
export function CountryOrganizations({ organizations }: { organizations: CountryOrganization[] }) {
  if (organizations.length === 0) {
    return <p className="rounded-xl border border-dashed bg-card/60 px-4 py-6 text-center text-sm text-muted-foreground">No organizations on file for this country yet.</p>;
  }
  return (
    <div className="space-y-4">
      {organizations.map((org) => (
        <div key={org.id} className="rounded-xl border bg-card p-4 shadow-soft">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <Link
              href={`/directory/organizations/${org.id}`}
              className="font-semibold text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-sm"
            >
              {org.name}
            </Link>
            <span className="text-xs text-muted-foreground">
              {org.kindLabel} · {org.meetingCount} meeting{org.meetingCount === 1 ? "" : "s"}
            </span>
          </div>
          {org.contacts.length > 0 ? (
            <div className="mt-3">
              <ContactsList contacts={org.contacts} />
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
