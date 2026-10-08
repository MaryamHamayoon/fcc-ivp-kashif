import { Building2, CalendarCheck2, FileText, Globe, type LucideIcon, MessageSquareText, Tag, UserRound } from "lucide-react";
import type { SearchHitKind } from "@/lib/services/search";

export const KIND_ICON: Record<SearchHitKind, LucideIcon> = {
  meeting: CalendarCheck2,
  organization: Building2,
  country: Globe,
  staff: UserRound,
  topic: Tag,
  activity: MessageSquareText,
  document: FileText,
};

export const KIND_LABEL: Record<SearchHitKind, string> = {
  meeting: "Meeting",
  organization: "Organization",
  country: "Country",
  staff: "Person",
  topic: "Topic",
  activity: "Note",
  document: "Document",
};
