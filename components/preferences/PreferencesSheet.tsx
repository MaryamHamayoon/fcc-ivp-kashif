"use client";

import { RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { useReducedMotion } from "@/lib/motion";
import { OPEN_PREFERENCES_EVENT, type OpenPreferencesDetail } from "@/lib/preferences/open";
import { type Appearance, applyPreset, type Preferences, type PreferenceValue, PRESETS, presetMatches } from "@/lib/preferences/schema";
import { resetPreferences, setPreferences, usePreferences } from "@/lib/preferences/store";
import { OptionTiles, SegmentedOptions } from "./OptionTiles";
import { AccentPreview, AppearancePreview, ContrastPreview, type Mode, NavPreview, SurfacePreview, TextSizeGlyph, TypefacePreview } from "./previews";
import {
  ACCENT_CHOICES,
  announce,
  APPEARANCE_CHOICES,
  type AppearanceChoice,
  CONTRAST_CHOICES,
  FONT_CHOICES,
  labelOf,
  MOTION_LABEL,
  NAV_CHOICES,
  SECTIONS,
  type SectionId,
  SHEET_COPY,
  SURFACE_CHOICES,
  TEXT_CHOICES,
  TEXT_SAMPLE,
} from "./sections";

/**
 * Display & accessibility — the one panel where a reader decides what the app looks like.
 *
 * It is mounted once, at the root, and opened by a window event, so the rail, the account menu
 * and anything else can ask for it without holding a reference to it. Nothing here is saved and
 * applied: every choice lands the instant it is made, on the page behind the panel, because the
 * store stamps `<html>` and the whole design system is expressed against those attributes. The
 * panel is therefore also the demonstration — you watch the app change while you choose.
 */
export function PreferencesSheet() {
  const prefs = usePreferences();
  const { theme, setTheme } = useTheme();
  const reduceMotion = useReducedMotion();
  const ids = useId();

  const [open, setOpen] = useState(false);
  const [section, setSection] = useState<SectionId | undefined>(undefined);
  const [announcement, setAnnouncement] = useState("");

  /** Base UI restores focus to its own trigger; this panel has none, so it remembers its own. */
  const returnFocus = useRef<HTMLElement | null>(null);
  const groups = useRef(new Map<SectionId, HTMLElement | null>());
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onOpenRequest(event: Event) {
      const requested = (event as CustomEvent<OpenPreferencesDetail>).detail?.section;
      returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setSection(requested);
      setAnnouncement("");
      setOpen(true);
    }
    window.addEventListener(OPEN_PREFERENCES_EVENT, onOpenRequest);
    return () => window.removeEventListener(OPEN_PREFERENCES_EVENT, onOpenRequest);
  }, []);

  /**
   * Where focus lands when the panel opens. Base UI asks for this once the panel is mounted —
   * later than an effect of ours would run — which is also the first moment the groups have
   * registered themselves, so this is where the requested one is brought to the top. The
   * scroller is the groups' offset parent, so the arithmetic is exact.
   */
  function openingFocus(): HTMLElement | true {
    const group = section ? groups.current.get(section) : null;
    if (!group) return true;
    if (scrollerRef.current) scrollerRef.current.scrollTop = group.offsetTop;
    return group;
  }

  const headingId = (id: SectionId) => `${ids}-${id}`;
  const registerGroup = useCallback((id: SectionId, node: HTMLElement | null) => {
    groups.current.set(id, node);
  }, []);

  const appearance: Appearance = theme === "dark" || theme === "system" ? theme : "light";
  /** Hybrid is the light theme wearing a dark rail; any other pairing reads as the theme itself. */
  const shown: AppearanceChoice = appearance === "light" && prefs.rail === "dark" ? "hybrid" : appearance;
  const mode: Mode = appearance === "dark" ? "dark" : "light";
  const railMode: Mode = mode === "dark" || prefs.rail === "dark" ? "dark" : "light";

  /** Every change goes through here, so the live region always says what just happened. */
  function change<K extends keyof Preferences>(id: SectionId, key: K, value: Preferences[K], label: string) {
    setPreferences({ [key]: value } as Partial<Preferences>);
    setAnnouncement(announce(id, label));
  }

  /** Light, dark and "match device" belong to next-themes; hybrid adds the dark rail on top of light. */
  function chooseAppearance(next: AppearanceChoice) {
    setTheme(next === "hybrid" ? "light" : next);
    const rail: PreferenceValue<"rail"> = next === "hybrid" ? "dark" : "match";
    if (rail !== prefs.rail) setPreferences({ rail });
    setAnnouncement(announce("appearance", labelOf(APPEARANCE_CHOICES, next)));
  }

  function choosePreset(id: string) {
    const preset = PRESETS.find((candidate) => candidate.id === id);
    if (!preset) return;
    setPreferences(applyPreset(preset, prefs));
    if (preset.appearance) setTheme(preset.appearance);
    setAnnouncement(announce("presets", preset.label));
  }

  function reset() {
    resetPreferences();
    setTheme("light");
    setAnnouncement(SHEET_COPY.resetAnnouncement);
  }

  /** No preset "is" the current look unless its whole bundle matches; "" leaves the group unset. */
  const currentPreset = PRESETS.find((preset) => presetMatches(preset, prefs, appearance))?.id ?? "";

  const groupProps = (id: SectionId, index: number) => ({
    id,
    index,
    headingId: headingId(id),
    register: registerGroup,
    reduceMotion: reduceMotion === true,
  });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent
        side="right"
        finalFocus={returnFocus}
        initialFocus={openingFocus}
        aria-describedby={`${ids}-intro`}
        className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-[26rem]"
      >
        <SheetHeader className="shrink-0 border-b border-border p-4 pr-12">
          <SheetTitle className="text-[0.9375rem]">{SHEET_COPY.title}</SheetTitle>
          <SheetDescription id={`${ids}-intro`} className="text-[0.75rem] leading-snug">
            {SHEET_COPY.description}
          </SheetDescription>
        </SheetHeader>

        {/* `relative` matters twice: it makes this the groups' offset parent, and it keeps an
            sr-only child from inflating the page inside an unpositioned scroller. */}
        <div ref={scrollerRef} className="relative min-h-0 flex-1 divide-y divide-border overflow-y-auto px-4">
          <Group {...groupProps("presets", 0)}>
            <OptionTiles
              columns={1}
              labelledBy={headingId("presets")}
              value={currentPreset}
              onChange={choosePreset}
              tiles={PRESETS.map((preset) => ({ value: preset.id, label: preset.label, hint: preset.description }))}
            />
          </Group>

          <Group {...groupProps("appearance", 1)}>
            <OptionTiles
              columns={2}
              labelledBy={headingId("appearance")}
              value={shown}
              onChange={chooseAppearance}
              tiles={APPEARANCE_CHOICES.map((choice) => ({
                ...choice,
                preview: <AppearancePreview appearance={choice.value} accent={prefs.accent} />,
              }))}
            />
          </Group>

          <Group {...groupProps("nav", 2)}>
            <OptionTiles
              labelledBy={headingId("nav")}
              value={prefs.nav}
              onChange={(next) => change("nav", "nav", next, labelOf(NAV_CHOICES, next))}
              tiles={NAV_CHOICES.map((choice) => ({
                ...choice,
                preview: <NavPreview nav={choice.value} collapsed={prefs.collapsed === "yes"} accent={prefs.accent} mode={mode} rail={railMode} />,
              }))}
            />
          </Group>

          <Group {...groupProps("accent", 3)}>
            <OptionTiles
              labelledBy={headingId("accent")}
              value={prefs.accent}
              onChange={(next) => change("accent", "accent", next, labelOf(ACCENT_CHOICES, next))}
              tiles={ACCENT_CHOICES.map((choice) => ({ ...choice, preview: <AccentPreview accent={choice.value} mode={mode} /> }))}
            />
          </Group>

          <Group {...groupProps("surface", 4)}>
            <OptionTiles
              columns={3}
              labelledBy={headingId("surface")}
              value={prefs.surface}
              onChange={(next) => change("surface", "surface", next, labelOf(SURFACE_CHOICES, next))}
              tiles={SURFACE_CHOICES.map((choice) => ({
                ...choice,
                preview: <SurfacePreview surface={choice.value} accent={prefs.accent} mode={mode} />,
              }))}
            />
          </Group>

          <Group {...groupProps("text", 5)}>
            <SegmentedOptions
              labelledBy={headingId("text")}
              value={prefs.text}
              onChange={(next: PreferenceValue<"text">) => change("text", "text", next, labelOf(TEXT_CHOICES, next))}
              tiles={TEXT_CHOICES.map((choice) => ({ ...choice, preview: <TextSizeGlyph size={choice.value} /> }))}
            />
            <p className="mt-3 border-l-2 border-brand pl-2.5 text-sm leading-snug text-foreground">{TEXT_SAMPLE}</p>
          </Group>

          <Group {...groupProps("font", 6)}>
            <OptionTiles
              columns={1}
              labelledBy={headingId("font")}
              value={prefs.font}
              onChange={(next) => change("font", "font", next, labelOf(FONT_CHOICES, next))}
              tiles={FONT_CHOICES.map((choice) => ({ ...choice, preview: <TypefacePreview font={choice.value} /> }))}
            />
          </Group>

          <Group {...groupProps("contrast", 7)}>
            <OptionTiles
              labelledBy={headingId("contrast")}
              value={prefs.contrast}
              onChange={(next) => change("contrast", "contrast", next, labelOf(CONTRAST_CHOICES, next))}
              tiles={CONTRAST_CHOICES.map((choice) => ({ ...choice, preview: <ContrastPreview level={choice.value} /> }))}
            />
          </Group>

          <Group {...groupProps("motion", 8)}>
            <div className="flex items-center justify-between gap-3">
              <span id={`${ids}-motion-label`} className="text-[0.8125rem] font-medium text-foreground">
                {MOTION_LABEL}
              </span>
              <Switch
                aria-labelledby={`${ids}-motion-label`}
                checked={prefs.motion === "reduced"}
                onCheckedChange={(checked: boolean) => {
                  setPreferences({ motion: checked ? "reduced" : "system" });
                  setAnnouncement(`${MOTION_LABEL}: ${checked ? "on" : "off"}`);
                }}
              />
            </div>
          </Group>
        </div>

        <SheetFooter className="shrink-0 flex-row items-center justify-between gap-2 border-t border-border p-3">
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw aria-hidden />
            {SHEET_COPY.reset}
          </Button>
          <SheetClose render={<Button size="sm" />}>{SHEET_COPY.done}</SheetClose>
          <p aria-live="polite" className="sr-only">
            {announcement}
          </p>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/**
 * One labelled group: an eyebrow, a sentence, and the control. Each rises into place a beat after
 * the one above it — the panel's single moment of motion, and only when motion is welcome.
 */
function Group({
  id,
  index,
  headingId,
  register,
  reduceMotion,
  children,
}: {
  id: SectionId;
  index: number;
  headingId: string;
  register: (id: SectionId, node: HTMLElement | null) => void;
  reduceMotion: boolean;
  children: ReactNode;
}) {
  return (
    <motion.div
      ref={(node) => register(id, node)}
      role="group"
      aria-labelledby={headingId}
      tabIndex={-1}
      className="scroll-mt-2 py-4 outline-none first:pt-4 last:pb-4"
      initial={reduceMotion ? false : { opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24, delay: index * 0.03, ease: [0.22, 1, 0.36, 1] }}
    >
      <h3 id={headingId} className="eyebrow">
        {SECTIONS[id].title}
      </h3>
      <p className="mt-1 text-[0.75rem] leading-snug text-muted-foreground">{SECTIONS[id].description}</p>
      <div className="mt-2.5">{children}</div>
    </motion.div>
  );
}
