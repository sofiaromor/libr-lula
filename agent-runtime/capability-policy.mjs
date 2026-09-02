const ROLES = [
  "planner",
  "implementer",
  "tester",
  "reviewer",
  "security",
  "researcher",
];

const CAPABILITIES = [
  "repository.read",
  "task.plan",
  "worktree.write",
  "command.run_approved",
  "audit.read",
  "model.infer_local",
  "web.read",
  "git.commit_task_branch",
  "git.push_task_branch",
  "pull_request.open",
  "pull_request.comment",
  "security.report",
];

const PROHIBITED_CAPABILITIES = [
  "main.write",
  "main.merge",
  "git.force_push",
  "git.history_rewrite",
  "git.remote_branch_delete",
  "secrets.read",
  "production.destructive",
  "repository.admin",
  "browser.write",
];

const ROLE_CAPABILITIES = Object.freeze({
  planner: Object.freeze([
    "repository.read",
    "task.plan",
    "audit.read",
    "model.infer_local",
    "web.read",
  ]),
  implementer: Object.freeze([
    "repository.read",
    "worktree.write",
    "command.run_approved",
    "audit.read",
    "model.infer_local",
    "git.commit_task_branch",
    "git.push_task_branch",
    "pull_request.open",
  ]),
  tester: Object.freeze([
    "repository.read",
    "command.run_approved",
    "audit.read",
    "model.infer_local",
  ]),
  reviewer: Object.freeze([
    "repository.read",
    "command.run_approved",
    "audit.read",
    "model.infer_local",
    "pull_request.comment",
  ]),
  security: Object.freeze([
    "repository.read",
    "command.run_approved",
    "audit.read",
    "model.infer_local",
    "pull_request.comment",
    "security.report",
  ]),
  researcher: Object.freeze([
    "repository.read",
    "audit.read",
    "model.infer_local",
    "web.read",
  ]),
});

const ROLE_SET = new Set(ROLES);
const CAPABILITY_SET = new Set(CAPABILITIES);
const PROHIBITED_SET = new Set(PROHIBITED_CAPABILITIES);
const ROLE_CAPABILITY_SETS = new Map(
  Object.entries(ROLE_CAPABILITIES).map(([role, capabilities]) => [
    role,
    new Set(capabilities),
  ]),
);

function normalize(value) {
  return String(value ?? "").trim();
}

export const AGENT_ROLES = Object.freeze([...ROLES]);
export const AGENT_CAPABILITIES = Object.freeze([...CAPABILITIES]);
export const AGENT_PROHIBITED_CAPABILITIES = Object.freeze([
  ...PROHIBITED_CAPABILITIES,
]);
export const AGENT_ROLE_CAPABILITIES = ROLE_CAPABILITIES;

export function getRoleCapabilities(role) {
  const normalizedRole = normalize(role);
  if (!ROLE_SET.has(normalizedRole)) return Object.freeze([]);
  return Object.freeze([...ROLE_CAPABILITIES[normalizedRole]]);
}

export function isProhibitedCapability(capability) {
  return PROHIBITED_SET.has(normalize(capability));
}

export function evaluateAgentCapability(role, capability) {
  const normalizedRole = normalize(role);
  const normalizedCapability = normalize(capability);

  if (!ROLE_SET.has(normalizedRole)) {
    return Object.freeze({ allowed: false, reason: "unknown_role" });
  }

  if (PROHIBITED_SET.has(normalizedCapability)) {
    return Object.freeze({ allowed: false, reason: "prohibited" });
  }

  if (!CAPABILITY_SET.has(normalizedCapability)) {
    return Object.freeze({ allowed: false, reason: "unknown_capability" });
  }

  if (!ROLE_CAPABILITY_SETS.get(normalizedRole).has(normalizedCapability)) {
    return Object.freeze({ allowed: false, reason: "role_not_permitted" });
  }

  return Object.freeze({ allowed: true, reason: "allowed" });
}

export function canAgentRequestCapability(role, capability) {
  return evaluateAgentCapability(role, capability).allowed;
}

export function assertAgentCanRequestCapability(role, capability) {
  const decision = evaluateAgentCapability(role, capability);
  if (!decision.allowed) {
    throw new Error(
      `Agent capability denied: ${normalize(role) || "<empty-role>"} -> ${normalize(capability) || "<empty-capability>"} (${decision.reason})`,
    );
  }
  return true;
}
