import { describe, expect, it } from "vitest";
import { Hono } from "hono";
import { CompanyAuthError } from "./auth/store.ts";
import { TeamsError } from "./teams/store.ts";
import { jsonError, mapError, publicMember, readJsonBody } from "./http.ts";

describe("company http helpers", () => {
  it("publicMember strips internal fields", () => {
    expect(
      publicMember({
        id: "m1",
        email: "a@b.c",
        displayName: "A",
        roles: ["admin"],
        status: "active",
        createdAt: "t",
      }),
    ).toEqual({
      id: "m1",
      email: "a@b.c",
      displayName: "A",
      roles: ["admin"],
      status: "active",
      statusLabel: "已启用",
    });
  });

  it("mapError maps company domain errors to status codes", async () => {
    const app = new Hono();
    app.get("/auth", (c) => mapError(c, new CompanyAuthError("unauthenticated", "need login")));
    app.get("/team", (c) => mapError(c, new TeamsError("not_found", "missing")));
    app.get("/bad", (c) => mapError(c, new TeamsError("validation_error", "bad name")));

    expect((await app.request("/auth")).status).toBe(401);
    expect((await app.request("/team")).status).toBe(404);
    expect((await app.request("/bad")).status).toBe(400);
  });

  it("readJsonBody returns empty object on invalid body", async () => {
    const app = new Hono();
    app.post("/x", async (c) => c.json(await readJsonBody(c)));
    const res = await app.request("/x", { method: "POST", body: "not-json" });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({});
  });

  it("jsonError shape", async () => {
    const app = new Hono();
    app.get("/e", (c) => jsonError(c, 400, "validation_error", "x"));
    const res = await app.request("/e");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: { code: "validation_error", message: "x" } });
  });
});
