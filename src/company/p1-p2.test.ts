import type { RunLog } from "../server/storage/runtime-store.ts";

import { Hono } from "hono";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateRawSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { runsToCsv, runsToJsonl, summarizeUsage } from "./audit/export.ts";
import { registerCompanyRoutes } from "./routes.ts";
import { extractZipEntries, findSkillMarkdown } from "./skills/zip.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function loginAdmin(app: Hono, email = "admin@acme.test"): Promise<string> {
  await app.request("/api/company/auth/email/start", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const verify = await app.request("/api/company/auth/email/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, code: "000000" }),
  });
  return ((await verify.json()) as { token: string }).token;
}

function makeStoreZip(files: Array<{ path: string; content: string }>): Buffer {
  // Build a minimal ZIP with STORE method only
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.path, "utf8");
    const data = Buffer.from(file.content, "utf8");
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); // store
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(0, 14); // crc skip
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    parts.push(local, data);

    const cen = Buffer.alloc(46 + name.length);
    cen.writeUInt32LE(0x02014b50, 0);
    cen.writeUInt16LE(20, 4);
    cen.writeUInt16LE(20, 6);
    cen.writeUInt16LE(0, 8);
    cen.writeUInt16LE(0, 10);
    cen.writeUInt16LE(0, 12);
    cen.writeUInt16LE(0, 14);
    cen.writeUInt32LE(0, 16);
    cen.writeUInt32LE(data.length, 20);
    cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(name.length, 28);
    cen.writeUInt16LE(0, 30);
    cen.writeUInt16LE(0, 32);
    cen.writeUInt16LE(0, 34);
    cen.writeUInt16LE(0, 36);
    cen.writeUInt32LE(0, 38);
    cen.writeUInt32LE(offset, 42);
    name.copy(cen, 46);
    central.push(cen);
    offset += local.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  return Buffer.concat([...parts, centralBuf, end]);
}

describe("P1/P2 company extensions", () => {
  it("extracts zip skill packages", () => {
    const zip = makeStoreZip([
      { path: "demo@1.0.0/SKILL.md", content: "# Demo\n\nhello\n" },
      { path: "demo@1.0.0/notes.txt", content: "x" },
    ]);
    const entries = extractZipEntries(zip);
    expect(entries.some((e) => e.path.endsWith("SKILL.md"))).toBe(true);
    const found = findSkillMarkdown(entries);
    expect(found.skillMd).toContain("# Demo");
  });

  it("deflate zip entries also work", () => {
    const body = Buffer.from("# Deflate Skill\n", "utf8");
    const compressed = deflateRawSync(body);
    const name = Buffer.from("SKILL.md", "utf8");
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(body.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    const zip = Buffer.concat([local, compressed, eocd]);
    const entries = extractZipEntries(zip);
    expect(entries[0]!.data.toString("utf8")).toContain("Deflate Skill");
  });

  it("members + zip upload + share + audit + usage + userdata + feishu", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-p12-"));
    tempRoots.push(dataDir);
    const runs: RunLog[] = [
      {
        id: "r1",
        service: "gmail",
        actionId: "mail.send",
        caller: "http",
        startedAt: "2026-08-03T00:00:00.000Z",
        completedAt: "2026-08-03T00:00:01.000Z",
        durationMs: 1000,
        ok: false,
        memberId: "m1",
        errorCode: "action_blocked",
        errorMessage: "blocked",
      },
      {
        id: "r2",
        service: "hn",
        actionId: "news.top",
        caller: "http",
        startedAt: "2026-08-03T00:00:02.000Z",
        completedAt: "2026-08-03T00:00:03.000Z",
        durationMs: 1000,
        ok: true,
        memberId: "m1",
      },
    ];
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
      listRuns: async () => runs,
    });
    const token = await loginAdmin(app);
    const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const membersBefore = await app.request("/api/org/members", { headers: auth });
    expect(membersBefore.status).toBe(200);

    const add = await app.request("/api/org/members", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ email: "user@acme.test", roles: ["member"] }),
    });
    expect(add.status).toBe(201);

    const zip = makeStoreZip([{ path: "zip-skill@0.1.0/SKILL.md", content: "# Zip Skill\n" }]);
    const upload = await app.request("/api/org/skills/upload-zip", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        zipBase64: zip.toString("base64"),
        packageId: "zip-skill@0.1.0",
        name: "Zip Skill",
        enable: true,
      }),
    });
    expect(upload.status).toBe(200);

    const vis = await app.request("/api/org/skills/visibility", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ packageId: "zip-skill@0.1.0", visibleToRoles: ["admin"] }),
    });
    expect(vis.status).toBe(200);

    const share = await app.request("/api/org/skills/share", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ packageId: "zip-skill@0.1.0" }),
    });
    expect(share.status).toBe(200);
    const shareBody = (await share.json()) as { shareToken: string };
    const shared = await app.request(`/api/catalog/skills/share/${shareBody.shareToken}`);
    expect(shared.status).toBe(200);

    const exportRes = await app.request("/api/company/audit/export?format=csv", { headers: auth });
    expect(exportRes.status).toBe(200);
    const csv = await exportRes.text();
    expect(csv).toContain("mail.send");

    const usage = await app.request("/api/company/usage", { headers: auth });
    expect(usage.status).toBe(200);
    const usageBody = (await usage.json()) as { totalRuns: number; failedRuns: number };
    expect(usageBody.totalRuns).toBe(2);
    expect(usageBody.failedRuns).toBe(1);

    const companyRuns = await app.request("/api/company/runs?limit=10", { headers: auth });
    expect(companyRuns.status).toBe(200);
    const companyRunsBody = (await companyRuns.json()) as { items: Array<{ id: string }> };
    expect(companyRunsBody.items.length).toBeGreaterThanOrEqual(1);

    const ud = await app.request("/api/me/userdata", {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ theme: "dark", locale: "zh-CN" }),
    });
    expect(ud.status).toBe(200);

    const overview = await app.request("/api/company/overview", { headers: auth });
    expect(overview.status).toBe(200);
    const ov = (await overview.json()) as { recentPolicyDenyCount: number; memberCount: number };
    expect(ov.memberCount).toBeGreaterThanOrEqual(2);
    expect(ov.recentPolicyDenyCount).toBe(1);

    const feishu = await app.request("/api/company/auth/feishu/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ openId: "ou_test", email: "feishu@acme.test", autoProvision: true }),
    });
    expect(feishu.status).toBe(501);
  });

  it("audit helpers serialize runs", () => {
    const runs: RunLog[] = [
      {
        id: "1",
        service: "s",
        actionId: "a",
        caller: "http",
        startedAt: "t0",
        completedAt: "t1",
        durationMs: 1,
        ok: true,
      },
    ];
    expect(runsToJsonl(runs)).toContain('"id":"1"');
    expect(runsToCsv(runs)).toContain("id,service");
    expect(summarizeUsage(runs).okRuns).toBe(1);
  });
});
