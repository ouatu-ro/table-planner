import { createId, normalizeWhitespace, splitNames, titleCaseName } from "./utils";
import { applyEvent, deriveIssues } from "./reducer";
import type {
  CommandResult,
  GuestKind,
  PlannerCommand,
  PlannerDocument,
  PlannerEvent,
  PlannerState,
  Policy,
  TablePosition,
} from "./types";

const defaultKinds: GuestKind = "adult";

function makeEvent<T extends Omit<PlannerEvent, "id" | "at">>(event: T): PlannerEvent {
  return {
    id: createId("event"),
    at: Date.now(),
    ...event,
  } as unknown as PlannerEvent;
}

function addGuestsEvents(command: Extract<PlannerCommand, { type: "addGuests" }>): PlannerEvent[] {
  const names = splitNames(command.names).map((name) => titleCaseName(name)).filter(Boolean);
  if (!names.length) return [];
  const groupId = createId("group");
  const groupName = normalizeWhitespace(command.groupName || names.join(" & "));
  return [
    makeEvent({
      type: "GuestsAdded",
      group: { id: groupId, name: groupName },
      guests: names.map((name) => ({
        id: createId("guest"),
        name,
        kind: command.kind ?? defaultKinds,
        notes: command.notes ?? "",
      })),
    }),
  ];
}

function createTableEvent(command: Extract<PlannerCommand, { type: "createTable" }>, zIndex: number): PlannerEvent[] {
  return [
    makeEvent({
      type: "TableCreated",
      table: {
        id: createId("table"),
        name: titleCaseName(command.name || "Table"),
        capacity: Number.isFinite(command.capacity ?? NaN) ? Math.max(1, Math.floor(command.capacity!)) : 10,
        position: command.position ?? { left: 24, top: 24 },
        zIndex,
      },
    }),
  ];
}

export function executeCommand(state: PlannerState, document: PlannerDocument, command: PlannerCommand): CommandResult {
  switch (command.type) {
    case "addGuests": {
      const events = addGuestsEvents(command);
      if (!events.length) {
        return { status: "blocked", applied: false, events: [], issues: [], message: "No guest names were provided." };
      }
      const next = replayWithEvents(state, events);
      const issues = deriveIssues(next, document.policy);
      return resultFromIssues(events, issues, document.policy, "Guests added.");
    }
    case "renameGroup": {
      if (!state.groups[command.groupId]) {
        return blocked("Group not found.");
      }
      return applied([
        makeEvent({ type: "GroupRenamed", groupId: command.groupId, name: normalizeWhitespace(command.name) }),
      ], "Group renamed.");
    }
    case "updateGroupNotes": {
      if (!state.groups[command.groupId]) return blocked("Group not found.");
      return applied([makeEvent({ type: "GroupNotesUpdated", groupId: command.groupId, notes: command.notes })], "Group notes updated.");
    }
    case "updateGuest": {
      if (!state.guests[command.guestId]) return blocked("Guest not found.");
      return applied([
        makeEvent({
          type: "GuestUpdated",
          guestId: command.guestId,
          name: command.name ? titleCaseName(command.name) : undefined,
          kind: command.kind,
          notes: command.notes,
        }),
      ], "Guest updated.");
    }
    case "createTable": {
      return applied(createTableEvent(command, Math.max(...Object.values(state.tables).map((table) => table.zIndex), 0) + 1), "Table added.");
    }
    case "renameTable": {
      if (!state.tables[command.tableId]) return blocked("Table not found.");
      return applied([makeEvent({ type: "TableRenamed", tableId: command.tableId, name: normalizeWhitespace(command.name) })], "Table renamed.");
    }
    case "setTableCapacity": {
      if (!state.tables[command.tableId]) return blocked("Table not found.");
      return applied([makeEvent({ type: "TableCapacitySet", tableId: command.tableId, capacity: sanitizeCapacity(command.capacity) })], "Capacity updated.");
    }
    case "moveTable": {
      if (!state.tables[command.tableId]) return blocked("Table not found.");
      return applied(
        [
          makeEvent({
            type: "TableMoved",
            tableId: command.tableId,
            position: normalizePosition(command.position),
            zIndex: Math.max(...Object.values(state.tables).map((table) => table.zIndex), 0) + 1,
          }),
        ],
        "Table moved.",
      );
    }
    case "seatGroup": {
      const group = state.groups[command.groupId];
      const table = state.tables[command.tableId];
      if (!group || !table) return blocked("Group or table not found.");
      const next = replayWithEvents(state, [makeEvent({ type: "GroupSeated", groupId: group.id, tableId: table.id })]);
      const issues = deriveIssues(next, document.policy);
      return resultFromIssues(
        [makeEvent({ type: "GroupSeated", groupId: group.id, tableId: table.id })],
        issues,
        document.policy,
        `${group.name} seated at ${table.name}.`,
      );
    }
    case "unseatGroup": {
      if (!state.groups[command.groupId]) return blocked("Group not found.");
      return applied([makeEvent({ type: "GroupUnseated", groupId: command.groupId })], "Group unseated.");
    }
    case "addConstraint": {
      if (!state.groups[command.groupId] || !state.groups[command.targetGroupId]) return blocked("Group not found.");
      return applied(
        [
          makeEvent({
            type: "ConstraintAdded",
            groupId: command.groupId,
            relation: command.relation,
            targetGroupId: command.targetGroupId,
          }),
        ],
        "Constraint added.",
      );
    }
    case "removeConstraint": {
      if (!state.groups[command.groupId]) return blocked("Group not found.");
      return applied(
        [
          makeEvent({
            type: "ConstraintRemoved",
            groupId: command.groupId,
            relation: command.relation,
            targetGroupId: command.targetGroupId,
          }),
        ],
        "Constraint removed.",
      );
    }
    case "setPolicy": {
      return applied(
        [
          makeEvent({
            type: "PolicyChanged",
            policy: { ...document.policy, ...command.policy },
          }),
        ],
        "Policy updated.",
      );
    }
    default:
      return blocked("Unsupported command.");
  }
}

function resultFromIssues(
  events: PlannerEvent[],
  issues: ReturnType<typeof deriveIssues>,
  policy: Policy,
  message: string,
): CommandResult {
  const hasBlocking = issues.some((issue) => issue.severity === "blocked");
  const hasWarnings = issues.some((issue) => issue.severity === "warning");
  const status = hasBlocking
    ? "blocked"
    : hasWarnings
      ? "warning"
      : "applied";
  return {
    status,
    applied: status !== "blocked",
    events: status === "blocked" ? [] : events,
    issues,
    message,
  };
}

function applied(events: PlannerEvent[], message: string): CommandResult {
  return { status: "applied", applied: true, events, issues: [], message };
}

function blocked(message: string): CommandResult {
  return { status: "blocked", applied: false, events: [], issues: [], message };
}

function replayWithEvents(state: PlannerState, events: PlannerEvent[]): PlannerState {
  return events.reduce(applyEvent, state);
}

function normalizePosition(position: TablePosition): TablePosition {
  return {
    left: Number.isFinite(position.left) ? position.left : 24,
    top: Number.isFinite(position.top) ? position.top : 24,
  };
}

function sanitizeCapacity(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.floor(value)) : 1;
}
