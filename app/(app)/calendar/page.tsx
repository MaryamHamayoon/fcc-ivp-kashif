import { redirect } from "next/navigation";

/** The calendar is a layout of the meetings workspace; keep a memorable URL for it. */
export default function CalendarPage() {
  redirect("/meetings?layout=calendar");
}
