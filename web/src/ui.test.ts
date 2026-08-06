import type { ProviderDefinition } from "./model";

import { I18nProvider } from "@embra/i18n/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createAppI18n } from "./i18n";
import {
  App,
  getMoreNavPaths,
  getPrimaryNavPaths,
  getShellHeadingKey,
  loadRuntimeData,
  nextAuthLoadState,
  nextLogoutState,
  subscribeToOAuthCompletions,
  UnlockView,
} from "./ui";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("primary nav IA", () => {
  it("lists overview, accounts, and team as primary peers (connections live under capability)", () => {
    const paths = getPrimaryNavPaths();
    expect(paths).toEqual(["/overview", "/members", "/team"]);
    expect(paths).not.toContain("/connections");
    expect(paths).not.toContain("/org/teams");
    expect(paths).not.toContain("/providers");
  });

  it("lists secondary sidebar paths flat; connections under capability with skills/access", () => {
    const more = getMoreNavPaths();
    expect(more).toEqual(
      expect.arrayContaining(["/connections", "/skills", "/runs", "/access", "/org-config", "/metering"]),
    );
    // Capability cluster: connections before skills/access in group order
    expect(more.indexOf("/connections")).toBeLessThan(more.indexOf("/skills"));
    expect(more).not.toContain("/actions");
    expect(more).not.toContain("/built-in-tools");
  });

  it("maps shell header title keys for all primary sections including audit", () => {
    expect(getShellHeadingKey("/overview")).toBe("overview");
    expect(getShellHeadingKey("/audit-events")).toBe("auditEvents");
    expect(getShellHeadingKey("/metering")).toBe("metering");
    expect(getShellHeadingKey("/connections")).toBe("connections");
    expect(getShellHeadingKey("/members")).toBe("members");
    expect(getShellHeadingKey("/team")).toBe("team");
    expect(getShellHeadingKey("/org/teams")).toBe("orgTeams");
    expect(getShellHeadingKey("/org-config")).toBe("orgConfig");
  });

  it("connections headings describe enterprise-shared pool, not per-team vault", () => {
    const en = JSON.parse(readFileSync(join(import.meta.dirname, "locales/en.json"), "utf8")) as {
      shell: { headings: { connections: { title: string; subtitle: string } } };
      connectionsPage: { title: string; lead: string };
    };
    const zh = JSON.parse(readFileSync(join(import.meta.dirname, "locales/zh-CN.json"), "utf8")) as {
      nav: { connections: string };
      shell: { headings: { connections: { title: string; subtitle: string } } };
      connectionsPage: { title: string; lead: string };
    };
    // English is source of truth for product copy keys
    expect(en.shell.headings.connections.title).toBe("Connectors");
    expect(en.shell.headings.connections.title.toLowerCase()).not.toMatch(/^team app/);
    expect(en.shell.headings.connections.subtitle.toLowerCase()).toMatch(/enterprise-shared|company/);
    expect(en.connectionsPage.lead.toLowerCase()).toMatch(/enterprise-shared|company/);
    // zh locale is present and not the old team-vault framing
    expect(zh.connectionsPage.title).toBe("连接器");
    expect(zh.nav.connections).toBe("连接器");
    expect(zh.shell.headings.connections.title).toBe("连接器");
    expect(zh.shell.headings.connections.subtitle).not.toMatch(/Team app connections/i);

    const pageSrc = readFileSync(join(import.meta.dirname, "connections-page.tsx"), "utf8");
    expect(pageSrc).toContain("useTranslate");
    expect(pageSrc).toContain("connectionsPage.title");
    expect(pageSrc).not.toContain('"Team app connections"');
  });
});

describe("App", () => {
  it("does not render the console shell before the initial auth check finishes", () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(MemoryRouter, { initialEntries: ["/"] }, createElement(App)),
      ),
    );

    expect(markup).not.toContain("app-shell");
    expect(markup).toContain("Loading runtime data");
  });

  it("does not reserve empty error space before loading starts", () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(UnlockView, {
          loading: false,
          message: null,
          theme: "light",
          onThemeChange: () => {},
          onUnlock: () => {},
        }),
      ),
    );

    expect(markup).not.toContain("unlock-status");
    expect(markup).toContain("unlock-button-spinner idle");
  });

  it("marks the unlock button loading state separately from disabled state", () => {
    const markup = renderToStaticMarkup(
      createElement(
        I18nProvider,
        { i18n: createAppI18n("en") },
        createElement(UnlockView, {
          loading: true,
          message: null,
          theme: "light",
          onThemeChange: () => {},
          onUnlock: () => {},
        }),
      ),
    );

    expect(markup).toContain('data-loading="true"');
    expect(markup).toContain('aria-busy="true"');
  });
});

describe("nextLogoutState", () => {
  it("keeps the current auth state when logout fails", () => {
    const state = {
      authSession: { adminAuthConfigured: true, authenticated: true },
    };

    expect(nextLogoutState(state, false)).toBe(state);
  });

  it("clears the current auth state when logout succeeds", () => {
    expect(
      nextLogoutState(
        {
          authSession: { adminAuthConfigured: true, authenticated: true },
        },
        true,
      ),
    ).toEqual({
      authSession: { adminAuthConfigured: true, authenticated: false },
    });
  });
});

