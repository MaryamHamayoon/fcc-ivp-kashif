import { DEFAULT_PREFERENCES, PREFERENCE_OPTIONS, PREFERENCES_STORAGE_KEY, RETIRED_COMPACT_NAV } from "./schema";

/**
 * Inline script for the root layout, run before anything paints: reads the stored preferences
 * and stamps them on <html> as `data-*` attributes, so the first frame already wears the
 * reader's text size, contrast and typeface. It follows `parsePreferences` and
 * `applyPreferences` exactly: a missing or unrecognised choice falls back to the reader's
 * default (so a first visit, with nothing stored, already gets the hybrid look and the floating
 * rail), the stylesheet's base value (index 0 of its option list) is never written, and the
 * retired icons-only nav style is read as the standard rail, collapsed.
 *
 * Kept deliberately tiny and dependency-free; it is serialized into the HTML of every page.
 */
export const PREFERENCES_BOOT_SCRIPT = `(function(){try{var p={};try{var j=JSON.parse(localStorage.getItem(${JSON.stringify(PREFERENCES_STORAGE_KEY)}));if(j&&typeof j==="object")p=j}catch(e){}if(p.nav===${JSON.stringify(RETIRED_COMPACT_NAV)}){p.nav="standard";p.collapsed="yes"}var o=${JSON.stringify(PREFERENCE_OPTIONS)};var f=${JSON.stringify(DEFAULT_PREFERENCES)};var d=document.documentElement;for(var k in o){var v=p[k];if(typeof v!=="string"||o[k].indexOf(v)<0)v=f[k];if(o[k].indexOf(v)>0)d.setAttribute("data-"+k,v)}}catch(e){}})()`;
