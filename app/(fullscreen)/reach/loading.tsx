import { ReachSkeleton } from "@/components/reach/ReachSkeleton";

/** While the server gathers the meetings, the full screen's chrome stands as skeletons. */
export default function ReachLoading() {
  return <ReachSkeleton />;
}
