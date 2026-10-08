"use client";

import { Check, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Flag } from "@/components/common/Flag";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { describedBy, FieldMessages, SelectField } from "./fields";
import { deriveRegionId, fieldId, type CountryOption, type FieldErrors, type LeadOption, type RegionOption } from "./wizard-schema";

export type CountryPatch = { countryCodes?: string[]; regionId?: string; leadUserId?: string };

/** Strips accents and case so "cote" finds Côte d'Ivoire. */
const fold = (value: string): string => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Names that start with the query first, then names, codes and regions that merely
 * contain it — never a fuzzy guess. A fuzzy filter offered Nicaragua and Singapore
 * for "Niger", and its re-sorting under cmdk's own scroll hid the best match.
 */
export function findCountries(query: string, countries: readonly CountryOption[], regionName: ReadonlyMap<string, string>): CountryOption[] {
  const q = fold(query.trim());
  if (q === "") return [...countries];
  const starts: CountryOption[] = [];
  const contains: CountryOption[] = [];
  for (const country of countries) {
    const name = fold(country.name);
    if (name.startsWith(q) || country.code.toLowerCase() === q) starts.push(country);
    else if (name.includes(q) || fold(regionName.get(country.regionId) ?? "").includes(q)) contains.push(country);
  }
  return [...starts, ...contains];
}

/**
 * Step 2 — where the delegation comes from and who owns the visit here.
 *
 * The region follows the first country until a coordinator overrides it (joint
 * visits and multilateral bodies do not sit where their flag does), and the first
 * country stays the primary one because that is what the record files under.
 */
export function StepCountry({
  countryCodes,
  regionId,
  leadUserId,
  onChange,
  errors,
  countries,
  regions,
  leads,
}: {
  countryCodes: string[];
  regionId: string;
  leadUserId: string;
  onChange: (patch: CountryPatch) => void;
  errors: FieldErrors;
  countries: CountryOption[];
  regions: RegionOption[];
  leads: LeadOption[];
}) {
  const [query, setQuery] = useState("");
  const byCode = useMemo(() => new Map(countries.map((c) => [c.code, c])), [countries]);
  const regionName = useMemo(() => new Map(regions.map((r) => [r.id, r.name])), [regions]);
  const matches = useMemo(() => findCountries(query, countries, regionName), [query, countries, regionName]);
  const countryError = errors["countryCodes"];
  const pickerId = fieldId("countryCodes");
  const hint = "Add every country sending people. The first one files the record.";

  function toggle(code: string) {
    const chosen = countryCodes.includes(code);
    const nextCodes = chosen ? countryCodes.filter((c) => c !== code) : [...countryCodes, code];
    const wasDerived = regionId === "" || regionId === deriveRegionId(countryCodes, countries);
    const derived = deriveRegionId(nextCodes, countries);
    onChange({ countryCodes: nextCodes, regionId: wasDerived && derived !== "" ? derived : regionId });
    setQuery("");
  }

  return (
    <div className="grid gap-6">
      <div id={pickerId}>
        <p className="mb-1.5 text-sm font-medium">Countries</p>
        {countryCodes.length > 0 ? (
          <ul aria-label="Chosen countries" className="mb-2.5 flex flex-wrap gap-2">
            {countryCodes.map((code, index) => {
              const country = byCode.get(code);
              const name = country?.name ?? code;
              return (
                <li key={code}>
                  <span className="inline-flex items-center gap-2 rounded-full border bg-card py-1 pl-2.5 pr-1 text-sm shadow-soft">
                    <Flag code={code} size={12} />
                    <span className="font-medium">{name}</span>
                    {index === 0 && countryCodes.length > 1 ? <span className="rounded-full bg-muted px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wider text-muted-foreground">Primary</span> : null}
                    <button
                      type="button"
                      aria-label={`Remove ${name}`}
                      onClick={() => toggle(code)}
                      className="inline-flex size-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <X className="size-3.5" aria-hidden />
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}

        <div className={cn("overflow-hidden rounded-xl border bg-card shadow-soft", countryError && "border-destructive")}>
          <Command label="Search countries" shouldFilter={false} className="rounded-xl! bg-card p-0">
            <div className="border-b p-1.5">
              <CommandInput
                value={query}
                onValueChange={setQuery}
                placeholder="Search by country name or code…"
                autoComplete="off"
                aria-describedby={describedBy(pickerId, hint, countryError)}
                aria-invalid={countryError ? true : undefined}
              />
            </div>
            <CommandList label="Countries" className="max-h-56">
              <CommandEmpty>No country matches that search.</CommandEmpty>
              {matches.map((country) => {
                const chosen = countryCodes.includes(country.code);
                return (
                  <CommandItem
                    key={country.code}
                    value={country.code}
                    data-checked={chosen ? "true" : undefined}
                    onSelect={() => toggle(country.code)}
                    className="gap-2.5 py-1.5"
                  >
                    <Flag code={country.code} size={12} />
                    <span className="truncate">{country.name}</span>
                    <span className="numeric text-[0.6875rem] text-muted-foreground">{country.code}</span>
                    {chosen ? <Check className="ml-auto size-4 text-primary" aria-hidden /> : null}
                    {chosen ? <span className="sr-only">already added</span> : null}
                  </CommandItem>
                );
              })}
            </CommandList>
          </Command>
        </div>
        <FieldMessages id={pickerId} hint={hint} error={countryError} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <SelectField
          id={fieldId("regionId")}
          label="Region"
          value={regionId}
          onChange={(v) => onChange({ regionId: v })}
          error={errors["regionId"]}
          hint="Set from the first country; change it when the visit belongs to another desk."
          placeholder="Choose a region…"
        >
          {regions.map((region) => (
            <option key={region.id} value={region.id}>
              {region.name}
            </option>
          ))}
        </SelectField>
        <SelectField
          id={fieldId("leadUserId")}
          label="OIA lead"
          value={leadUserId}
          onChange={(v) => onChange({ leadUserId: v })}
          error={errors["leadUserId"]}
          hint="Leave blank and the region's standing lead takes it."
          placeholder="Assign automatically"
          optional
        >
          {leads.map((lead) => (
            <option key={lead.id} value={lead.id}>
              {lead.title ? `${lead.name} — ${lead.title}` : lead.name}
            </option>
          ))}
        </SelectField>
      </div>
    </div>
  );
}
