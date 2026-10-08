import type { ZodType } from "zod";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** GET a JSON endpoint and validate the payload; throws ApiError with the server's message on failure. */
export async function apiGet<T>(path: string, schema: ZodType<T>, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { accept: "application/json", ...(init?.headers ?? {}) } });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : res.statusText;
    throw new ApiError(res.status, message || `Request failed (${res.status})`);
  }
  return schema.parse(body);
}
