"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useTransition } from "react";
import { toast } from "sonner";
import { removeDocumentAction, toggleReusableAction } from "@/app/(app)/meetings/[id]/actions";
import type { ActionResult } from "@/lib/api/schemas";
import type { DocumentLibraryItem } from "@/lib/db/repos/documents";
import { can, type PolicyUser } from "@/lib/domain/policy";

/**
 * What a document row or drawer can do to a document, wherever it is shown — the library, a
 * dossier's shelf. Each action reports through a toast and refreshes every shelf on screen.
 */
export function useDocumentActions(user: PolicyUser) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [, startTransition] = useTransition();

  const refresh = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["documents"] });
    void queryClient.invalidateQueries({ queryKey: ["document"] });
    router.refresh();
  }, [queryClient, router]);

  // Experts only ever see the shelves of meetings they are assigned to, so claiming the
  // assignment here is accurate for every row on screen; the server decides regardless.
  const canManage = useCallback((item: DocumentLibraryItem) => can(user, "document.add", { kind: "meeting", regionId: item.regionId, assignedStaffIds: user.staffId ? [user.staffId] : [] }), [user]);

  const runAction = useCallback(
    (call: () => Promise<ActionResult>, success: string) => {
      startTransition(async () => {
        const result = await call();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.success(success);
        refresh();
      });
    },
    [refresh],
  );

  const onToggleStar = useCallback(
    (item: DocumentLibraryItem) =>
      runAction(() => toggleReusableAction({ meetingId: item.meetingId, id: item.id, reusable: !item.reusable }), item.reusable ? "Removed from reusable materials." : "Starred as reusable."),
    [runAction],
  );
  const onRemove = useCallback((item: DocumentLibraryItem) => runAction(() => removeDocumentAction({ meetingId: item.meetingId, id: item.id }), `${item.title} removed.`), [runAction]);

  return { refresh, canManage, onToggleStar, onRemove };
}
