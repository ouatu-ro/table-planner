import { clamp } from "./utils";
import type {
  Conflict,
  DerivedGroupView,
  DerivedTableView,
  Guest,
  Group,
  Id,
  Issue,
  PlannerEvent,
  PlannerState,
  Policy,
} from "./types";

export const defaultPolicy: Policy = {
  tableCapacity: "blocked",
  incompatibleGuests: "warning",
  groupSplit: "blocked",
  duplicateNames: "warning",
};

export function createEmptyState(): PlannerState {
  return {
    guests: {},
    groups: {},
    tables: {},
    assignments: {},
  };
}

export function applyEvent(state: PlannerState, event: PlannerEvent): PlannerState {
  const next = {
    guests: { ...state.guests },
    groups: { ...state.groups },
    tables: { ...state.tables },
    assignments: { ...state.assignments },
  };

  switch (event.type) {
    case "GuestsAdded": {
      next.groups[event.group.id] = {
        id: event.group.id,
        name: event.group.name,
        guestIds: event.guests.map((guest) => guest.id),
        notes: "",
        mustSitWith: [],
        mustNotSitWith: [],
      };
      for (const guest of event.guests) {
        next.guests[guest.id] = {
          id: guest.id,
          name: guest.name,
          kind: guest.kind,
          notes: guest.notes,
          groupId: event.group.id,
        };
      }
      next.assignments[event.group.id] = null;
      return next;
    }
    case "GroupRenamed":
      if (next.groups[event.groupId]) next.groups[event.groupId] = { ...next.groups[event.groupId], name: event.name };
      return next;
    case "GroupNotesUpdated":
      if (next.groups[event.groupId]) next.groups[event.groupId] = { ...next.groups[event.groupId], notes: event.notes };
      return next;
    case "GuestUpdated":
      if (next.guests[event.guestId]) {
        next.guests[event.guestId] = {
          ...next.guests[event.guestId],
          ...(event.name ? { name: event.name } : null),
          ...(event.kind ? { kind: event.kind } : null),
          ...(typeof event.notes === "string" ? { notes: event.notes } : null),
        };
      }
      return next;
    case "TableCreated":
      next.tables[event.table.id] = event.table;
      return next;
    case "TableRenamed":
      if (next.tables[event.tableId]) next.tables[event.tableId] = { ...next.tables[event.tableId], name: event.name };
      return next;
    case "TableCapacitySet":
      if (next.tables[event.tableId]) {
        next.tables[event.tableId] = { ...next.tables[event.tableId], capacity: clamp(event.capacity, 1, 200) };
      }
      return next;
    case "TableMoved":
      if (next.tables[event.tableId]) next.tables[event.tableId] = { ...next.tables[event.tableId], position: event.position, zIndex: event.zIndex };
      return next;
    case "GroupSeated":
      next.assignments[event.groupId] = event.tableId;
      return next;
    case "GroupUnseated":
      next.assignments[event.groupId] = null;
      return next;
    case "ConstraintAdded":
    case "ConstraintRemoved": {
      const group = next.groups[event.groupId];
      if (!group) return next;
      const current = new Set(event.relation === "mustSitWith" ? group.mustSitWith : group.mustNotSitWith);
      if (event.type === "ConstraintAdded") current.add(event.targetGroupId);
      else current.delete(event.targetGroupId);
      const updated = [...current];
      next.groups[event.groupId] =
        event.relation === "mustSitWith"
          ? { ...group, mustSitWith: updated }
          : { ...group, mustNotSitWith: updated };
      return next;
    }
    case "PolicyChanged":
      return next;
    default:
      return next;
  }
}

export function replay(events: PlannerEvent[]): PlannerState {
  return events.reduce(applyEvent, createEmptyState());
}

export function deriveGroupViews(state: PlannerState, conflicts: Conflict[]): DerivedGroupView[] {
  const conflictsByGroup = new Map<Id, number>();
  for (const conflict of conflicts) {
    for (const groupId of conflict.groupIds) {
      conflictsByGroup.set(groupId, (conflictsByGroup.get(groupId) || 0) + 1);
    }
  }
  return Object.values(state.groups)
    .map((group) => {
      const guests = group.guestIds.map((id) => state.guests[id]).filter(Boolean);
      const tableId = state.assignments[group.id] ?? null;
      const conflictCount = conflictsByGroup.get(group.id) || 0;
      return {
        group,
        guests,
        tableId,
        seatCount: guests.length,
        conflictCount,
        status: conflictCount > 0 ? "warning" : "ok",
      } satisfies DerivedGroupView;
    })
    .sort((a, b) => a.group.name.localeCompare(b.group.name));
}

