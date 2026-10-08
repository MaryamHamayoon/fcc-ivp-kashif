/** Only same-origin paths may be used as a post-login destination (no open redirects). */
export function safeNext(value: FormDataEntryValue | string | null | undefined): string {
  const next = typeof value === "string" ? value.trim() : "";
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/login") || next.includes("\\")) return "/";
  return next;
}
