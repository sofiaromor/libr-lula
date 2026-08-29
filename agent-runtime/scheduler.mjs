const ACTIVE_STATUSES = new Set(["running", "validation_failed"]);

function taskId(task) {
  const id = String(task?.id ?? "").trim();
  if (!id) throw new Error("task id is required");
  return id;
}

function normalizeScopePath(value) {
  let path = String(value ?? "").trim().replaceAll("\\", "/");
  if (!path) throw new Error("task scope entries must be non-empty");
  path = path.replace(/^\.\//u, "").replace(/\/+$/u, "");
  if (
    !path ||
    path.startsWith("/") ||
    /^[A-Za-z]:\//u.test(path) ||
    path.split("/").some((segment) => segment === "..")
  ) {
    throw new Error(`task scope must stay repository-relative: ${value}`);
  }
  return path;
}

export function normalizeTaskScope(task) {
  if (!Array.isArray(task?.scope)) {
    throw new Error(`task ${taskId(task)} scope must be an array`);
  }
  return [...new Set(task.scope.map(normalizeScopePath))].sort();
}

export function scopesConflict(left, right) {
  for (const a of left) {
    for (const b of right) {
      if (a === b || a.startsWith(`${b}/`) || b.startsWith(`${a}/`)) {
        return true;
      }
    }
  }
  return false;
}

function sortTasks(tasks) {
  return [...tasks].sort((left, right) => {
    const leftTime = Date.parse(left?.created_at ?? "");
    const rightTime = Date.parse(right?.created_at ?? "");
    const leftValid = Number.isFinite(leftTime);
    const rightValid = Number.isFinite(rightTime);
    if (leftValid && rightValid && leftTime !== rightTime) {
      return leftTime - rightTime;
    }
    if (leftValid !== rightValid) return leftValid ? -1 : 1;
    return taskId(left).localeCompare(taskId(right));
  });
}

function normalizedMaxParallel(value) {
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > 16) {
    throw new Error("maxParallel must be an integer between 1 and 16");
  }
  return count;
}

export function planAgentSchedule(tasks, { maxParallel = 2 } = {}) {
  if (!Array.isArray(tasks)) throw new Error("tasks must be an array");
  const limit = normalizedMaxParallel(maxParallel);
  const active = sortTasks(
    tasks.filter((task) => ACTIVE_STATUSES.has(task?.status)),
  );
  const queued = sortTasks(tasks.filter((task) => task?.status === "queued"));

  const activeScopes = active.map((task) => ({
    id: taskId(task),
    scope: normalizeTaskScope(task),
  }));
  const unknownActive = activeScopes
    .filter((item) => item.scope.length === 0)
    .map((item) => item.id);
  const availableSlots = Math.max(0, limit - active.length);
  const selected = [];
  const selectedScopes = [];
  const deferred = [];

  for (const task of queued) {
    const id = taskId(task);
    const risk = String(task?.risk ?? "").trim().toLowerCase();
    const scope = normalizeTaskScope(task);

    if (risk === "high") {
      deferred.push({ id, reason: "requires_human_approval" });
      continue;
    }
    if (!new Set(["low", "medium"]).has(risk)) {
      deferred.push({ id, reason: "unsupported_risk" });
      continue;
    }
    if (scope.length === 0) {
      deferred.push({ id, reason: "scope_required" });
      continue;
    }
    if (unknownActive.length > 0) {
      deferred.push({
        id,
        reason: "unknown_active_scope",
        conflictsWith: [...unknownActive],
      });
      continue;
    }

    const activeConflicts = activeScopes
      .filter((item) => scopesConflict(scope, item.scope))
      .map((item) => item.id);
    const selectedConflicts = selectedScopes
      .filter((item) => scopesConflict(scope, item.scope))
      .map((item) => item.id);
    const conflictsWith = [...activeConflicts, ...selectedConflicts];

    if (conflictsWith.length > 0) {
      deferred.push({ id, reason: "scope_conflict", conflictsWith });
      continue;
    }
    if (selected.length >= availableSlots) {
      deferred.push({ id, reason: "capacity" });
      continue;
    }

    selected.push(id);
    selectedScopes.push({ id, scope });
  }

  return {
    maxParallel: limit,
    active: active.map((task) => taskId(task)),
    availableSlots,
    start: selected,
    deferred,
  };
}

export function schedulerAuditEvents(plan) {
  if (!plan || typeof plan !== "object" || !Array.isArray(plan.start)) {
    throw new Error("scheduler plan is required");
  }
  return plan.start.map((id) => ({
    type: "scheduler.task.selected",
    taskId: taskId({ id }),
    details: {
      maxParallel: plan.maxParallel,
      activeCount: Array.isArray(plan.active) ? plan.active.length : 0,
    },
  }));
}
