"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { DocumentDrawer } from "@/components/documents/DocumentDrawer";
import { type ReuseAction, ReuseDialog } from "@/components/documents/ReuseDialog";
import type { DocumentLibraryItem } from "@/lib/db/repos/documents";
import { libraryDocHref } from "@/lib/documents/href";
import { DOCUMENT_KINDS } from "@/lib/domain/types";
import { DocumentSlot, type DocumentEntry } from "./DocumentSlot";
import { Panel } from "./Panel";
import { type CreateRecordAction, type RecordAction, type UploadRecordAction, useRecordAction } from "./tab-actions";

/**
 * Eight typed slots rather than a folder. Three of them are readiness checks, so the shelf
 * doubles as the answer to "what is this meeting still missing?" — and a slot that is empty
 * says so plainly instead of hiding inside a file list.
 *
 * Files drop straight onto a slot; a file that already lives in SharePoint is linked instead.
 * Either way the row opens in the same drawer the library uses, so a document reads the same
 * wherever it was found.
 */
export function DocumentsTab({
  meetingId,
  documents,
  canAdd,
  addDocument,
  uploadDocument,
  reuseDocument,
  toggleReusable,
  removeDocument,
}: {
  meetingId: string;
  documents: DocumentEntry[];
  canAdd: boolean;
  addDocument: CreateRecordAction;
  uploadDocument: UploadRecordAction;
  reuseDocument: ReuseAction;
  toggleReusable: RecordAction;
  removeDocument: RecordAction;
}) {
  const queryClient = useQueryClient();
  const { run } = useRecordAction();
  const [openId, setOpenId] = useState<string | null>(null);
  const [reuseItem, setReuseItem] = useState<DocumentLibraryItem | null>(null);
  const onFile = documents.length;
  const kindsPresent = new Set(documents.map((doc) => doc.kind)).size;

  /** The drawer reads its document through the API, so a star set from there has to reach both the query and the shelf. */
  const onToggleStar = (item: DocumentLibraryItem) =>
    run(() => toggleReusable({ meetingId: item.meetingId, id: item.id, reusable: !item.reusable }), {
      success: item.reusable ? "Removed from reusable materials." : "Starred as reusable.",
      onDone: () => void queryClient.invalidateQueries({ queryKey: ["document", item.id] }),
    });

  return (
    <>
      <Panel id="documents-heading" eyebrow={onFile === 0 ? "Nothing on file yet" : `${onFile} on file across ${kindsPresent} of ${DOCUMENT_KINDS.length} slots`} title="Documents">
        <div className="grid gap-3 sm:grid-cols-2">
          {DOCUMENT_KINDS.map((kind) => (
            <DocumentSlot
              key={kind}
              meetingId={meetingId}
              kind={kind}
              documents={documents.filter((doc) => doc.kind === kind).sort((a, b) => b.version - a.version)}
              canAdd={canAdd}
              addDocument={addDocument}
              uploadDocument={uploadDocument}
              toggleReusable={toggleReusable}
              removeDocument={removeDocument}
              onOpen={setOpenId}
            />
          ))}
        </div>
      </Panel>

      <DocumentDrawer documentId={openId} onClose={() => setOpenId(null)} onReuse={setReuseItem} onToggleStar={onToggleStar} canManage={() => canAdd} hrefFor={(id) => libraryDocHref(id)} />
      <ReuseDialog
        source={reuseItem}
        onOpenChange={(open) => {
          if (!open) setReuseItem(null);
        }}
        onDone={() => setReuseItem(null)}
        reuse={reuseDocument}
      />
    </>
  );
}
