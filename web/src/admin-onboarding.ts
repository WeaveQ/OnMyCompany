export interface OnboardingStepInput {
  memberCount: number;
  teamReady: boolean;
  connectionCount: number;
  skillCount: number;
  hasPolicy: boolean;
  modelRouterOk: boolean | null;
  modelRouterDashboardUrl: string;
  runtimeTokenCount: number;
}

export interface OnboardingStep {
  id: string;
  title: string;
  hint: string;
  done: boolean;
  to?: string;
  href?: string;
  external?: boolean;
}

/** Admin first-run list. Model step is Omni probe only — not a model catalog. */
export function buildAdminOnboardingChecklist(input: OnboardingStepInput): OnboardingStep[] {
  const dashboard = input.modelRouterDashboardUrl || "http://127.0.0.1:20128/dashboard";
  return [
    {
      id: "members",
      title: "Company accounts",
      hint: "Add people on the roster",
      done: input.memberCount > 0,
      to: "/members",
    },
    {
      id: "teams",
      title: "Teams",
      hint: "Create or open a team",
      done: input.teamReady,
      to: "/org/teams",
    },
    {
      id: "connections",
      title: "Connectors",
      hint: "Share office connections",
      done: input.connectionCount > 0,
      to: "/connections",
    },
    {
      id: "skills",
      title: "Skills",
      hint: "Attach org skill packages",
      done: input.skillCount > 0,
      to: "/skills",
    },
    {
      id: "policy",
      title: "Egress policy",
      hint: "Allow / block Gateway actions",
      done: input.hasPolicy,
      to: "/org-config",
    },
    {
      id: "model-router",
      title: "Model router (OmniRoute)",
      hint: "Probe only — keys stay in Omni",
      done: input.modelRouterOk === true,
      href: dashboard,
      external: true,
    },
    {
      id: "runtime-token",
      title: "Runtime token",
      hint: "Mint a member-bound API key",
      done: input.runtimeTokenCount > 0,
      to: "/access",
    },
  ];
}
