import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import { registerCompanyRoutes } from "../routes.ts";
import { personalTeamName, TeamsStore } from "./store.ts";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function login(
  app: Hono,
  email = "admin@acme.test",
): Promise<{ token: string; teams: Array<{ id: string; name: string }>; defaultTeamId?: string }> {
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
  const body = (await verify.json()) as {
    token: string;
    teams?: Array<{ id: string; name: string }>;
    defaultTeamId?: string;
  };
  expect(verify.status).toBe(200);
  expect(body.teams?.length).toBeGreaterThanOrEqual(1);
  return { token: body.token, teams: body.teams ?? [], defaultTeamId: body.defaultTeamId };
}

describe("teams API", () => {
  it("creates team, lists members, adds member", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-team-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
    });
    const { token } = await login(app);
    const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const create = await app.request("/api/teams", {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ name: "hopefullstack_team", avatarUrl: "" }),
    });
    expect(create.status).toBe(201);
    const created = (await create.json()) as { team: { id: string; name: string } };
    expect(created.team.name).toBe("hopefullstack_team");

    const members = await app.request(`/api/teams/${created.team.id}/members`, { headers: auth });
    expect(members.status).toBe(200);
    const membersBody = (await members.json()) as { items: Array<{ teamRole: string }> };
    expect(membersBody.items.some((m) => m.teamRole === "creator")).toBe(true);

    const add = await app.request(`/api/teams/${created.team.id}/members`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ email: "user@acme.test", role: "member" }),
    });
    expect(add.status).toBe(201);

    const members2 = await app.request(`/api/teams/${created.team.id}/members`, { headers: auth });
    const body2 = (await members2.json()) as { items: unknown[] };
    expect(body2.items.length).toBeGreaterThanOrEqual(2);

    const list = await app.request("/api/teams", { headers: auth });
    const listBody = (await list.json()) as { items: Array<{ name: string }> };
    expect(listBody.items.some((t) => t.name === "hopefullstack_team")).toBe(true);
  });

  it("first login auto-creates personal default team and lists creator as member", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-team-default-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "hope@acme.test",
      devOtp: "000000",
    });
    const { token, teams, defaultTeamId } = await login(app, "hope@acme.test");
    expect(defaultTeamId).toBe(teams[0]!.id);
    expect(teams[0]!.name).toBe(personalTeamName("hope"));

    const auth = { authorization: `Bearer ${token}` };
    const members = await app.request(`/api/teams/${teams[0]!.id}/members`, { headers: auth });
    expect(members.status).toBe(200);
    const body = (await members.json()) as {
      team: { name: string };
      items: Array<{ email: string; teamRole: string; isCreator?: boolean }>;
    };
    expect(body.team.name).toBe(personalTeamName("hope"));
    expect(body.items).toHaveLength(1);
    expect(body.items[0]!.email).toBe("hope@acme.test");
    expect(body.items[0]!.teamRole).toBe("creator");
  });

  it("second user gets their own personal team, not the first user's", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-team-iso-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
    });
    const admin = await login(app, "admin@acme.test");
    // Admin invites second user as member via their personal team, then second logs in.
    // Second user without prior membership should still get a personal team on verify
    // when they are first-created... actually non-bootstrap cannot self-register.
    // Use store directly for isolation unit + listTeamsForMember via API for admin.
    const store = new TeamsStore(dataDir);
    const a = await store.ensureDefaultTeam({ name: "alice", createdBy: "member-a" });
    const b = await store.ensureDefaultTeam({ name: "bob", createdBy: "member-b" });
    expect(a.id).not.toBe(b.id);
    expect(a.name).toBe(personalTeamName("alice"));
    expect(b.name).toBe(personalTeamName("bob"));
    const aTeams = await store.listTeamsForMember("member-a");
    const bTeams = await store.listTeamsForMember("member-b");
    expect(aTeams.map((t) => t.id)).toEqual([a.id]);
    expect(bTeams.map((t) => t.id)).toEqual([b.id]);
    // ensure again is idempotent
    const a2 = await store.ensureDefaultTeam({ name: "alice", createdBy: "member-a" });
    expect(a2.id).toBe(a.id);
    expect(admin.teams.length).toBeGreaterThanOrEqual(1);
  });
});

describe("personalTeamName", () => {
  it("uses OOMOL-style {local}_team for short seeds", () => {
    expect(personalTeamName("hope")).toBe("hope_team");
    expect(personalTeamName("hopefullstack_team")).toBe("hopefullstack_team");
  });
});

describe("team member role + remove API", () => {
  it("updates assignable role and refuses to remove creator", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-team-role-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
    });
    const { token, teams } = await login(app, "admin@acme.test");
    const teamId = teams[0]!.id;
    const auth = { authorization: `Bearer ${token}`, "content-type": "application/json" };

    const add = await app.request(`/api/teams/${teamId}/members`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({ email: "member@acme.test", role: "member" }),
    });
    expect(add.status).toBe(201);
    const added = (await add.json()) as { member: { id: string } };

    const promote = await app.request(`/api/teams/${teamId}/members/${added.member.id}`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ role: "admin" }),
    });
    expect(promote.status).toBe(200);

    const members = await app.request(`/api/teams/${teamId}/members`, { headers: auth });
    const body = (await members.json()) as { items: Array<{ id: string; teamRole: string }> };
    const creator = body.items.find((m) => m.teamRole === "creator");
    expect(creator).toBeTruthy();
    const demoteCreator = await app.request(`/api/teams/${teamId}/members/${creator!.id}`, {
      method: "PUT",
      headers: auth,
      body: JSON.stringify({ role: "member" }),
    });
    expect(demoteCreator.status).toBe(403);

    const removeCreator = await app.request(`/api/teams/${teamId}/members/${creator!.id}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(removeCreator.status).toBe(403);

    const removeMember = await app.request(`/api/teams/${teamId}/members/${added.member.id}`, {
      method: "DELETE",
      headers: auth,
    });
    expect(removeMember.status).toBe(200);

    const after = await app.request(`/api/teams/${teamId}/members`, { headers: auth });
    const afterBody = (await after.json()) as { items: Array<{ id: string }> };
    expect(afterBody.items.some((m) => m.id === added.member.id)).toBe(false);
  });

  it("team add auto-creates org account when email unknown", async () => {
    const dataDir = await mkdtemp(join(tmpdir(), "omc-team-auto-"));
    tempRoots.push(dataDir);
    const app = new Hono();
    registerCompanyRoutes(app, {
      dataDir,
      bootstrapAdminEmail: "admin@acme.test",
      devOtp: "000000",
    });
    const { token, teams } = await login(app, "admin@acme.test");
    const teamId = teams[0]!.id;
    const add = await app.request(`/api/teams/${teamId}/members`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ email: "newbie@acme.test", displayName: "New" }),
    });
    expect(add.status).toBe(201);
    const body = (await add.json()) as { createdOrgAccount?: boolean; member: { email: string } };
    expect(body.createdOrgAccount).toBe(true);
    expect(body.member.email).toBe("newbie@acme.test");
    const org = await app.request("/api/org/members", { headers: { authorization: `Bearer ${token}` } });
    const orgBody = (await org.json()) as { items: Array<{ email: string }> };
    expect(orgBody.items.some((m) => m.email === "newbie@acme.test")).toBe(true);
  });
});

