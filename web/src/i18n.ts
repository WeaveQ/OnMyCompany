import type { LocaleLang, Locales } from "@embra/i18n";

import { I18n, detectLang } from "@embra/i18n";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";

export type AppLang = "en" | "zh-CN" | "zh-TW";

export const supportedLangs = ["en", "zh-CN", "zh-TW"] as const satisfies readonly AppLang[];
export const langStorageKey = "onmycompany.lang";

const locales = {
  en,
  "zh-CN": zhCN,
  "zh-TW": zhTW,
} satisfies Locales;

export function createAppI18n(initialLang: AppLang): I18n {
  // Prefer zh-CN strings when a key is missing in another locale.
  return new I18n(initialLang, locales, { fallback: "zh-CN" });
}

export function resolveInitialLang(input: { storedLang: string | null; detectedLang: string | null }): AppLang {
  // Product default: Simplified Chinese when no stored preference and browser is not a supported lang.
  return toAppLang(input.storedLang) ?? matchAppLang(input.detectedLang) ?? "zh-CN";
}

export function readInitialLang(storage: Storage | undefined = globalThis.localStorage): AppLang {
  return resolveInitialLang({
    storedLang: storage?.getItem(langStorageKey) ?? null,
    detectedLang: detectLang(),
  });
}

export function persistLang(lang: LocaleLang, storage: Storage | undefined = globalThis.localStorage): void {
  const appLang = toAppLang(lang);
  if (appLang) {
    storage?.setItem(langStorageKey, appLang);
  }
}

function toAppLang(value: string | null): AppLang | undefined {
  return supportedLangs.find((lang) => lang === value);
}

// Regions and scripts that write Chinese in Traditional characters.
const traditionalChineseSubtags = new Set(["tw", "hk", "mo", "hant"]);

function matchAppLang(value: string | null): AppLang | undefined {
  if (!value) {
    return undefined;
  }
  const locale = value.toLowerCase();
  const subtags = locale.split("-");
  // Chinese cannot be matched on a prefix: zh-HK and zh-Hant-TW are Traditional,
  // zh-Hans-CN and zh-SG are Simplified. Same split as the OAuth completion page.
  // An explicit script wins over the region, so zh-Hans-HK stays Simplified.
  if (subtags[0] === "zh") {
    if (subtags.includes("hans")) {
      return "zh-CN";
    }
    return subtags.some((subtag) => traditionalChineseSubtags.has(subtag)) ? "zh-TW" : "zh-CN";
  }
  return supportedLangs.find((lang) => locale.startsWith(lang.toLowerCase()));
}
