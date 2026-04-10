import type { Conflict, DerivedGroupView, DerivedTableView, GuestKind, PolicyMode } from "../core/types";

export interface GuestsSidebarProps {
  unassignedCount: number;
  visibleGroups: DerivedGroupView[];
  selectedGroupId: string | null;
  search: string;
  policy: {
    tableCapacity: PolicyMode;
    incompatibleGuests: PolicyMode;
    groupSplit: PolicyMode;
    duplicateNames: PolicyMode;
  };
  onAddGuests: (form: HTMLFormElement) => void;
  onSearch: (value: string) => void;
  onSelectGroup: (groupId: string) => void;
  onGroupDragStart: (event: DragEvent, groupId: string) => void;
  onUnassignedDrop: (event: DragEvent) => void;
  onAddTable: () => void;
  onUpdatePolicy: (key: "tableCapacity" | "incompatibleGuests" | "groupSplit" | "duplicateNames", mode: PolicyMode) => void;
  onUndo: () => void;
  onRedo: () => void;
  onExportJson: () => void;
  onExportCsv: () => void;
  onImportJson: (file: File | null) => void;
  onImportCsv: (file: File | null) => void;
}

export interface TablesWorkspaceProps {
  tableCount: number;
  tables: DerivedTableView[];
  selectedTableId: string | null;
  dragPreview: { tableId: string; left: number; top: number } | null;
  tableNameDraft: { tableId: string; value: string } | null;
  conflicts: Conflict[];
  groups: DerivedGroupView[];
  onAddTable?: () => void;
  onSelectTable: (tableId: string) => void;
  onSelectGroup: (groupId: string) => void;
  onStartTableDrag: (event: MouseEvent, tableId: string) => void;
  onTableDrop: (event: DragEvent, tableId: string) => void;
  onGroupDragStart: (event: DragEvent, groupId: string) => void;
  onUnseatGroup: (groupId: string) => void;
  onBeginTableNameEdit: (tableId: string, name: string) => void;
  onSetDraftTableName: (tableId: string, value: string) => void;
  onCommitTableNameEdit: (tableId: string) => void;
  onCancelTableNameEdit: (tableId: string) => void;
  onUpdateTableCapacity: (tableId: string, capacity: number) => void;
}

export interface InspectorPanelProps {
  selectedGroup: DerivedGroupView | null;
  selectedTable: DerivedTableView | null;
  tables: DerivedTableView[];
  groups: DerivedGroupView[];
  localConflicts: Conflict[];
  groupDraft: { id: string; name: string; notes: string } | null;
  memberDrafts: Record<string, { name: string; kind: GuestKind; notes: string }>;
  tableInspectorDraft: { id: string; name: string; capacity: string } | null;
  onSetGroupDraftField: (field: "name" | "notes", value: string) => void;
  onCommitGroupDraft: () => void;
  onSeatSelectedGroup: () => void;
  onUnseatGroup: (groupId: string) => void;
  onAddConstraint: (groupId: string, relation: "mustSitWith" | "mustNotSitWith", targetGroupId: string) => void;
  onRemoveConstraint: (groupId: string, relation: "mustSitWith" | "mustNotSitWith", targetGroupId: string) => void;
  onSetMemberDraftField: (guestId: string, field: "name" | "kind" | "notes", value: string) => void;
  onCommitMemberDraft: (guestId: string) => void;
  onSetTableInspectorField: (field: "name" | "capacity", value: string) => void;
  onCommitTableInspectorDraft: () => void;
}
