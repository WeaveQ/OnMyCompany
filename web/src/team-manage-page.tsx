import type { AccountLifecycle, TeamRecord } from "./team-ui";
import type { ReactNode } from "react";

import { Check, ChevronDown, ChevronsUpDown, Copy, Pencil, Plus, Trash2, Users } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "./api";
import { MemberLoginCard } from "./member-login-card";
import {
  ensureMemberSessionForConsole,
  getActiveTeamId,
  hasMemberSession,
  memberAuthHeaders,
  setActiveTeamId as persistActiveTeamId,
  setMemberToken,
  subscribeActiveTeamId,
} from "./member-session";
import { ConsoleModal, InlineError } from "./shared-ui";
import {
  ALL_TEAMS_ID,
  accountStatusLabel,
  accountStatusTone,
  canSubmitCreateTeam,
  formatTeamIdSnippet,
  isAllTeamsView,
  isValidTeamName,
  resolveMembershipTeamId,
  roleLabel,
  TEAM_ASSIGNABLE_ROLES,
} from "./team-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type { TeamRecord };

interface TeamMemberRow {
  id: string;
  email: string;
  displayName: string;
  teamRole: string;
  status: string;
  accountStatus?: AccountLifecycle | string;
  isCreator?: boolean;
  roles?: string[];
}

interface OrgMemberRow {
  id: string;
  email: string;
  displayName: string;
  roles: string[];
  status?: string;
  statusLabel?: string;
}

/** Team membership row (current team only — org lifecycle lives on Accounts). */
interface PeopleRow {
  id: string;
  email: string;
  displayName: string;
  accountStatus: AccountLifecycle | string;
  statusLabel: string;
  teamRole?: string;
  inTeam: boolean;
  isCreator?: boolean;
}

/** Status chips for current-team members only (no company-wide filter). */
type PeopleFilter = "all" | "pending" | "active" | "deactivated";

function normalizeAccountStatus(raw?: string): AccountLifecycle | string {
  if (raw === "pending" || raw === "Pending" || raw === "未激活") return "pending";
  if (raw === "deactivated" || raw === "Deactivated") return "deactivated";
  if (raw === "active" || raw === "Active" || raw === "Active") return "active";
  if (raw === "Disabled") return "deactivated";
  return "active";
}

