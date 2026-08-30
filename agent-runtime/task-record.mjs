const STATUSES = [
  "queued",
  "running",
  "blocked",
  "validation_failed",
  "review_ready",
  "changes_requested",
  "approved",
  "done",
  "cancelled",
];

const RISKS = ["low", "medium", "high"];

const TRANSITIONS = new Map([
  ["queued", new Set(["running", "cancelled"])],
  ["running", new Set(["blocked", "validation_failed", "review_ready", "cancelled"])],
  ["blocked", new Set(["running", "cancelled"])],
  ["validation_failed", new Set(["running", "cancelled"])],
  ["review_ready", new Set(["changes_requested", "approved", "cancelled"])],
  ["changes_requested", new Set(["running", "cancelled"])],
  ["approved", new Set(["done", "cancelled"])],
  ["done", new Set()],
  ["cancelled", new Set()],
]);

function nonEmpty(value, field) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function stringList(value, field) {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value.map((item) => nonEmpty(item, field));
}

function slug(value) {
  return nonEmpty(value, "title")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48) || "task";
}

function iso(now) {
  const date = now instanceof Date ? now : new Date(now ?? Date.now());
  if (Number.isNaN(date.getTime())) throw new Error("Invalid timestamp");
  return date.toISOString();
}

export const AGENT_TASK_STATUSES = Object.freeze([...STATUSES]);
export const AGENT_TASK_RISKS = Object.freeze([...RISKS]);

export function createTaskRecord(input, now = new Date()) {
  const id = nonEmpty(input?.id, "id");
  const title = nonEmpty(input?.title, "title");
  const risk = String(input?.risk ?? "low").trim().toLowerCase();

  if (!RISKS.includes(risk)) {
    throw new Error(`risk must be one of: ${RISKS.join(", ")}`);
  }

  const timestamp = iso(now);
  const branch = input?.branch
    ? nonEmpty(input.branch, "branch")
    : `agent/${id}-${slug(title)}`;

  if (!branch.startsWith("agent/")) {
    throw new Error("Agent task branches must start with agent/");
  }

  return {
    id,
    title,
    status: "queued",
    risk,
    requested_by: String(input?.requested_by ?? "human").trim() || "human",
    branch,
    worktree: input?.worktree
      ? nonEmpty(input.worktree, "worktree")
      : `.agent/worktrees/${id}`,
    scope: stringList(input?.scope ?? [], "scope"),
    acceptance_criteria: stringList(
      input?.acceptance_criteria ?? [],
      "acceptance_criteria",
    ),
    files_changed: [],
    validation: {
      command: "npm --prefix frontend run validate",
      status: "pending",
    },
    commit_sha: null,
    pull_request: null,
    blockers: [],
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export function markTaskValidation(record, status, now = new Date()) {
  if (!record || typeof record !== "object") throw new Error("record is required");
  if (!new Set(["pending", "passed", "failed"]).has(status)) {
    throw new Error("validation status must be pending, passed, or failed");
  }

  const nextStatus = status === "failed" ? "validation_failed" : record.status;

  if (status === "failed" && record.status !== "running") {
    throw new Error("Validation can fail only while a task is running");
  }

  return {
    ...record,
    status: nextStatus,
    validation: {
      ...record.validation,
      status,
    },
    updated_at: iso(now),
  };
}

export function transitionTask(record, nextStatus, options = {}) {
  if (!record || typeof record !== "object") throw new Error("record is required");
  if (!STATUSES.includes(record.status)) throw new Error(`Unknown current status: ${record.status}`);
  if (!STATUSES.includes(nextStatus)) throw new Error(`Unknown next status: ${nextStatus}`);

  const allowed = TRANSITIONS.get(record.status);
  if (!allowed.has(nextStatus)) {
    throw new Error(`Invalid task transition: ${record.status} -> ${nextStatus}`);
  }

  if (nextStatus === "review_ready" && record.validation?.status !== "passed") {
    throw new Error("A task cannot become review_ready until validation passes");
  }

  let blockers = Array.isArray(record.blockers) ? [...record.blockers] : [];
  if (nextStatus === "blocked") {
    blockers = [nonEmpty(options.blocker, "blocker")];
  } else if (nextStatus === "running") {
    blockers = [];
  }

  return {
    ...record,
    status: nextStatus,
    blockers,
    updated_at: iso(options.now ?? new Date()),
  };
}
