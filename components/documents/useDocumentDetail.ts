"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { DocumentDetailResponse } from "@/lib/api/schemas";
import type { DocumentDetail } from "@/lib/services/library";

/** One document for the drawer: itself, every version of its slot, and the original it came from. */
export function useDocumentDetail(id: string | null) {
  const result = useQuery({
    queryKey: ["document", id],
    queryFn: () => apiGet(`/api/documents/${encodeURIComponent(id ?? "")}`, DocumentDetailResponse),
    enabled: id !== null,
    staleTime: 30_000,
  });
  // The response schema mirrors the repository row; this assignment is what keeps them in step.
  const detail: DocumentDetail | undefined = result.data;
  return { ...result, detail };
}