export function TeamManagePage(): ReactNode {
  const [params, setParams] = useSearchParams();
  const teamId = params.get("team") || getActiveTeamId() || "";
  const filterParam = ((): PeopleFilter => {
    const f = params.get("filter");
    if (f === "pending" || f === "active" || f === "deactivated") return f;
    return "all";
  })();
  const [filter, setFilter] = useState<PeopleFilter>(filterParam);
  const [team, setTeam] = useState<TeamRecord | null>(null);
  const [teams, setTeams] = useState<TeamRecord[]>([]);
  const [items, setItems] = useState<TeamMemberRow[]>([]);
  const [orgMembers, setOrgMembers] = useState<OrgMemberRow[]>([]);
  const [meRoles, setMeRoles] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [editName, setEditName] = useState("");
  const [editAvatar, setEditAvatar] = useState("");
  const [loginEmail, setLoginEmail] = useState("admin@company.internal");
  const [code, setCode] = useState("000000");
  const [authed, setAuthed] = useState(hasMemberSession());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [idTipOpen, setIdTipOpen] = useState(false);

  const isOrgAdmin = meRoles.includes("admin");

  useEffect(() => {
    setFilter(filterParam);
  }, [filterParam]);

  // Sidebar TeamSwitcher: keep ?team= in sync when switched from outside this page.
  // Never write ALL_TEAMS_ID into the membership URL (not a real team resource).
  useEffect(
    () =>
      subscribeActiveTeamId((id) => {
        if (!id || isAllTeamsView(id) || id === params.get("team")) return;
        const next = new URLSearchParams(params);
        next.set("team", id);
        setParams(next, { replace: true });
      }),
    [params, setParams],
  );

  function switchFilter(next: PeopleFilter): void {
    setFilter(next);
    const nextParams = new URLSearchParams(params);
    nextParams.delete("tab"); // drop legacy dual-tab param
    if (next === "all") nextParams.delete("filter");
    else nextParams.set("filter", next);
    if (teamId) nextParams.set("team", teamId);
    setParams(nextParams, { replace: true });
  }

  const refresh = useCallback(async () => {
    setError(null);
    setLoading(true);
    try {
      if (!hasMemberSession()) {
        await ensureMemberSessionForConsole();
      }
      const me = await apiGet<{
        authenticated: boolean;
        memberId?: string | null;
        email?: string | null;
        displayName?: string | null;
        roles?: string[];
        teams?: TeamRecord[];
      }>("/api/me", memberAuthHeaders());
      if (!me.authenticated) {
        setAuthed(false);
        setItems([]);
        setOrgMembers([]);
        setTeam(null);
        setTeams([]);
        setMeRoles([]);
        return;
      }
      setAuthed(true);
      setMeRoles(me.roles ?? []);

      const orgList = await apiGet<{ items: OrgMemberRow[] }>("/api/org/members", memberAuthHeaders());
      setOrgMembers(orgList.items ?? []);

      const list = await apiGet<{ items: TeamRecord[] }>("/api/teams", memberAuthHeaders());
      const teamList = list.items.length ? list.items : (me.teams ?? []);
      setTeams(teamList);
      // Membership page must never call GET /api/teams/__all__/members.
      const preferred = teamId || getActiveTeamId();
      const activeId = resolveMembershipTeamId(teamList, preferred);

      if (!activeId) {
        const personalName = (me.displayName || me.email?.split("@")[0] || "personal").replace(
          /[^a-zA-Z0-9._-]+/g,
          "_",
        );
        setTeam({
          id: "personal",
          name: personalName.length >= 2 ? personalName : "personal_team",
          createdBy: me.memberId || undefined,
        });
        setItems(
          me.memberId
            ? [
                {
                  id: me.memberId,
                  email: me.email || "",
                  displayName: me.displayName || me.email || "",
                  teamRole: "creator",
                  status: "Active",
                  isCreator: true,
                },
              ]
            : [],
        );
        return;
      }

      // Keep Company-wide in the switcher if selected; only rewrite a non-sentinel active id.
      if (!isAllTeamsView(getActiveTeamId()) && getActiveTeamId() !== activeId) {
        persistActiveTeamId(activeId);
      }
      // Membership URL must never carry __all__ as ?team=.
      if (activeId !== teamId || isAllTeamsView(teamId)) {
        const nextParams = new URLSearchParams(params);
        nextParams.set("team", activeId);
        nextParams.delete("tab");
        setParams(nextParams, { replace: true });
      }

      const detail = await apiGet<{ team: TeamRecord; items: TeamMemberRow[] }>(
        `/api/teams/${encodeURIComponent(activeId)}/members`,
        memberAuthHeaders(),
      );
      setTeam(detail.team);
      if (detail.items.length === 0 && me.memberId) {
        setItems([
          {
            id: me.memberId,
            email: me.email || "",
            displayName: me.displayName || me.email || "",
            teamRole: "creator",
            status: "Active",
            isCreator: true,
          },
        ]);
      } else {
        setItems(detail.items);
      }
      setEditName(detail.team.name);
      setEditAvatar(detail.team.avatarUrl || "");
      setSelected(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [teamId, setParams, params]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function login(): Promise<void> {
    setError(null);
    try {
      await apiPost("/api/company/auth/email/start", { email: loginEmail });
      const verified = await apiPost<{
        token: string;
        defaultTeamId?: string;
        teams?: TeamRecord[];
      }>("/api/company/auth/email/verify", {
        email: loginEmail,
        code,
      });
      setMemberToken(verified.token);
      const preferred = verified.defaultTeamId || verified.teams?.[0]?.id;
      if (preferred) {
        persistActiveTeamId(preferred);
        setParams({ team: preferred }, { replace: true });
      }
      setAuthed(true);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    }
  }

  async function addTeamMember(): Promise<void> {
    if (!team || team.id === "personal") return;
    setError(null);
    setMessage(null);
    try {
      // Prefer existing company account email; API creates org account only if missing.
      await apiPost(
        `/api/teams/${team.id}/members`,
        {
          email: email.trim(),
          role: "member",
          displayName: addDisplayName.trim() || undefined,
        },
        memberAuthHeaders(),
      );
      setEmail("");
      setAddDisplayName("");
      setAddOpen(false);
      setMessage("Added to this team. Enable/disable org accounts under Accounts.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not add to this team");
    }
  }

  function buildPeopleRows(): PeopleRow[] {
    return items.map((row) => {
      const accountStatus = normalizeAccountStatus(row.accountStatus || row.status);
      return {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        accountStatus,
        statusLabel:
          row.status === "Disabled"
            ? "Disabled"
            : row.status === "Pending" || row.status === "Active" || row.status === "Deactivated"
              ? row.status
              : accountStatusLabel(accountStatus),
        teamRole: row.teamRole,
        inTeam: true,
        isCreator: row.isCreator || row.teamRole === "creator",
      };
    });
  }

  function applyStatusFilter(rows: PeopleRow[]): PeopleRow[] {
    if (filter === "pending") return rows.filter((r) => r.accountStatus === "pending");
    if (filter === "active") return rows.filter((r) => r.accountStatus === "active");
    if (filter === "deactivated") return rows.filter((r) => r.accountStatus === "deactivated");
    return rows;
  }

  async function saveTeam(): Promise<void> {
    if (!team || team.id === "personal") return;
    setError(null);
    try {
      await apiPut(`/api/teams/${team.id}`, { name: editName, avatarUrl: editAvatar }, memberAuthHeaders());
      setEditOpen(false);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update failed");
    }
  }

  async function changeRole(memberId: string, role: string): Promise<void> {
    if (!team || team.id === "personal") return;
    setError(null);
    try {
      await apiPut(`/api/teams/${team.id}/members/${encodeURIComponent(memberId)}`, { role }, memberAuthHeaders());
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Update role failed");
    }
  }

  async function removeMember(memberId: string): Promise<void> {
    if (!team || team.id === "personal") return;
    setError(null);
    try {
      await apiDelete(`/api/teams/${team.id}/members/${encodeURIComponent(memberId)}`, memberAuthHeaders());
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Remove failed");
    }
  }

  function selectTeam(id: string): void {
    persistActiveTeamId(id);
    const next = new URLSearchParams(params);
    next.set("team", id);
    setParams(next, { replace: true });
  }

  async function copyTeamId(): Promise<void> {
    if (!team || team.id === "personal") return;
    try {
      await navigator.clipboard.writeText(team.id);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // ignore
    }
  }

  function toggleSelect(id: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (!authed) {
    return (
      <div className="page-stack team-manage-page">
        <header className="page-hero">
          <h1 className="page-hero-title">Team</h1>
          <p className="page-hero-lead">
            Manage members and roles on this team. Enable/disable accounts under Accounts.
          </p>
        </header>
        <MemberLoginCard
          title="Sign in to manage team"
          description="Sign in as an enterprise member to manage this team."
          email={loginEmail}
          code={code}
          error={error}
          onEmailChange={setLoginEmail}
          onCodeChange={setCode}
          onSubmit={() => void login()}
        />
      </div>
    );
  }

  const locked = !team || team.id === "personal";
  // Team page only: membership of current team (never org-wide company roster).
  const peopleRows = applyStatusFilter(buildPeopleRows().filter((r) => r.inTeam));
  const pendingCount = peopleRows.filter((r) => r.accountStatus === "pending").length;
  const allSelected = peopleRows.length > 0 && selected.size === peopleRows.length;
  const poolCandidates = orgMembers.filter((m) => !items.some((t) => t.id === m.id));

  return (
    <div className="page-stack team-manage-page" data-testid="team-people-page">
      {error ? <InlineError message={error} /> : null}
      {message ? <p className="page-toast">{message}</p> : null}

      <div className="console-card team-manage-shell">
        <div className="team-manage-header">
          <div className="team-manage-identity">
            <PageTeamSwitcher
              teams={teams}
              activeTeamId={team?.id}
              onSelect={selectTeam}
              onCreate={() => setCreateOpen(true)}
            />
            {team && team.id !== "personal" ? (
              <span
                className="team-id-chip-wrap"
                onMouseEnter={() => setIdTipOpen(true)}
                onMouseLeave={() => setIdTipOpen(false)}
              >
                <button
                  type="button"
                  className="team-id-chip"
                  onClick={() => void copyTeamId()}
                  title="Click to copy full ID"
                >
                  {formatTeamIdSnippet(team.id)}
                </button>
                {idTipOpen || copied ? (
                  <span className="team-id-tooltip" role="tooltip">
                    <Copy size={12} />
                    {copied ? "Copied" : team.id}
                  </span>
                ) : null}
              </span>
            ) : null}
            {team && team.id !== "personal" ? <span className="team-pill">Owner</span> : null}
          </div>

          <div className="team-manage-actions">
            <Button variant="ghost" size="sm" type="button" className="team-manage-secondary-link" asChild>
              <Link to="/org/teams" data-testid="team-open-directory">
                All teams
              </Link>
            </Button>
            <Button variant="ghost" size="sm" type="button" className="team-manage-secondary-link" asChild>
              <Link to="/connections">Connectors</Link>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} disabled={locked}>
              <Pencil size={14} />
              Edit team
            </Button>
            <Button
              size="sm"
              onClick={() => setAddOpen(true)}
              disabled={locked && !isOrgAdmin}
              data-testid="team-add-member"
            >
              <Plus size={14} />
              Add member
            </Button>
          </div>
        </div>

        <div className="team-people-bar">
          <div className="team-people-tabs" role="tablist" aria-label="People filters" data-testid="people-filters">
            <button
              type="button"
              role="tab"
              aria-selected={filter === "all"}
              className={filter === "all" ? "team-people-tab is-active" : "team-people-tab"}
              data-testid="filter-all"
              onClick={() => switchFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "pending"}
              className={filter === "pending" ? "team-people-tab is-active" : "team-people-tab"}
              data-testid="filter-pending"
              onClick={() => switchFilter("pending")}
            >
              {pendingCount ? `Pending ${pendingCount}` : "Pending"}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "active"}
              className={filter === "active" ? "team-people-tab is-active" : "team-people-tab"}
              data-testid="filter-active"
              onClick={() => switchFilter("active")}
            >
              Active
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={filter === "deactivated"}
              className={filter === "deactivated" ? "team-people-tab is-active" : "team-people-tab"}
              data-testid="filter-deactivated"
              onClick={() => switchFilter("deactivated")}
            >
              Deactivated
            </button>
          </div>
          <p className="team-people-hint">
            Team members and team roles. Create accounts under <Link to="/members">Accounts</Link>
            {" · create / switch teams in "}
            <Link to="/org/teams">All teams</Link>
          </p>
        </div>

        <div className="team-manage-selection">
          <span>
            {peopleRows.length ? `${peopleRows.length} people` : "No members"}
            {selected.size > 0 ? <span className="team-manage-selection-meta"> · selected {selected.size}</span> : null}
          </span>
        </div>

        <div className="team-manage-table-wrap">
          <table className="team-manage-table" data-testid="team-members-table">
            <thead>
              <tr>
                <th className="team-col-check">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={() => {
                      if (selected.size === peopleRows.length) setSelected(new Set());
                      else setSelected(new Set(peopleRows.map((r) => r.id)));
                    }}
                    aria-label="Select all"
                    disabled={peopleRows.length === 0}
                  />
                </th>
                <th>User</th>
                <th>Team role</th>
                <th>Account status</th>
                <th className="team-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {peopleRows.map((row) => {
                const isCreator = Boolean(row.isCreator);
                const tone = accountStatusTone(String(row.accountStatus));
                const toneClass = tone === "warn" ? "is-warn" : tone === "muted" ? "is-muted" : "is-ok";
                return (
                  <tr
                    key={row.id}
                    className={selected.has(row.id) ? "is-selected" : undefined}
                    data-status={row.accountStatus}
                  >
                    <td className="team-col-check">
                      <input
                        type="checkbox"
                        checked={selected.has(row.id)}
                        onChange={() => toggleSelect(row.id)}
                        aria-label={`Select ${row.email}`}
                      />
                    </td>
                    <td>
                      <div className="team-user-cell">
                        <TeamAvatar name={row.displayName || row.email} size={32} />
                        <div className="team-user-text">
                          <div className="console-row-title team-user-email">{row.email}</div>
                          <div className="console-row-meta team-switcher-id">
                            {row.displayName && row.displayName !== row.email
                              ? row.displayName
                              : formatTeamIdSnippet(row.id)}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      {isCreator ? (
                        <span className="team-pill">{roleLabel(row.teamRole || "creator")}</span>
                      ) : (
                        <RoleMenu
                          role={row.teamRole || "member"}
                          disabled={locked}
                          onChange={(role) => void changeRole(row.id, role)}
                        />
                      )}
                    </td>
                    <td>
                      <span className={`team-status-pill ${toneClass}`}>{row.statusLabel}</span>
                    </td>
                    <td className="team-col-actions">
                      <div className="team-row-actions">
                        {!isCreator ? (
                          <button
                            type="button"
                            className="team-icon-btn is-danger"
                            title="Remove from team"
                            aria-label="Remove from team"
                            disabled={locked}
                            data-testid={`team-remove-${row.id}`}
                            onClick={() => void removeMember(row.id)}
                          >
                            <Trash2 size={15} />
                            Remove
                          </button>
                        ) : (
                          <span className="team-action-locked">Owner</span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {peopleRows.length === 0 ? (
            <div className="console-empty">
              {loading
                ? "Loading…"
                : filter === "pending"
                  ? "No pending members on this team"
                  : filter === "deactivated"
                    ? "No deactivated members on this team"
                    : "No members yet — add from the org account pool"}
            </div>
          ) : null}
        </div>
      </div>

      {addOpen ? (
        <ConsoleModal
          title="Add to team"
          description="Prefer the org account pool. If the email has no account, a Pending org account is created and joined."
          onClose={() => setAddOpen(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => void addTeamMember()}
                disabled={!email.includes("@") || locked}
                data-testid="team-add-submit"
              >
                Add to team
              </Button>
            </>
          }
        >
          <p className="console-modal-note" data-testid="team-add-hint">
            <strong>Recommended:</strong> create accounts under Accounts first, then pick an email here to join. Org
            roles and enable/disable live on Accounts.
          </p>
          {poolCandidates.length > 0 ? (
            <Label className="field">
              <span>Pick from Accounts pool</span>
              <select
                className="console-modal-select"
                value=""
                data-testid="team-add-from-pool"
                onChange={(e) => {
                  const id = e.target.value;
                  const m = poolCandidates.find((x) => x.id === id);
                  if (m) {
                    setEmail(m.email);
                    setAddDisplayName(m.displayName || "");
                  }
                }}
              >
                <option value="">Select an account not yet on this team…</option>
                {poolCandidates.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.email}
                    {m.displayName ? ` · ${m.displayName}` : ""}
                  </option>
                ))}
              </select>
            </Label>
          ) : (
            <p className="console-row-meta">
              No unassigned accounts in the pool. Go to <Link to="/members">Accounts</Link> to add, or enter an email
              below.
            </p>
          )}
          <Label className="field">
            <span>Email</span>
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@company.com"
              data-testid="team-add-email"
              autoFocus
            />
          </Label>
          <Label className="field">
            <span>Display name (optional for new accounts)</span>
            <Input value={addDisplayName} onChange={(e) => setAddDisplayName(e.target.value)} />
          </Label>
        </ConsoleModal>
      ) : null}

      {editOpen ? (
        <ConsoleModal
          title="Edit team"
          onClose={() => setEditOpen(false)}
          footer={
            <>
              <Button variant="outline" onClick={() => setEditOpen(false)}>
                Cancel
              </Button>
              <Button onClick={() => void saveTeam()} disabled={!canSubmitCreateTeam(editName)}>
                Save
              </Button>
            </>
          }
        >
          <Label className="field">
            <span>Team name</span>
            <Input value={editName} onChange={(e) => setEditName(e.target.value)} autoFocus />
          </Label>
          {!isValidTeamName(editName) && editName.trim() ? (
            <p className="console-modal-hint">English letters, digits, dot, underscore, hyphen only (2–64).</p>
          ) : null}
          <Label className="field">
            <span>Avatar URL</span>
            <Input value={editAvatar} onChange={(e) => setEditAvatar(e.target.value)} placeholder="Optional" />
          </Label>
        </ConsoleModal>
      ) : null}

      <CreateTeamModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(created) => {
          setTeams((prev) => [...prev, created]);
          selectTeam(created.id);
          setCreateOpen(false);
        }}
      />
    </div>
  );
}

function PageTeamSwitcher(props: {
  teams: TeamRecord[];
  activeTeamId?: string;
  onSelect(teamId: string): void;
  onCreate(): void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const active = props.teams.find((t) => t.id === props.activeTeamId) || props.teams[0];

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="page-team-switcher" ref={rootRef}>
      <button
        type="button"
        className="page-team-switcher-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <TeamAvatar name={active?.name || "Team"} url={active?.avatarUrl} size={36} />
        <span className="page-team-switcher-name">{active?.name || "Select team"}</span>
        <ChevronDown size={14} className={open ? "page-team-chevron open" : "page-team-chevron"} />
      </button>
      {open ? (
        <div className="page-team-switcher-popover" role="menu">
          <div className="team-switcher-label">Switch team</div>
          <div className="team-switcher-list">
            {props.teams.length === 0 ? (
              <div className="team-switcher-empty">No teams</div>
            ) : (
              props.teams.map((t) => {
                const isActive = t.id === (props.activeTeamId || active?.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    className={`page-team-item team-switcher-item${isActive ? " is-active" : ""}`}
                    onClick={() => {
                      props.onSelect(t.id);
                      setOpen(false);
                    }}
                  >
                    <TeamAvatar name={t.name} url={t.avatarUrl} size={32} />
                    <div className="team-switcher-item-text">
                      <div className="page-team-item-title">
                        <span className="team-switcher-name" title={t.name}>
                          {t.name}
                        </span>
                      </div>
                      <div className="console-row-meta team-switcher-id" title={t.id}>
                        {formatTeamIdSnippet(t.id)}
                      </div>
                    </div>
                    {isActive ? <Check size={16} className="team-switcher-check" aria-hidden /> : null}
                  </button>
                );
              })
            )}
          </div>
          <div className="team-switcher-divider" />
          <button
            type="button"
            className="team-switcher-menu-btn"
            onClick={() => {
              setOpen(false);
              props.onCreate();
            }}
          >
            <Plus size={14} /> Create team
          </button>
        </div>
      ) : null}
    </div>
  );
}

function RoleMenu(props: { role: string; disabled?: boolean; onChange(role: string): void }): ReactNode {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="team-role-menu" ref={rootRef}>
      <button
        type="button"
        className="team-role-trigger"
        disabled={props.disabled}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {roleLabel(props.role)}
        <ChevronDown size={12} />
      </button>
      {open ? (
        <div className="team-role-popover" role="menu">
          {TEAM_ASSIGNABLE_ROLES.map((opt) => {
            const active = props.role === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                role="menuitem"
                className={active ? "team-role-item is-active" : "team-role-item"}
                onClick={() => {
                  setOpen(false);
                  if (!active) props.onChange(opt.id);
                }}
              >
                <span>{opt.label}</span>
                {active ? <Check size={14} /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function CreateTeamModal(props: {
  open: boolean;
  onClose(): void;
  onCreated(team: TeamRecord): void;
}): ReactNode {
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!props.open) return null;

  const canSubmit = canSubmitCreateTeam(name);

  async function create(): Promise<void> {
    if (!canSubmitCreateTeam(name)) return;
    setError(null);
    setLoading(true);
    try {
      const res = await apiPost<{ team: TeamRecord }>(
        "/api/teams",
        { name: name.trim(), avatarUrl: avatarUrl || undefined },
        memberAuthHeaders(),
      );
      props.onCreated(res.team);
      setName("");
      setAvatarUrl("");
      props.onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Create failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <ConsoleModal
      title="Create team"
      description="After creating, invite members and let them use team-authorized app connections."
      onClose={props.onClose}
      footer={
        <>
          <Button variant="outline" onClick={props.onClose}>
            Cancel
          </Button>
          <Button disabled={loading || !canSubmit} onClick={() => void create()}>
            Create
          </Button>
        </>
      }
    >
      <Label className="field">
        <span>Team name</span>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my_team"
          autoFocus
          aria-invalid={name.trim().length > 0 && !isValidTeamName(name)}
        />
      </Label>
      <p className="console-modal-hint">English letters, digits, dot, underscore, hyphen only.</p>
      <Label className="field">
        <span>Avatar URL</span>
        <Input value={avatarUrl} onChange={(e) => setAvatarUrl(e.target.value)} placeholder="Optional" />
      </Label>
      {error ? <InlineError message={error} /> : null}
    </ConsoleModal>
  );
}

/**
 * Team name trigger only — OOMOL: click name/↕ opens team list.
 * Settings gear is a sibling in the parent footer (not part of this dropdown).
 */
export function TeamSwitcher(props: {
  teams: TeamRecord[];
  activeTeamId?: string;
  /** Show「Company-wide」for org-admin / auditor. */
  showAllTeams?: boolean;
  onSelect(teamId: string): void;
  onCreate(): void;
  onManage(): void;
}): ReactNode {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const isAll = props.activeTeamId === ALL_TEAMS_ID;
  const active = isAll ? undefined : props.teams.find((t) => t.id === props.activeTeamId) || props.teams[0];
  const triggerName = isAll ? "Company-wide" : active?.name || "Select team";

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent): void {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="team-switcher" ref={rootRef}>
      <button
        type="button"
        className={`team-switcher-trigger${open ? " is-open" : ""}`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <TeamAvatar name={triggerName} url={isAll ? undefined : active?.avatarUrl} size={28} />
        <div className="team-switcher-label-block">
          <div className="team-switcher-name">{triggerName}</div>
          {isAll ? <div className="team-switcher-sub">Org-wide view</div> : null}
        </div>
        <ChevronsUpDown size={14} className="team-switcher-chevron" aria-hidden />
      </button>

      {open ? (
        <div className="team-switcher-popover" role="menu">
          <div className="team-switcher-label">Switch team</div>
          <div className="team-switcher-list">
            {props.showAllTeams ? (
              <button
                type="button"
                role="menuitem"
                className={`team-switcher-item${isAll ? " is-active" : ""}`}
                data-testid="team-switcher-all"
                onClick={() => {
                  props.onSelect(ALL_TEAMS_ID);
                  setOpen(false);
                }}
              >
                <TeamAvatar name="Company-wide" size={32} />
                <div className="team-switcher-item-text">
                  <div className="page-team-item-title">
                    <div className="team-switcher-name">Company-wide</div>
                  </div>
                  <div className="console-row-meta">Org admin / auditor view</div>
                </div>
                {isAll ? <Check size={16} className="team-switcher-check" aria-hidden /> : null}
              </button>
            ) : null}
            {props.teams.length === 0 ? (
              <div className="team-switcher-empty">No teams yet — create one below</div>
            ) : (
              props.teams.map((t) => {
                const isActive = !isAll && t.id === (props.activeTeamId || active?.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    role="menuitem"
                    className={`team-switcher-item${isActive ? " is-active" : ""}`}
                    onClick={() => {
                      props.onSelect(t.id);
                      setOpen(false);
                    }}
                  >
                    <TeamAvatar name={t.name} url={t.avatarUrl} size={32} />
                    <div className="team-switcher-item-text">
                      <div className="page-team-item-title">
                        <div className="team-switcher-name" title={t.name}>
                          {t.name}
                        </div>
                      </div>
                      <div className="console-row-meta team-switcher-id" title={t.id}>
                        {formatTeamIdSnippet(t.id)}
                      </div>
                    </div>
                    {isActive ? <Check size={16} className="team-switcher-check" aria-hidden /> : null}
                  </button>
                );
              })
            )}
          </div>
          <div className="team-switcher-divider" />
          <div className="team-switcher-actions">
            <button
              type="button"
              className="team-switcher-menu-btn"
              onClick={() => {
                setOpen(false);
                props.onCreate();
              }}
            >
              <Plus size={14} strokeWidth={2} /> Create team
            </button>
            <button
              type="button"
              className="team-switcher-menu-btn"
              onClick={() => {
                setOpen(false);
                props.onManage();
              }}
            >
              <Users size={14} strokeWidth={2} /> Manage
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function TeamAvatar(props: { name: string; url?: string; size?: number }): ReactNode {
  const size = props.size ?? 32;
  if (props.url) {
    return (
      <img
        src={props.url}
        alt=""
        width={size}
        height={size}
        className="team-avatar-img"
        style={{
          width: size,
          height: size,
          borderRadius: 999,
          objectFit: "cover",
          background: "var(--muted)",
          flexShrink: 0,
        }}
      />
    );
  }
  const hue = hashHue(props.name || "?");
  const isCompanyWide = props.name === "Company-wide";
  return (
    <div
      aria-hidden
      className="team-avatar-fallback"
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        background: isCompanyWide
          ? `color-mix(in oklab, hsl(262 48% 54%) 62%, var(--muted))`
          : `color-mix(in oklab, hsl(${hue} 52% 50%) 58%, var(--muted))`,
        display: "grid",
        placeItems: "center",
        fontSize: Math.max(11, Math.round(size * 0.36)),
        fontWeight: 650,
        color: "var(--foreground)",
        flexShrink: 0,
        letterSpacing: "-0.02em",
      }}
    >
      {(props.name || "?").slice(0, 1).toUpperCase()}
    </div>
  );
}

function hashHue(value: string): number {
  let h = 0;
  for (let i = 0; i < value.length; i += 1) h = (h * 31 + value.charCodeAt(i)) % 360;
  return h;
}
