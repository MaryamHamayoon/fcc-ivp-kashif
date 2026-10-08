import type { RegionId } from "../../../lib/domain/regions";

/**
 * Additional countries `generate.ts`'s `ministryFor` may invent a placeholder "MoC <Country>"
 * organization for, on top of the ~88 countries `ORGANIZATIONS` already covers by name. Curated
 * so every generated meeting draws from a plausible IVP partner country — a sovereign state
 * with an active telecom regulator or ministry — rather than any of the ~200 entries in the
 * full ISO reference table (`countries.generated.ts`, which stays unfiltered: the country picker
 * and the map need every entry).
 *
 * Excluded on purpose:
 * - US-sanctioned or embargoed states: North Korea, Iran, Syria, Cuba, Russia, Belarus,
 *   Venezuela, Myanmar, Afghanistan, Sudan.
 * - A judgment-call extension of that same spirit — states with essentially no realistic FCC
 *   engagement today: China (adversarial telecom relationship, not a sanctions matter), Zimbabwe
 *   (long-running OFAC program), Mali/Niger/Burkina Faso (military juntas realigned away from
 *   Western partners), Somalia/South Sudan/Yemen/Libya (no functioning central government to
 *   send a delegation), Turkmenistan (North-Korea-like isolation).
 * - Every dependency, overseas territory, or constituent department of another state (Puerto
 *   Rico, Guam, Greenland, Réunion, French Polynesia, the Channel Islands, the Caribbean's
 *   British/French/Dutch/US territories, Pitcairn, Saint Pierre and Miquelon, Cook Islands,
 *   Niue, Tokelau, the Falklands, Western Sahara, the Palestinian Territories, etc.) — none of
 *   these send their own delegations.
 * - Micro-states with no independent telecom regulatory apparatus (Vatican City, Monaco, San
 *   Marino, Liechtenstein), and a few genuinely tiny Pacific/Caribbean sovereign states that
 *   would be implausible as standalone visiting delegations (Nauru, Tuvalu, Kiribati, Palau,
 *   the Marshall Islands, São Tomé and Príncipe, etc.).
 *
 * `io` (Multilateral & International Organizations) has no country pool of its own — every seed
 * meeting in that region already uses a named `ORGANIZATIONS` entry — so its list is empty.
 *
 * Combined with the countries `ORGANIZATIONS` already names, this keeps the generator's total
 * country pool at roughly 100–110, weighted like `generate.ts`'s `REGION_WEIGHTS`: Africa and
 * Asia-Pacific (the two heaviest meeting-volume regions) get the most additions, Europe and the
 * Americas a handful, MENA and South & Central Asia fewer still.
 */
export const MEETING_COUNTRY_ALLOWLIST: Record<RegionId, readonly string[]> = {
  af: ["AO", "NA", "MU", "MZ", "LR"], // Angola, Namibia, Mauritius, Mozambique, Liberia
  wha: ["GY", "PA", "GT"], // Guyana, Panama, Guatemala
  eap: ["KH", "FJ", "WS", "TL", "VU"], // Cambodia, Fiji, Samoa, Timor-Leste, Vanuatu
  eur: ["EE", "GE", "MD"], // Estonia, Georgia, Moldova
  nea: ["OM", "DZ"], // Oman, Algeria
  sca: ["KG", "MV"], // Kyrgyzstan, Maldives
  io: [],
};
