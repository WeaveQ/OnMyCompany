# Member onboarding (desktop)

For employees who already have an org account. **There is no company workbench or chat page.** You work in desktop OnMyAgent.

Chinese walkthrough: [docs/user-guide/desktop.md](../user-guide/desktop.md).

## After you sign in

1. Open OnMyAgent → **Settings → Workspace → Company**.
2. Enter the company Base URL (example: `http://127.0.0.1:3100`) and complete email OTP.
3. After sync you should see:
   - Org **Skills** (only packages your role may see)
   - Org **experts** (persona packs, if an admin enabled them)
   - **Model catalog** entries that point at OmniRoute (no API keys)
   - **Gateway** services (office connections). Secrets stay on the company server.
4. Chat still uses **OmniRoute** (`OPENAI_BASE_URL` / model router). Tools go through company `/v1` or `/mcp` with your runtime token.
5. If an action is denied, read the message (policy, team grant, or tool-run quota). Model token limits are in OmniRoute, not this console.

## What you will not see

- A browser “new chat” in the admin console
- Model API keys
- Other members’ personal skills

Admins: use the overview **Admin onboarding** checklist, then send this page to the team.
