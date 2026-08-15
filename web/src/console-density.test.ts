import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("console density polish", () => {
  const polish = readFileSync(join(import.meta.dirname, "styles/console-polish.css"), "utf8");
  const overview = readFileSync(join(import.meta.dirname, "styles/overview.css"), "utf8");
  const access = readFileSync(join(import.meta.dirname, "styles/access.css"), "utf8");
  const org = readFileSync(join(import.meta.dirname, "org-config-page.tsx"), "utf8");
  const connections = readFileSync(join(import.meta.dirname, "connections-page.tsx"), "utf8");
  const overviewPage = readFileSync(join(import.meta.dirname, "overview-page.tsx"), "utf8");

  it("does not stretch checkboxes to full width (BYOK label stays next to the box)", () => {
    expect(polish).toContain('.org-config-form-grid input[type="checkbox"]');
    expect(polish).toMatch(/input\[type="checkbox"\][\s\S]{0,80}width:\s*auto/);
    expect(polish).toContain("org-config-check");
    expect(polish).toContain("width: max-content");
  });

  it("lays quota fields in a two-column grid", () => {
    expect(org).toContain("org-config-quota-grid");
    expect(polish).toContain("org-config-quota-grid");
    expect(polish).toMatch(/org-config-quota-grid[\s\S]{0,80}repeat\(2/);
  });

  it("keeps connection team grants inside the scroll body", () => {
    const grantsAt = connections.indexOf("<ConnectionTeamGrantsCard");
    const scrollClose = connections.lastIndexOf("connections-scroll-body");
    expect(grantsAt).toBeGreaterThan(0);
    expect(connections.slice(0, grantsAt)).toContain("connections-scroll-body");
    expect(connections.indexOf("connections-scroll-body")).toBeLessThan(grantsAt);
    void scrollClose;
  });

  it("shows overview metrics before the onboarding list", () => {
    const metrics = overviewPage.indexOf('data-overview-section="capability"');
    const onboard = overviewPage.indexOf("<AdminOnboardingChecklist");
    expect(metrics).toBeGreaterThan(0);
    expect(onboard).toBeGreaterThan(metrics);
    expect(overview).toContain("grid-template-columns: 1.25rem minmax(0, 1fr) auto");
  });

  it("wraps the access policy tester so the test button stays on-screen", () => {
    expect(access).toMatch(/\.policy-tester-form \{[\s\S]{0,80}flex-wrap:\s*wrap/);
  });

  it("keeps tools empty states compact instead of 140px holes", () => {
    const polish = readFileSync(join(import.meta.dirname, "styles/console-polish.css"), "utf8");
    expect(polish).toContain(".tools-page .console-empty");
    expect(polish).toMatch(/\.tools-page \.console-empty \{[\s\S]{0,80}min-height:\s*0/);
  });
});
