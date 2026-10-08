"use client";

import { useRef, useState } from "react";
import { reuseDocumentAction } from "@/app/(app)/meetings/[id]/actions";
import { useUrlState } from "@/components/common/useUrlState";
import { DocumentDrawer } from "@/components/documents/DocumentDrawer";
import { ReuseDialog } from "@/components/documents/ReuseDialog";
import { useDocumentActions } from "@/components/documents/useDocumentActions";
import type { DocumentLibraryItem } from "@/lib/db/repos/documents";
import { libraryDocHref } from "@/lib/documents/href";
import type { Material } from "@/lib/domain/dossier";
import type { PolicyUser } from "@/lib/domain/policy";
import { MaterialsShelf } from "./MaterialsShelf";

export type DossierMaterialsProps = {
  materials: Material[];
  total: number;
  href: string;
  subject: string;
  user: PolicyUser;
};

/**
 * The materials shelf with the library's own drawer behind it: the open document lives in
 * the dossier's URL as `doc`, so a coordinator can send a colleague straight to a file.
 */
export function DossierMaterials({ materials, total, href, subject, user }: DossierMaterialsProps) {
  const { params, setParams } = useUrlState();
  const docId = params.get("doc");
  const openerRef = useRef<HTMLElement | null>(null);
  const [reuseItem, setReuseItem] = useState<DocumentLibraryItem | null>(null);
  const { refresh, canManage, onToggleStar } = useDocumentActions(user);

  return (
    <>
      <MaterialsShelf
        materials={materials}
        total={total}
        href={href}
        subject={subject}
        onOpen={(id, opener) => {
          openerRef.current = opener;
          setParams({ doc: id });
        }}
      />
      <DocumentDrawer documentId={docId} onClose={() => setParams({ doc: null })} onReuse={setReuseItem} onToggleStar={onToggleStar} canManage={canManage} hrefFor={(id) => libraryDocHref(id)} finalFocus={openerRef} />
      <ReuseDialog
        source={reuseItem}
        onOpenChange={(open) => {
          if (!open) setReuseItem(null);
        }}
        onDone={() => {
          setReuseItem(null);
          refresh();
        }}
        reuse={reuseDocumentAction}
      />
    </>
  );
}
