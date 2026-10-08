import type { FilterOption } from "@/components/common/SelectFilter";
import { fyLabel } from "@/lib/domain/glance";
import type { ActivityFilterOptions } from "@/lib/services/activity-feed";

/** What the Activity toolbar can offer, shaped for the shared filter controls. */
export type ActivityOptions = {
  kinds: FilterOption[];
  /** Who a wait can be on. */
  parties: FilterOption[];
  authors: FilterOption[];
  regions: FilterOption[];
  /** Newest first. */
  fiscalYears: FilterOption[];
  statuses: FilterOption[];
};

/** Short, because the group's own heading already says "Waiting on". */
const PARTIES: FilterOption[] = [
  { value: "visitor", label: "Visiting delegation" },
  { value: "expert", label: "FCC expert" },
  { value: "internal", label: "OIA front office" },
  { value: "och", label: "Office of the Chairman" },
];

/** The service's facets become option lists; the server page calls this once per render. */
export function toActivityOptions(options: ActivityFilterOptions): ActivityOptions {
  return {
    kinds: options.kinds.map((kind) => ({ value: kind.value, label: kind.label })),
    parties: PARTIES,
    authors: options.authors.map((author) => ({ value: author.id, label: author.name })),
    regions: options.regions.map((region) => ({ value: region.id, label: region.name })),
    fiscalYears: options.fiscalYears.map((fy) => ({ value: String(fy), label: fyLabel(fy) })),
    statuses: options.statuses.map((status) => ({ value: status.value, label: status.label })),
  };
}
