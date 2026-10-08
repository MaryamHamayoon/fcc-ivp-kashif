import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers";
import { requireUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

/** Pages that fill the window: signed in and with the app's providers, but without the rail or the top bar. Each page brings its own skip link. */
export default async function FullscreenLayout({ children }: { children: ReactNode }) {
  await requireUser();
  return <AppProviders>{children}</AppProviders>;
}
