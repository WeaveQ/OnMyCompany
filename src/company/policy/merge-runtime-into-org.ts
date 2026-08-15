/**
 * Access console writes runtime allow/block into OrgConfig policy.
 * putSection replaces policy.json wholesale — always spread the current document.
 */
export function mergeRuntimeRulesIntoOrgPolicy(
  existing: Record<string, unknown> | undefined,
  runtime: { allowedActions?: string[]; blockedActions?: string[] },
): Record<string, unknown> {
  const prev = existing && typeof existing === "object" && !Array.isArray(existing) ? { ...existing } : {};
  return {
    ...prev,
    allowedActions: runtime.allowedActions ?? prev.allowedActions,
    blockedActions: runtime.blockedActions ?? prev.blockedActions,
  };
}
