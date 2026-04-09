import type { Conflict, PlannerState, Policy } from "./types";

export function detectConflicts(state: PlannerState, policy: Policy): Conflict[] {
  const conflicts: Conflict[] = [];
  const groups = Object.values(state.groups);

  for (const group of groups) {
    const tableId = state.assignments[group.id];
    for (const targetId of group.mustSitWith) {
      const target = state.groups[targetId];
      if (!target) continue;
      const targetTableId = state.assignments[target.id];
      if (tableId && targetTableId && tableId !== targetTableId) {
        conflicts.push({
          code: "incompatible-guests",
          severity: policy.incompatibleGuests === "blocked" ? "blocked" : "warning",
          message: `${group.name} must sit with ${target.name}.`,
          groupIds: [group.id, target.id],
          tableIds: [tableId, targetTableId],
        });
      }
    }
    for (const targetId of group.mustNotSitWith) {
      const target = state.groups[targetId];
      if (!target) continue;
      const targetTableId = state.assignments[target.id];
      if (tableId && targetTableId && tableId === targetTableId) {
        conflicts.push({
          code: "incompatible-guests",
          severity: policy.incompatibleGuests === "blocked" ? "blocked" : "warning",
          message: `${group.name} must be kept apart from ${target.name}.`,
          groupIds: [group.id, target.id],
          tableIds: [tableId],
        });
      }
    }
  }

  for (const group of groups) {
    if (!state.assignments[group.id]) continue;
    const sameTableGroups = groups.filter((candidate) => state.assignments[candidate.id] === state.assignments[group.id]);
    const linked = new Set([group.id, ...group.mustSitWith]);
    const split = group.mustSitWith.some((otherId) => state.assignments[otherId] !== state.assignments[group.id]);
    if (split) {
      conflicts.push({
        code: "group-split",
        severity: policy.groupSplit === "blocked" ? "blocked" : "warning",
        message: `${group.name} is split from a must-sit-with group.`,
        groupIds: [group.id, ...group.mustSitWith],
        tableIds: state.assignments[group.id] ? [state.assignments[group.id]!] : [],
      });
    }
    if (sameTableGroups.length && sameTableGroups.reduce((sum, candidate) => sum + candidate.guestIds.length, 0) > 0) {
      // intentional no-op: table occupancy derived elsewhere
    }
  }

  for (const table of Object.values(state.tables)) {
    const used = groups
      .filter((group) => state.assignments[group.id] === table.id)
      .reduce((sum, group) => sum + group.guestIds.length, 0);
    if (used > table.capacity) {
      conflicts.push({
        code: "table-capacity",
        severity: policy.tableCapacity === "blocked" ? "blocked" : "warning",
        message: `${table.name} is over capacity.`,
        groupIds: [],
        tableIds: [table.id],
      });
    }
  }

  return dedupe(conflicts);
}

function dedupe(conflicts: Conflict[]): Conflict[] {
  const seen = new Set<string>();
  return conflicts.filter((conflict) => {
    const key = `${conflict.code}:${conflict.message}:${conflict.groupIds.join(",")}:${conflict.tableIds.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
