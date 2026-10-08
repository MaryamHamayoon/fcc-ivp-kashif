/**
 * Starts a download from a same-origin URL without leaving the page: an anchor with the
 * `download` attribute, clicked and discarded. The route names the file; the attribute only
 * keeps the browser from navigating to it.
 */
export function triggerDownload(href: string): void {
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = "";
  anchor.rel = "noopener";
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
