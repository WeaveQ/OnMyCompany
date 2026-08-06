import { describe, expect, it } from "vitest";
import { renderOAuthCompletionPage } from "./oauth-completion-page.ts";

describe("renderOAuthCompletionPage", () => {
  it("renders escaped completion content and the broadcast payload", () => {
    const html = renderOAuthCompletionPage('oauth_<example>"');

    expect(html).toContain("Connection ready");
    expect(html).toContain("<code>oauth_&lt;example&gt;&quot;</code>");
    expect(html).toContain('"type":"oauth.completed"');
    expect(html).toContain('"service":"oauth_\\u003cexample>\\""');
    expect(html).toContain("BroadcastChannel");
    expect(html).not.toContain('<code>oauth_<example>"</code>');
  });

  it("embeds client-side translations and a manual-close fallback", () => {
    const html = renderOAuthCompletionPage("github");

    // Localizable nodes are marked so the client script can swap text.
    expect(html).toContain('data-t="badge"');
    expect(html).toContain('data-t="title"');
    expect(html).toContain("data-close-note");
    // Bundled locales (English default plus zh-CN / zh-TW).
    expect(html).toContain("连接已就绪");
    expect(html).toContain("連線已就緒");
    // Honest close handling: a manual-close hint replaces the countdown when
    // window.close() is blocked on a user-navigated tab.
    expect(html).toContain("现在可以手动关闭此窗口。");
    expect(html).toContain("navigator.languages");
  });
});
