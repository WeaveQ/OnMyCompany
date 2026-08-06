import { describe, expect, it } from "vitest";
import { createAppI18n, resolveInitialLang, supportedLangs } from "./i18n";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import zhTW from "./locales/zh-TW.json";

type LocaleTree = { [key: string]: string | LocaleTree };

function flattenLocale(tree: LocaleTree, prefix = ""): [string, string][] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === "string"
      ? [[`${prefix}${key}`, value] as [string, string]]
      : flattenLocale(value, `${prefix}${key}.`),
  );
}

function placeholders(value: string): string[] {
  return (value.match(/{{\w+}}/g) ?? []).sort();
}

describe("resolveInitialLang", () => {
  it("uses a stored supported language first", () => {
    expect(resolveInitialLang({ storedLang: "zh-CN", detectedLang: "en" })).toBe("zh-CN");
  });

  it("uses the detected supported language when no stored language exists", () => {
    expect(resolveInitialLang({ storedLang: null, detectedLang: "zh-TW" })).toBe("zh-TW");
  });

  it("matches a detected language against its region sub-tag", () => {
    expect(resolveInitialLang({ storedLang: null, detectedLang: "en-US" })).toBe("en");
  });

  it("resolves Traditional Chinese regions and scripts to zh-TW", () => {
    for (const detectedLang of ["zh-TW", "zh-Hant", "zh-Hant-TW", "zh-HK", "zh-Hant-HK", "zh-MO"]) {
      expect(resolveInitialLang({ storedLang: null, detectedLang })).toBe("zh-TW");
    }
  });

  it("resolves the remaining Chinese locales to zh-CN", () => {
    for (const detectedLang of ["zh", "zh-CN", "zh-Hans", "zh-Hans-CN", "zh-SG"]) {
      expect(resolveInitialLang({ storedLang: null, detectedLang })).toBe("zh-CN");
    }
  });

  it("lets an explicit Chinese script win over the region", () => {
    for (const detectedLang of ["zh-Hans-HK", "zh-Hans-MO", "zh-Hans-TW"]) {
      expect(resolveInitialLang({ storedLang: null, detectedLang })).toBe("zh-CN");
    }
    expect(resolveInitialLang({ storedLang: null, detectedLang: "zh-Hant-CN" })).toBe("zh-TW");
  });

  it("falls back to Simplified Chinese for unsupported values", () => {
    expect(resolveInitialLang({ storedLang: "de", detectedLang: "ko" })).toBe("zh-CN");
    expect(resolveInitialLang({ storedLang: "fr", detectedLang: "ja" })).toBe("zh-CN");
    expect(resolveInitialLang({ storedLang: "ru", detectedLang: null })).toBe("zh-CN");
  });
});

describe("createAppI18n", () => {
  it("creates an i18n instance with app translations", () => {
    const english = createAppI18n("en");
    const simplified = createAppI18n("zh-CN");
    const traditionalChinese = createAppI18n("zh-TW");

    expect(english.lang).toBe("en");
    expect(english.t("nav.providers")).toBe("Providers");
    expect(english.t("language.en")).toBe("English");
    expect(simplified.lang).toBe("zh-CN");
    expect(simplified.t("language.zh-CN")).toBe("简体中文");
    expect(traditionalChinese.lang).toBe("zh-TW");
    expect(traditionalChinese.t("nav.providers")).toBe("服務提供者");
    expect(traditionalChinese.t("language.zh-TW")).toBe("繁體中文");
    expect(supportedLangs).toEqual(["en", "zh-CN", "zh-TW"]);
  });
});

describe("locales", () => {
  // A missing key silently falls back to English at runtime, so parity is only
  // ever caught here.
  const enEntries = flattenLocale(en);

  it.each([
    ["zh-CN", zhCN],
    ["zh-TW", zhTW],
  ] satisfies [string, LocaleTree][])("%s matches the en keys and placeholders", (_lang, locale) => {
    const entries = flattenLocale(locale);
    expect(entries.map(([key]) => key)).toEqual(enEntries.map(([key]) => key));

    const translations = new Map(entries);
    for (const [key, value] of enEntries) {
      expect(placeholders(translations.get(key) ?? "")).toEqual(placeholders(value));
    }
  });
});
