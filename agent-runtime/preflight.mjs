export function evaluateAgentPreflight({
  branch,
  dirty,
  nodeMajor,
  requiredFiles = [],
  allowNonAgentBranch = false,
}) {
  const checks = [];

  const normalizedBranch = String(branch ?? "").trim();
  checks.push({
    name: "branch-present",
    ok: Boolean(normalizedBranch),
    detail: normalizedBranch || "No current branch detected",
  });

  checks.push({
    name: "not-main",
    ok: normalizedBranch !== "main",
    detail: normalizedBranch === "main" ? "Agents must never work on main" : normalizedBranch,
  });

  const agentBranchOk = allowNonAgentBranch || normalizedBranch.startsWith("agent/");
  checks.push({
    name: "agent-branch",
    ok: agentBranchOk,
    detail: agentBranchOk
      ? normalizedBranch
      : "Agent runtime work requires an agent/* task branch",
  });

  checks.push({
    name: "working-tree-clean",
    ok: !dirty,
    detail: dirty ? "Working tree has uncommitted changes" : "clean",
  });

  const major = Number(nodeMajor);
  checks.push({
    name: "node-version",
    ok: Number.isInteger(major) && major >= 24,
    detail: Number.isInteger(major) ? `Node ${major}` : "Node version unavailable",
  });

  for (const file of requiredFiles) {
    checks.push({
      name: `required:${file.path}`,
      ok: Boolean(file.exists),
      detail: file.exists ? "present" : "missing",
    });
  }

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}
