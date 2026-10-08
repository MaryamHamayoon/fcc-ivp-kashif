/**
 * Where a document's bytes are served. One helper so the drawer's preview, the Download
 * control, the record's shelf and the e2e checks never disagree about the URL.
 */
export function downloadHref(id: string, download = false): string {
  return `/api/documents/${encodeURIComponent(id)}/file${download ? "?download=1" : ""}`;
}

/** The library with a drawer open on `id`; `params` keeps whatever filters were in force. */
export function libraryDocHref(id: string, params?: URLSearchParams): string {
  const next = new URLSearchParams(params);
  next.set("doc", id);
  return `/documents?${next.toString()}`;
}