export function deriveTableViews(state: PlannerState, conflicts: Conflict[]): DerivedTableView[] {
  const conflictsByTable = new Map<Id, number>();
  for (const conflict of conflicts) {
    for (const tableId of conflict.tableIds) {
      conflictsByTable.set(tableId, (conflictsByTable.get(tableId) || 0) + 1);
    }
  }

  return Object.values(state.tables)
    .map((table) => {
      const groups = Object.values(state.groups)
        .filter((group) => state.assignments[group.id] === table.id)
        .map((group) => {
          const guests = group.guestIds.map((id) => state.guests[id]).filter(Boolean);
          const tableId = state.assignments[group.id] ?? null;
          return {
            group,
            guests,
            tableId,
            seatCount: guests.length,
            conflictCount: conflictsByTable.get(table.id) || 0,
            status: (conflictsByTable.get(table.id) || 0) > 0 ? "warning" : "ok",
          } satisfies DerivedGroupView;
        });
      const used = groups.reduce((sum, group) => sum + group.seatCount, 0);
      const conflictCount = conflictsByTable.get(table.id) || 0;
      return {
        table,
        groups,
        used,
        remaining: table.capacity - used,
        conflictCount,
        status: used > table.capacity ? "blocked" : conflictCount > 0 ? "warning" : "ok",
      } satisfies DerivedTableView;
    })
    .sort((a, b) => a.table.name.localeCompare(b.table.name));
}

export function deriveIssues(state: PlannerState, policy: Policy): Issue[] {
  const issues: Issue[] = [];
  const groups = Object.values(state.groups);
  const tables = Object.values(state.tables);

  for (const group of groups) {
    const tableId = state.assignments[group.id];
    if (!tableId) continue;
    const table = state.tables[tableId];
    if (!table) continue;
    const used = Object.values(state.groups)
      .filter((candidate) => state.assignments[candidate.id] === table.id)
      .reduce((sum, candidate) => sum + candidate.guestIds.length, 0);
    if (used > table.capacity) {
      const severity = severityFromMode(policy.tableCapacity);
      if (!severity) continue;
      issues.push({
        code: "table-capacity",
        severity,
        message: `${table.name} is over capacity.`,
        entityIds: [table.id, group.id],
      });
    }
  }

  for (const group of groups) {
    for (const otherId of group.mustSitWith) {
      const other = state.groups[otherId];
      if (!other) continue;
      if (state.assignments[group.id] && state.assignments[other.id] && state.assignments[group.id] !== state.assignments[other.id]) {
        const severity = severityFromMode(policy.incompatibleGuests);
        if (!severity) continue;
        issues.push({
          code: "incompatible-guests",
          severity,
          message: `${group.name} must sit with ${other.name}.`,
          entityIds: [group.id, other.id],
        });
      }
    }
    for (const otherId of group.mustNotSitWith) {
      const other = state.groups[otherId];
      if (!other) continue;
      if (state.assignments[group.id] && state.assignments[other.id] && state.assignments[group.id] === state.assignments[other.id]) {
        const severity = severityFromMode(policy.incompatibleGuests);
        if (!severity) continue;
        issues.push({
          code: "incompatible-guests",
          severity,
          message: `${group.name} must be kept apart from ${other.name}.`,
          entityIds: [group.id, other.id],
        });
      }
    }
  }

  for (const table of tables) {
    const seated = groups.filter((group) => state.assignments[group.id] === table.id);
    const used = seated.reduce((sum, group) => sum + group.guestIds.length, 0);
    if (used > table.capacity) {
      const severity = severityFromMode(policy.tableCapacity);
      if (!severity) continue;
      issues.push({
        code: "table-capacity",
        severity,
        message: `${table.name} is over capacity.`,
        entityIds: [table.id],
      });
    }
  }

  return issues;
}

function severityFromMode(mode: Policy["tableCapacity"]): Issue["severity"] | null {
  if (mode === "ignore") return null;
  return mode === "blocked" ? "blocked" : "warning";
}
