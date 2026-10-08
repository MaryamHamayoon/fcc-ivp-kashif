"use client";

import { ArrowRight, KeyRound, Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";

const PRIMARY =
  "inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-soft transition hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-progress disabled:opacity-70";

function AcceptButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`group ${PRIMARY}`}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null}
      {pending ? "Signing in…" : "Accept and sign in"}
      {!pending ? <ArrowRight className="size-4 transition group-hover:translate-x-0.5 motion-reduce:transition-none" aria-hidden /> : null}
    </button>
  );
}

/**
 * The one control on the sign-in screen: accepting the system-use notice signs the reader in.
 * Declining leaves for the public FCC site, which is what the notice promises.
 */
export function AcceptForm({ accountId, next, action }: { accountId: string; next: string; action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action} className="mt-6 space-y-2">
      <input type="hidden" name="userId" value={accountId} />
      <input type="hidden" name="next" value={next} />
      <AcceptButton />
      <a
        href="https://www.fcc.gov"
        className="flex h-10 w-full items-center justify-center rounded-lg text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        Decline and leave
      </a>
    </form>
  );
}

function PasscodeSubmit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={PRIMARY}>
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
      Unlock
    </button>
  );
}

export function PasscodeForm({ next, error, action }: { next: string; error?: string; action: (formData: FormData) => Promise<void> }) {
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next} />
      <div className="space-y-2">
        <label htmlFor="passcode" className="text-sm font-medium">
          Site passcode
        </label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          autoComplete="off"
          required
          autoFocus
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "passcode-error" : "passcode-help"}
          className="flex h-11 w-full rounded-lg border bg-card px-3 text-base shadow-soft outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
        />
        {error ? (
          <p id="passcode-error" role="alert" className="text-sm text-destructive">
            That passcode didn&apos;t match. Try again.
          </p>
        ) : (
          <p id="passcode-help" className="text-sm text-muted-foreground">
            Enter the passcode you were given.
          </p>
        )}
      </div>
      <PasscodeSubmit />
    </form>
  );
}
