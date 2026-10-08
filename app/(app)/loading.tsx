import { Skeleton } from "@/components/ui/skeleton";

/** Neutral page skeleton for every signed-in route while the server assembles its data. */
export default function AppLoading() {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-6 xl:grid-cols-12">
      <span className="sr-only">Loading…</span>
      <div className="flex flex-col gap-4 xl:col-span-5">
        <Skeleton className="h-4 w-64" />
        <div className="grid grid-cols-2 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-3xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-3xl" />
      </div>
      <Skeleton className="min-h-[520px] rounded-3xl xl:col-span-7" />
      <Skeleton className="h-64 rounded-3xl xl:col-span-8" />
      <div className="flex flex-col gap-6 xl:col-span-4">
        <Skeleton className="h-28 rounded-3xl" />
        <Skeleton className="h-28 rounded-3xl" />
      </div>
    </div>
  );
}
