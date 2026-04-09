import { defaultPolicy, replay } from "./reducer";
import type { PlannerDocument, PlannerEvent, PlannerState, Policy } from "./types";
import { createId, deepClone, splitNames, titleCaseName } from "./utils";

const STORAGE_KEY = "table-planner.v3";

export function defaultDocument(): PlannerDocument {
  return {
    version: 1,
    policy: defaultPolicy,
    log: { events: [], cursor: 0 },
    ui: { selectedGroupId: null, selectedTableId: null, search: "" },
  };
}

export function saveDocument(document: PlannerDocument): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(document));
}

export function loadDocument(): PlannerDocument {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw) {
    try {
      return migrateDocument(JSON.parse(raw));
    } catch {
      return defaultDocument();
    }
  }

  const legacy = loadLegacyDocument();
  if (legacy) return legacy;
  return defaultDocument();
}

export function currentState(document: PlannerDocument): PlannerState {
  return replay(document.log.events.slice(0, document.log.cursor));
}

export function currentPolicy(document: PlannerDocument): Policy {
  return document.log.events.slice(0, document.log.cursor).reduce((policy, event) => {
    if (event.type === "PolicyChanged") return event.policy;
    return policy;
  }, defaultPolicy);
}

export function appendEvents(document: PlannerDocument, events: PlannerEvent[]): PlannerDocument {
  const next = deepClone(document);
  next.log.events = next.log.events.slice(0, next.log.cursor).concat(events);
  next.log.cursor = next.log.events.length;
  return next;
}

export function undoDocument(document: PlannerDocument): PlannerDocument {
  return {
    ...document,
    log: {
      ...document.log,
      cursor: Math.max(0, document.log.cursor - 1),
    },
  };
}

export function redoDocument(document: PlannerDocument): PlannerDocument {
  return {
    ...document,
    log: {
      ...document.log,
      cursor: Math.min(document.log.events.length, document.log.cursor + 1),
    },
  };
}

function migrateDocument(input: unknown): PlannerDocument {
  if (!input || typeof input !== "object") return defaultDocument();
  const candidate = input as Partial<PlannerDocument>;
  if (candidate.log && Array.isArray(candidate.log.events) && typeof candidate.log.cursor === "number") {
    return {
      ...defaultDocument(),
      ...candidate,
      log: {
        events: candidate.log.events,
        cursor: Math.min(candidate.log.cursor, candidate.log.events.length),
      },
    } as PlannerDocument;
  }
  return defaultDocument();
}

function loadLegacyDocument(): PlannerDocument | null {
  const legacy = localStorage.getItem("weddingTablePlanner.state");
  if (!legacy) return null;
  try {
    const parsed = JSON.parse(legacy) as {
      guests?: Array<{ id: string; name: string; size: number; groupId?: string; mustSitWith?: string[]; mustNotSitWith?: string[]; notes?: string }>;
      tables?: Array<{ id: string; name: string; capacity: number; position?: { left: number; top: number } }>;
      assignments?: Record<string, string | null>;
    };
    const events: PlannerEvent[] = [];
    const groupIdByLegacyGuest = new Map<string, string>();
    const groupsByName = new Map<string, string>();

    for (const guest of parsed.guests ?? []) {
      const groupName = titleCaseName(guest.groupId || guest.name);
      const groupId = groupsByName.get(groupName) || createId("group");
      groupsByName.set(groupName, groupId);
      groupIdByLegacyGuest.set(guest.id, groupId);
      const names = splitNames(guest.name);
      const memberNames = names.length > 1 ? names : Array.from({ length: Math.max(1, guest.size || 1) }, (_, index) => (index === 0 ? guest.name : `${guest.name} ${index + 1}`));
      events.push({
        id: createId("event"),
        at: Date.now(),
        type: "GuestsAdded",
        group: { id: groupId, name: groupName },
        guests: memberNames.map((name) => ({
          id: createId("guest"),
          name,
          kind: "adult",
          notes: guest.notes || "",
        })),
      });
    }

    for (const table of parsed.tables ?? []) {
      events.push({
        id: createId("event"),
        at: Date.now(),
        type: "TableCreated",
        table: {
          id: table.id || createId("table"),
          name: table.name,
          capacity: table.capacity,
          position: table.position || { left: 24, top: 24 },
          zIndex: events.length + 1,
        },
      });
    }

    for (const [legacyGuestId, tableId] of Object.entries(parsed.assignments ?? {})) {
      const groupId = groupIdByLegacyGuest.get(legacyGuestId);
      if (!groupId || !tableId) continue;
      events.push({
        id: createId("event"),
        at: Date.now(),
        type: "GroupSeated",
        groupId,
        tableId,
      });
    }

    return {
      ...defaultDocument(),
      log: { events, cursor: events.length },
    };
  } catch {
    return null;
  }
}
