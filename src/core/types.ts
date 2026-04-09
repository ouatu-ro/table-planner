export type Id = string;

export type GuestKind = "adult" | "kid" | "teen" | "other";

export type IssueSeverity = "warning" | "blocked";
export type ResultStatus = "applied" | "warning" | "blocked";
export type PolicyMode = "ignore" | "warning" | "blocked";

export interface Policy {
  tableCapacity: PolicyMode;
  incompatibleGuests: PolicyMode;
  groupSplit: PolicyMode;
  duplicateNames: PolicyMode;
}

export interface Guest {
  id: Id;
  name: string;
  kind: GuestKind;
  notes: string;
  groupId: Id;
}

export interface Group {
  id: Id;
  name: string;
  guestIds: Id[];
  notes: string;
  mustSitWith: Id[];
  mustNotSitWith: Id[];
}

export interface Table {
  id: Id;
  name: string;
  capacity: number;
  position: { left: number; top: number };
  zIndex: number;
}

export interface PlannerState {
  guests: Record<Id, Guest>;
  groups: Record<Id, Group>;
  tables: Record<Id, Table>;
  assignments: Record<Id, Id | null>;
}

export interface UIState {
  selectedGroupId: Id | null;
  selectedTableId: Id | null;
  search: string;
}

export interface PlannerDocument {
  version: number;
  policy: Policy;
  log: EventLog;
  ui: UIState;
}

export interface EventLog {
  events: PlannerEvent[];
  cursor: number;
}

export interface Issue {
  code:
    | "table-capacity"
    | "incompatible-guests"
    | "group-split"
    | "duplicate-names"
    | "invalid-input";
  severity: IssueSeverity;
  message: string;
  entityIds: Id[];
}

export interface CommandResult {
  status: ResultStatus;
  applied: boolean;
  events: PlannerEvent[];
  issues: Issue[];
  message: string;
}

export interface EventMeta {
  id: Id;
  at: number;
}

export interface GuestPayload {
  name: string;
  kind?: GuestKind;
  notes?: string;
}

export interface CsvRow {
  groupName: string;
  guestName: string;
  kind: GuestKind;
  notes: string;
  tableName: string;
  mustSitWith: string;
  mustNotSitWith: string;
}

export interface TablePosition {
  left: number;
  top: number;
}

export type PlannerEvent =
  | (EventMeta & {
      type: "GuestsAdded";
      group: { id: Id; name: string };
      guests: Array<{ id: Id; name: string; kind: GuestKind; notes: string }>;
    })
  | (EventMeta & {
      type: "GroupRenamed";
      groupId: Id;
      name: string;
    })
  | (EventMeta & {
      type: "GroupNotesUpdated";
      groupId: Id;
      notes: string;
    })
  | (EventMeta & {
      type: "GuestUpdated";
      guestId: Id;
      kind?: GuestKind;
      notes?: string;
      name?: string;
    })
  | (EventMeta & {
      type: "TableCreated";
      table: Table;
    })
  | (EventMeta & {
      type: "TableRenamed";
      tableId: Id;
      name: string;
    })
  | (EventMeta & {
      type: "TableCapacitySet";
      tableId: Id;
      capacity: number;
    })
  | (EventMeta & {
      type: "TableMoved";
      tableId: Id;
      position: TablePosition;
      zIndex: number;
    })
  | (EventMeta & {
      type: "GroupSeated";
      groupId: Id;
      tableId: Id;
    })
  | (EventMeta & {
      type: "GroupUnseated";
      groupId: Id;
    })
  | (EventMeta & {
      type: "ConstraintAdded";
      groupId: Id;
      relation: "mustSitWith" | "mustNotSitWith";
      targetGroupId: Id;
    })
  | (EventMeta & {
      type: "ConstraintRemoved";
      groupId: Id;
      relation: "mustSitWith" | "mustNotSitWith";
      targetGroupId: Id;
    })
  | (EventMeta & {
      type: "PolicyChanged";
      policy: Policy;
    });

export type PlannerCommand =
  | {
      type: "addGuests";
      names: string;
      groupName?: string;
      kind?: GuestKind;
      notes?: string;
    }
  | {
      type: "renameGroup";
      groupId: Id;
      name: string;
    }
  | {
      type: "updateGroupNotes";
      groupId: Id;
      notes: string;
    }
  | {
      type: "updateGuest";
      guestId: Id;
      name?: string;
      kind?: GuestKind;
      notes?: string;
    }
  | {
      type: "createTable";
      name?: string;
      capacity?: number;
      position?: TablePosition;
    }
  | {
      type: "renameTable";
      tableId: Id;
      name: string;
    }
  | {
      type: "setTableCapacity";
      tableId: Id;
      capacity: number;
    }
  | {
      type: "moveTable";
      tableId: Id;
      position: TablePosition;
    }
  | {
      type: "seatGroup";
      groupId: Id;
      tableId: Id;
    }
  | {
      type: "unseatGroup";
      groupId: Id;
    }
  | {
      type: "addConstraint";
      groupId: Id;
      relation: "mustSitWith" | "mustNotSitWith";
      targetGroupId: Id;
    }
  | {
      type: "removeConstraint";
      groupId: Id;
      relation: "mustSitWith" | "mustNotSitWith";
      targetGroupId: Id;
    }
  | {
      type: "setPolicy";
      policy: Partial<Policy>;
    };

export interface DerivedGroupView {
  group: Group;
  guests: Guest[];
  tableId: Id | null;
  seatCount: number;
  conflictCount: number;
  status: "ok" | "warning" | "blocked";
}

export interface DerivedTableView {
  table: Table;
  groups: DerivedGroupView[];
  used: number;
  remaining: number;
  conflictCount: number;
  status: "ok" | "warning" | "blocked";
}

export interface Conflict {
  code: Issue["code"];
  severity: IssueSeverity;
  message: string;
  groupIds: Id[];
  tableIds: Id[];
}
