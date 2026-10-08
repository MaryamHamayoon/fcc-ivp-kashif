/**
 * Everything the meetings toolbar needs to name a filter value. Loaded once on the server
 * and handed to the client workspace, so opening a filter never costs a round trip.
 */

import type { FilterOption } from "@/components/common/SelectFilter";

export type { FilterOption };

export type MeetingsFilterOptions = {
  regions: FilterOption[];
  countries: FilterOption[];
  topics: FilterOption[];
  bureaus: FilterOption[];
  leads: FilterOption[];
  /** Newest first; the saved views and the FY filter share this list. */
  fiscalYears: number[];
  currentFiscalYear: number;
  /** Powers the "Space Bureau" saved view; null if the bureau list ever drops it. */
  spaceBureauCode: string | null;
  /** The signed-in user's first region, for the "My region" saved view. */
  myRegion: FilterOption | null;
};
