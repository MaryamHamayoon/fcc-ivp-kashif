import type { FilterOption } from "@/components/common/SelectFilter";
import type { NamedCount } from "@/lib/domain/tallies";
import type { LibraryFilterOptions } from "@/lib/services/library";

/** What the library toolbar can offer, shaped for the shared filter controls. */
export type LibraryOptions = {
  kinds: FilterOption[];
  topics: FilterOption[];
  /** Hinted with the region's name, so the searchable list reads "Kenya · Africa". */
  countries: FilterOption[];
  regions: FilterOption[];
  organizations: FilterOption[];
  /** Newest first. */
  fiscalYears: number[];
  /** Topics with starred documents, most first — the reuse strip. */
  reusableTopics: NamedCount[];
  reusableTotal: number;
};

/** The service's facets become option lists; the server page calls this once per render. */
export function toLibraryOptions(options: LibraryFilterOptions): LibraryOptions {
  const regionNames = new Map(options.regions.map((region) => [region.id, region.name]));
  return {
    kinds: options.kinds.map((kind) => ({ value: kind.value, label: kind.label })),
    topics: options.topics.map((topic) => ({ value: topic.id, label: topic.name })),
    countries: options.countries.map((country) => ({ value: country.code, label: country.name, hint: regionNames.get(country.regionId) })),
    regions: options.regions.map((region) => ({ value: region.id, label: region.name })),
    organizations: options.organizations.map((org) => ({ value: org.id, label: org.name })),
    fiscalYears: options.fiscalYears,
    reusableTopics: options.reusableTopics,
    reusableTotal: options.reusableTotal,
  };
}
