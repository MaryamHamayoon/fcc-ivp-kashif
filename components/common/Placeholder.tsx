import { Construction } from "lucide-react";
import { EmptyState } from "./EmptyState";
import { PageHeader } from "./PageHeader";

/** Temporary page body while a section is still being built; removed as each section lands. */
export function Placeholder({ eyebrow, title, description, note }: { eyebrow: string; title: string; description: string; note: string }) {
  return (
    <div className="space-y-8">
      <PageHeader eyebrow={eyebrow} title={title} description={description} />
      <EmptyState icon={Construction} title="Under construction" description={note} />
    </div>
  );
}
