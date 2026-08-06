import { describe, expect, it } from "vitest";
import {
  OFFICE_CATALOG_SERVICES,
  filterProvidersByServices,
  resolveAllowedCatalogServices,
} from "./office-catalog.ts";

describe("office catalog allowlist", () => {
  it("defaults to office profile with curated services", () => {
    const set = resolveAllowedCatalogServices({});
    expect(set).not.toBeNull();
    expect(set!.has("gmail")).toBe(true);
    expect(set!.has("notion")).toBe(true);
    expect(set!.has("feishu")).toBe(true);
    expect(set!.has("slack")).toBe(true);
    // ready-to-use + CN extras
    expect(set!.has("hackernews")).toBe(true);
    expect(set!.has("quickchart")).toBe(true);
    expect(set!.has("qq_mail")).toBe(true);
    expect(set!.has("aliyun_oss")).toBe(true);
    expect(set!.size).toBe(OFFICE_CATALOG_SERVICES.length);
  });

  it("full profile disables filtering", () => {
    expect(resolveAllowedCatalogServices({ profile: "full" })).toBeNull();
    expect(resolveAllowedCatalogServices({ allowedServicesEnv: "*" })).toBeNull();
  });

  it("explicit services override profile", () => {
    const set = resolveAllowedCatalogServices({
      profile: "full",
      allowedServicesEnv: "gmail, notion",
    });
    expect(set).toEqual(new Set(["gmail", "notion"]));
  });

  it("filters provider list by service id", () => {
    const providers = [{ service: "gmail" }, { service: "exotic_crm" }, { service: "slack" }];
    const allowed = new Set(["gmail", "slack"]);
    expect(filterProvidersByServices(providers, allowed).map((p) => p.service)).toEqual([
      "gmail",
      "slack",
    ]);
    expect(filterProvidersByServices(providers, null)).toHaveLength(3);
  });
});