describe("nextAuthLoadState", () => {
  it("clears the pending unlock token after the session is authenticated", () => {
    expect(
      nextAuthLoadState(
        {
          pendingUnlockToken: "local-token",
          authSession: { adminAuthConfigured: true, authenticated: false },
          locked: true,
        },
        { adminAuthConfigured: true, authenticated: true },
      ),
    ).toEqual({
      pendingUnlockToken: "",
      authSession: { adminAuthConfigured: true, authenticated: true },
      locked: false,
    });
  });

  it("keeps the console locked while an unlock token is rejected", () => {
    expect(
      nextAuthLoadState(
        {
          pendingUnlockToken: "wrong-token",
          authSession: { adminAuthConfigured: true, authenticated: false },
          locked: true,
        },
        { adminAuthConfigured: true, authenticated: false },
      ),
    ).toEqual({
      pendingUnlockToken: "wrong-token",
      authSession: { adminAuthConfigured: true, authenticated: false },
      locked: true,
    });
  });
});

describe("subscribeToOAuthCompletions", () => {
  it("refreshes when the OAuth callback broadcasts completion", () => {
    const addEventListener = vi.fn();
    class FakeBroadcastChannel {
      static instance: FakeBroadcastChannel | undefined;
      private listener: ((event: MessageEvent) => void) | undefined;
      closed = false;

      constructor(readonly name: string) {
        FakeBroadcastChannel.instance = this;
      }

      addEventListener(type: string, listener: (event: MessageEvent) => void): void {
        if (type === "message") {
          this.listener = listener;
        }
      }

      close(): void {
        this.closed = true;
      }

      emit(data: unknown): void {
        this.listener?.({ data } as MessageEvent);
      }
    }
    vi.stubGlobal("addEventListener", addEventListener);
    vi.stubGlobal("BroadcastChannel", FakeBroadcastChannel);
    const refresh = vi.fn();

    const unsubscribe = subscribeToOAuthCompletions(refresh);
    FakeBroadcastChannel.instance?.emit({ type: "oauth.completed", service: "gmail" });

    expect(FakeBroadcastChannel.instance?.name).toBe("onmycompany-oauth");
    expect(addEventListener).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledWith({ type: "oauth.completed", service: "gmail" });
    unsubscribe();
    expect(FakeBroadcastChannel.instance?.closed).toBe(true);
  });
});

describe("loadRuntimeData", () => {
  it("uses the unlock token only when reading the auth session", async () => {
    const calls: Array<{ path: string; headers: Headers }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ path: String(path), headers: new Headers(init?.headers) });
        if (path === "/api/auth/session") {
          return Response.json({ adminAuthConfigured: true, authenticated: true });
        }
        if (path === "/api/runs") {
          return Response.json({ items: [], nextCursor: null });
        }
        if (path === "/api/runtime-policy") {
          const rules = { allowedActions: [], blockedActions: [], allowedProxies: [], blockedProxies: [] };
          return Response.json({ deployment: rules, runtime: rules });
        }
        return Response.json([]);
      }),
    );

    await loadRuntimeData("local-token");

    expect(calls.map((call) => call.path)).toEqual([
      "/api/auth/session",
      "/api/providers",
      "/api/connections",
      "/api/oauth/configs",
      "/api/runtime-tokens",
      "/api/runtime-policy",
      "/api/runs",
    ]);
    expect(calls[0]?.headers.get("authorization")).toBe("Bearer local-token");
    for (const call of calls.slice(1)) {
      expect(call.headers.get("authorization")).toBeNull();
    }
  });

  it("skips fetching /api/providers when cachedProviders is an empty array", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: RequestInfo | URL) => {
        calls.push(String(path));
        if (path === "/api/auth/session") {
          return Response.json({ adminAuthConfigured: true, authenticated: true });
        }
        if (path === "/api/runs") {
          return Response.json({ items: [], nextCursor: null });
        }
        if (path === "/api/runtime-policy") {
          const rules = { allowedActions: [], blockedActions: [], allowedProxies: [], blockedProxies: [] };
          return Response.json({ deployment: rules, runtime: rules });
        }
        return Response.json([]);
      }),
    );

    const result = await loadRuntimeData("", []);

    expect(calls).not.toContain("/api/providers");
    expect(result.data.providers).toEqual([]);
  });

  it("does not cache catalog when initial session is unauthenticated and fetches catalog on unlock", async () => {
    const calls: string[] = [];
    let sessionAuthenticated = false;

    vi.stubGlobal(
      "fetch",
      vi.fn(async (path: RequestInfo | URL) => {
        calls.push(String(path));
        if (path === "/api/auth/session") {
          return Response.json({ adminAuthConfigured: true, authenticated: sessionAuthenticated });
        }
        if (path === "/api/providers") {
          return Response.json([{ service: "example", displayName: "Example" }]);
        }
        if (path === "/api/runs") {
          return Response.json({ items: [], nextCursor: null });
        }
        if (path === "/api/runtime-policy") {
          const rules = { allowedActions: [], blockedActions: [], allowedProxies: [], blockedProxies: [] };
          return Response.json({ deployment: rules, runtime: rules });
        }
        return Response.json([]);
      }),
    );

    // Initial unauthenticated load (simulating useEffect in App)
    let cachedProviders: ProviderDefinition[] | undefined = undefined;
    const initialResult = await loadRuntimeData("", cachedProviders);
    if (initialResult.authSession.authenticated) {
      cachedProviders = initialResult.data.providers;
    } else {
      cachedProviders = undefined;
    }

    expect(initialResult.authSession.authenticated).toBe(false);
    expect(initialResult.data.providers).toEqual([]);
    expect(cachedProviders).toBeUndefined();

    // User unlocks with valid token
    sessionAuthenticated = true;
    const unlockResult = await loadRuntimeData("valid-token", cachedProviders);
    if (unlockResult.authSession.authenticated) {
      cachedProviders = unlockResult.data.providers;
    }

    expect(calls).toContain("/api/providers");
    expect(unlockResult.data.providers).toEqual([{ service: "example", displayName: "Example" }]);
    expect(cachedProviders).toEqual([{ service: "example", displayName: "Example" }]);
  });
});
