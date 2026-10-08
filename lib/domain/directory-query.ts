/**
 * What the People & places directory reads off its URL, and how a list is cut into pages. Pure:
 * the server page reads with it, the toolbar and the pager write the same keys back.
 */

export type DirectoryTab = "experts" | "organizations";
export type ExpertSort = "engagements" | "name";

export const DIRECTORY_PAGE_SIZE = 25;

/** The page sizes the pager offers; anything else in the URL is somebody's typing, not ours. */
export const DIRECTORY_PAGE_SIZES: readonly number[] = [25, 50, 100];

export type DirectoryQuery = { tab: DirectoryTab; q: string; bureauCode: string; sort: ExpertSort; page: number; pageSize: number };

type RawParams = Record<string, string | string[] | undefined>;

/** Next hands a repeated key over as an array; the first value is the one that counts. */
const first = (raw: RawParams, key: string): string => {
  const value = raw[key];
  return ((Array.isArray(value) ? value[0] : value) ?? "").trim();
};

const wholeNumber = (text: string): number | null => (/^\d+$/.test(text) ? Number(text) : null);

export function readDirectoryQuery(raw: RawParams): DirectoryQuery {
  const page = wholeNumber(first(raw, "page"));
  const pageSize = wholeNumber(first(raw, "pageSize"));
  return {
    tab: first(raw, "tab") === "organizations" ? "organizations" : "experts",
    q: first(raw, "q"),
    bureauCode: first(raw, "bureauCode"),
    sort: first(raw, "sort") === "name" ? "name" : "engagements",
    page: page !== null && page >= 1 ? page : 1,
    pageSize: pageSize !== null && DIRECTORY_PAGE_SIZES.includes(pageSize) ? pageSize : DIRECTORY_PAGE_SIZE,
  };
}

export type Page<T> = { items: T[]; total: number; page: number; pageSize: number };

/** One page out of a whole list. A page past the end lands on the last one, as after a filter shortens the list. */
export function pageSlice<T>(items: readonly T[], page: number, pageSize: number): Page<T> {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const current = Math.min(pages, Math.max(1, Math.trunc(page)));
  return { items: items.slice((current - 1) * pageSize, current * pageSize), total: items.length, page: current, pageSize };
}
