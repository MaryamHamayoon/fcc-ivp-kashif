import { CheckCircle2, Eye, Gavel, type LucideIcon, ShieldAlert } from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import { cookies } from "next/headers";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { GATE_COOKIE, gateSatisfied } from "@/lib/auth/gate";
import { defaultIdentity, demoIdentityProvider } from "@/lib/auth/identity";
import { getAuthSecret } from "@/lib/auth/session";
import { safeNext } from "@/lib/auth/next-path";
import { getDb } from "@/lib/db/client";
import { ROLE_LABELS } from "@/lib/domain/types";
import { AcceptForm, PasscodeForm } from "./LoginForm";
import { enterPasscode, signInAs } from "./actions";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

type Search = { next?: string; gate?: string; error?: string; as?: string };

/** The conditions of use every federal information system states before it lets anyone in. */
const NOTICE: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Eye, title: "Monitoring.", body: "Use of this system may be monitored, recorded and audited by authorized personnel." },
  { icon: ShieldAlert, title: "No expectation of privacy.", body: "Communications and data on this system are not private and may be disclosed to authorized officials." },
  { icon: Gavel, title: "Authorized use only.", body: "Unauthorized or improper use is prohibited and may result in disciplinary action and civil or criminal penalties." },
  { icon: CheckCircle2, title: "Consent.", body: "Selecting Accept indicates that you understand and consent to these conditions." },
];

function GlobeLines() {
  // A quiet globe wireframe: lines of longitude and latitude, for a program that spans the world.
  const longitudes = [0.18, 0.36, 0.54, 0.72, 0.9];
  return (
    <svg aria-hidden className="pointer-events-none absolute -bottom-40 -left-32 h-[720px] w-[720px] text-white/[0.09]" viewBox="0 0 400 400" fill="none" stroke="currentColor" strokeWidth="0.8">
      <circle cx="200" cy="200" r="190" />
      {longitudes.map((f) => (
        <ellipse key={f} cx="200" cy="200" rx={190 * f} ry="190" />
      ))}
      {[-120, -60, 0, 60, 120].map((dy) => {
        const r = Math.sqrt(190 * 190 - dy * dy);
        return <line key={dy} x1={200 - r} y1={200 + dy} x2={200 + r} y2={200 + dy} />;
      })}
      <circle cx="200" cy="200" r="3" fill="currentColor" stroke="none" className="text-gold" />
    </svg>
  );
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const secret = getAuthSecret();
  const store = await cookies();
  const gated = !(await gateSatisfied(store.get(GATE_COOKIE)?.value, process.env.SITE_PASSCODE, secret));
  const account = gated ? null : defaultIdentity(await demoIdentityProvider(await getDb()).listDemoAccounts(), params.as);

  return (
    <main className="grid min-h-screen lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <section className="band-surface relative isolate flex flex-col justify-between overflow-hidden px-8 py-8 lg:px-12 lg:py-12" aria-labelledby="brand-title">
        <GlobeLines />
        <div className="flex items-center gap-4">
          <Image src="/brand/fcc-seal-white.svg" alt="Seal of the Federal Communications Commission" width={64} height={64} priority />
          <div className="text-[0.8125rem] leading-snug text-band-muted">
            <div className="font-semibold uppercase tracking-[0.14em] text-band-foreground">Federal Communications Commission</div>
            <div>Office of International Affairs</div>
          </div>
        </div>
        <div className="my-16 max-w-md lg:my-0">
          <div className="h-px w-16 bg-gold" aria-hidden />
          <h1 id="brand-title" className="heading-display mt-6 text-balance text-5xl lg:text-6xl">
            International Visitors Program
          </h1>
          <p className="mt-6 text-balance text-base leading-relaxed text-band-muted">
            Every delegation, every briefing, every open question — one place, one view, from first request to readout.
          </p>
        </div>
        <p className="text-xs leading-relaxed text-band-muted">45 L Street NE · Washington, DC 20554</p>
      </section>

      <section className="relative flex flex-col bg-background">
        <div className="absolute top-4 right-4 lg:top-6 lg:right-8">
          <ThemeToggle className="text-muted-foreground" />
        </div>
        <div className="mx-auto flex w-full max-w-[27rem] flex-1 flex-col justify-center px-6 py-20 lg:px-8">
          {gated ? (
            <>
              <p className="eyebrow">Preview access</p>
              <h2 className="heading-display mt-2 text-[1.5rem] leading-tight">Enter the site passcode</h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">This preview is limited to the project team. The system-use notice follows on the next screen.</p>
              <div className="mt-6">
                <PasscodeForm next={next} error={params.error === "passcode" ? "passcode" : undefined} action={enterPasscode} />
              </div>
            </>
          ) : (
            <>
              <p className="eyebrow">System use notification</p>
              <h2 className="heading-display mt-2 text-balance text-[1.5rem] leading-tight">You are accessing a U.S. Government information system.</h2>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-muted-foreground">
                This system is operated by the Federal Communications Commission for its Office of International Affairs and is provided for authorized use only.
              </p>

              <ul aria-label="Conditions of use" className="mt-6 divide-y rounded-md border bg-card shadow-soft">
                {NOTICE.map(({ icon: Icon, title, body }) => (
                  <li key={title} className="flex gap-3 px-4 py-3">
                    <Icon className="mt-0.5 size-4 shrink-0 text-primary" strokeWidth={1.75} aria-hidden />
                    <p className="text-[0.8125rem] leading-snug">
                      <span className="font-semibold text-foreground">{title}</span> <span className="text-muted-foreground">{body}</span>
                    </p>
                  </li>
                ))}
              </ul>

              {params.error === "account" ? (
                <p role="alert" className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  The sign-in account is not available right now. Contact the program team.
                </p>
              ) : null}

              {account ? (
                <>
                  <AcceptForm accountId={account.id} next={next} action={signInAs} />
                  <p id="signin-identity" className="mt-6 text-xs leading-relaxed text-muted-foreground">
                    Phase 1 signs you in as <span className="font-medium text-foreground">{account.name}</span>, {ROLE_LABELS[account.role]}. FCC single sign-on takes over this step in Phase 4.
                  </p>
                </>
              ) : (
                <p role="alert" className="mt-6 rounded-md border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                  No active account is available to sign in with. Seed the database and try again.
                </p>
              )}
            </>
          )}
        </div>
      </section>
    </main>
  );
}
