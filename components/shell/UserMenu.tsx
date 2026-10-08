"use client";

import { ChevronsUpDown, LogOut, SlidersHorizontal } from "lucide-react";
import { useTransition } from "react";
import { signOut } from "@/app/(auth)/login/actions";
import { UserAvatar } from "@/components/common/Avatar";
import { RoleBadge } from "@/components/common/RoleBadge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { SessionUser } from "@/lib/auth/session";
import { ROLE_LABELS } from "@/lib/domain/types";
import { openPreferences } from "@/lib/preferences/open";
import { cn } from "@/lib/utils";

const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring focus-visible:ring-offset-2 focus-visible:ring-offset-sidebar";

/**
 * The account block at the foot of the rail: who you are, and the way out. Light and dark used
 * to live here as a pair of radio items; they now sit with text size, contrast and motion in
 * Display & accessibility, which this menu opens — one place for how the app looks, rather than
 * two. Expanded it is a full-width row (avatar, name, email, chevron) and the menu rises from
 * it; collapsed it is the avatar alone and the menu opens to the side.
 */
export function UserMenu({ user, collapsed = false }: { user: SessionUser; collapsed?: boolean }) {
  const [pending, startTransition] = useTransition();
  const accessibleName = `Account menu — ${user.name}, ${ROLE_LABELS[user.role]}`;

  const trigger = collapsed ? (
    <DropdownMenuTrigger aria-label={accessibleName} className={cn("mx-auto flex size-9 items-center justify-center rounded-md transition-colors hover:bg-muted aria-expanded:bg-muted", FOCUS_RING)}>
      <UserAvatar name={user.name} size="md" decorative />
    </DropdownMenuTrigger>
  ) : (
    <DropdownMenuTrigger aria-label={accessibleName} className={cn("flex w-full items-center gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-muted aria-expanded:bg-muted", FOCUS_RING)}>
      <UserAvatar name={user.name} size="md" decorative />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.8125rem] font-semibold leading-tight text-sidebar-foreground">{user.name}</span>
        <span className="block truncate text-[0.6875rem] leading-tight text-muted-foreground">{user.email}</span>
      </span>
      <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} aria-hidden />
    </DropdownMenuTrigger>
  );

  return (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger render={trigger} />
          <TooltipContent side="right">{user.name}</TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
      <DropdownMenuContent side={collapsed ? "right" : "top"} align={collapsed ? "end" : "start"} sideOffset={8} className="w-[272px]">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="flex items-start gap-3 py-2">
            <UserAvatar name={user.name} size="lg" decorative />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-foreground">{user.name}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{user.email}</span>
              <RoleBadge role={user.role} className="mt-1.5" />
            </span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => openPreferences()}>
            <SlidersHorizontal aria-hidden />
            Display &amp; accessibility
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem disabled={pending} onClick={() => startTransition(() => void signOut())}>
            <LogOut aria-hidden />
            {pending ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
