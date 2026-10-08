/** Meeting codes: IVP-<fiscal year>-<per-FY sequence, zero-padded to 3>. */

export function formatIvpCode(fy: number, sequence: number): string {
  return `IVP-${fy}-${String(sequence).padStart(3, "0")}`;
}

export function parseIvpCode(code: string): { fy: number; sequence: number } | null {
  const m = /^IVP-(\d{4})-(\d{3,})$/i.exec(code.trim());
  if (!m) return null;
  return { fy: Number(m[1]), sequence: Number(m[2]) };
}
