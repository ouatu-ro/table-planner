import { createEffect, createMemo, createSignal, onCleanup } from "solid-js";
import {
  appendEvents,
  currentState,
  currentPolicy,
  defaultDocument,
  loadDocument,
  redoDocument,
  saveDocument,
  undoDocument,
} from "./core/persistence";
import { detectConflicts } from "./core/conflicts";
import { exportCsv, csvToRows } from "./core/csv";
import { deriveGroupViews, deriveTableViews } from "./core/reducer";
import { executeCommand } from "./core/commands";
import type { GuestKind, PlannerCommand, PlannerDocument, PolicyMode, TablePosition } from "./core/types";
import { StatCard } from "./design-system/primitives";
import { AppHeader } from "./features/layout/AppHeader";
import { GuestsSidebar } from "./features/guests/GuestsSidebar";
import { TablesWorkspace } from "./features/tables/TablesWorkspace";
import { InspectorPanel } from "./features/inspector/InspectorPanel";

export default function App() {
  const [doc, setDoc] = createSignal<PlannerDocument>(loadDocument());
  const [status, setStatus] = createSignal<{ type: "success" | "warning" | "error"; message: string } | null>(null);
  const [dragPreview, setDragPreview] = createSignal<{ tableId: string; left: number; top: number } | null>(null);
  const [tableNameDraft, setTableNameDraft] = createSignal<{ tableId: string; value: string } | null>(null);
  const [groupDraft, setGroupDraft] = createSignal<{ id: string; name: string; notes: string } | null>(null);
  const [memberDrafts, setMemberDrafts] = createSignal<Record<string, { name: string; kind: GuestKind; notes: string }>>({});
  const [tableInspectorDraft, setTableInspectorDraft] = createSignal<{ id: string; name: string; capacity: string } | null>(null);

  const state = createMemo(() => currentState(doc()));
  const policy = createMemo(() => currentPolicy(doc()));
  const conflicts = createMemo(() => detectConflicts(state(), policy()));
  const groups = createMemo(() => deriveGroupViews(state(), conflicts()));
  const tables = createMemo(() => deriveTableViews(state(), conflicts()));
  const selectedGroup = createMemo(() => groups().find((group) => group.group.id === doc().ui.selectedGroupId) || null);
  const selectedTable = createMemo(() => tables().find((table) => table.table.id === doc().ui.selectedTableId) || null);
  const unassignedGroups = createMemo(() => groups().filter((group) => !group.tableId));
  const visibleGroups = createMemo(() => {
    const query = doc().ui.search.trim().toLowerCase();
    if (!query) return unassignedGroups();
    return unassignedGroups().filter((group) => {
      if (group.group.name.toLowerCase().includes(query)) return true;
      return group.guests.some((guest) => guest.name.toLowerCase().includes(query));
    });
  });
  const search = createMemo(() => doc().ui.search);
  const assignedSeats = createMemo(() => groups().filter((group) => group.tableId).reduce((sum, group) => sum + group.seatCount, 0));
  const totalSeats = createMemo(() => tables().reduce((sum, table) => sum + table.table.capacity, 0));
  const occupancyRate = createMemo(() => {
    if (!totalSeats()) return "0%";
    return `${Math.round((assignedSeats() / totalSeats()) * 100)}%`;
  });
  const localConflicts = createMemo(() => {
    const groupId = selectedGroup()?.group.id;
    const tableId = selectedTable()?.table.id ?? selectedGroup()?.tableId ?? null;
    if (!groupId && !tableId) return [];
    return conflicts().filter((issue) => {
      if (groupId && issue.groupIds.includes(groupId)) return true;
      if (tableId && issue.tableIds.includes(tableId)) return true;
      return false;
    });
  });

  let dragTableState: {
    tableId: string;
    startX: number;
    startY: number;
    origin: TablePosition;
  } | null = null;

  createEffect(() => {
    saveDocument(doc());
  });

  createEffect(() => {
    const current = status();
    if (!current) return;
    const timeoutId = window.setTimeout(() => {
      setStatus((previous) => (previous === current ? null : previous));
    }, 2400);
    onCleanup(() => window.clearTimeout(timeoutId));
  });

  createEffect(() => {
    const groupView = selectedGroup();
    if (groupView) {
      setGroupDraft({
        id: groupView.group.id,
        name: groupView.group.name,
        notes: groupView.group.notes,
      });
      setMemberDrafts(
        Object.fromEntries(
          groupView.guests.map((guest) => [
            guest.id,
            { name: guest.name, kind: guest.kind, notes: guest.notes },
          ]),
        ),
      );
    } else {
      setGroupDraft(null);
      setMemberDrafts({});
    }
  });

  createEffect(() => {
    const tableView = selectedTable();
    if (tableView) {
      setTableInspectorDraft({
        id: tableView.table.id,
        name: tableView.table.name,
        capacity: String(tableView.table.capacity),
      });
    } else {
      setTableInspectorDraft(null);
    }
  });

  function dispatch(command: PlannerCommand) {
    const result = executeCommand(state(), doc(), command);
    if (!result.applied) {
      setStatus({ type: "error", message: result.message });
      return;
    }
    setDoc((current) => {
      const next = appendEvents(current, result.events);
      return { ...next, policy: currentPolicy(next) };
    });
    setStatus({
      type: result.status === "warning" ? "warning" : "success",
      message: result.message,
    });
  }

  function selectGroup(groupId: string | null) {
    setDoc((current) => ({
      ...current,
      ui: { ...current.ui, selectedGroupId: groupId, selectedTableId: null },
    }));
  }

  function selectTable(tableId: string | null) {
    setDoc((current) => ({
      ...current,
      ui: { ...current.ui, selectedGroupId: null, selectedTableId: tableId },
    }));
  }

  function updateSearch(value: string) {
    setDoc((current) => ({
      ...current,
      ui: { ...current.ui, search: value },
    }));
  }

  function addGroupFromForm(form: HTMLFormElement) {
    const formData = new FormData(form);
    const names = String(formData.get("names") || "");
    const groupName = String(formData.get("groupName") || "");
    const notes = String(formData.get("notes") || "");
    dispatch({ type: "addGuests", names, groupName, notes });
    form.reset();
  }

  function addTable() {
    dispatch({
      type: "createTable",
      name: `Table ${tables().length + 1}`,
      capacity: 10,
      position: nextTablePosition(tables().length),
    });
  }

  function nextTablePosition(index: number): TablePosition {
    return {
      left: 24 + (index % 4) * 300,
      top: 24 + Math.floor(index / 4) * 200,
    };
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(doc(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = "wedding-table-plan.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJson(file: File | null) {
    if (!file) return;
    const text = await file.text();
    try {
      const parsed = JSON.parse(text) as PlannerDocument;
      setDoc({ ...defaultDocument(), ...parsed });
      setStatus({ type: "success", message: "Plan imported." });
    } catch {
      setStatus({ type: "error", message: "Could not import JSON." });
    }
  }

  async function importCsv(file: File | null) {
    if (!file) return;
    const text = await file.text();
    try {
      const rows = csvToRows(text);
      if (!rows.length) {
        setStatus({ type: "error", message: "CSV did not contain any guest rows." });
        return;
      }
      const queuedGroups = new Map<
        string,
        {
          names: string[];
          kind: GuestKind;
          notes: string;
          tableName: string;
          mustSitWith: string[];
          mustNotSitWith: string[];
        }
      >();
      for (const row of rows) {
        const key = row.groupName || row.guestName;
        const current = queuedGroups.get(key) || {
          names: [],
          kind: row.kind,
          notes: row.notes,
          tableName: row.tableName,
          mustSitWith: [],
          mustNotSitWith: [],
        };
        current.names.push(...row.guestName.split(",").map((name) => name.trim()).filter(Boolean));
        current.notes = current.notes || row.notes;
        current.tableName = current.tableName || row.tableName;
        current.mustSitWith.push(...row.mustSitWith.split("|").map((name) => name.trim()).filter(Boolean));
        current.mustNotSitWith.push(...row.mustNotSitWith.split("|").map((name) => name.trim()).filter(Boolean));
        queuedGroups.set(key, current);
      }

      for (const [groupName, group] of queuedGroups) {
        dispatch({
          type: "addGuests",
          names: group.names.join(", "),
          groupName,
          kind: group.kind,
          notes: group.notes,
        });
      }
      setStatus({ type: "success", message: "CSV imported." });
    } catch {
      setStatus({ type: "error", message: "Could not import CSV." });
    }
  }

  function handleGroupDragStart(event: DragEvent, groupId: string) {
    event.stopPropagation();
    event.dataTransfer?.setData("text/plain", JSON.stringify({ type: "group", id: groupId }));
    if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
  }

  function handleGroupDrop(event: DragEvent, tableId: string) {
    event.preventDefault();
    const payload = safeParse(event.dataTransfer?.getData("text/plain") || "");
    if (payload?.type === "group") {
      dispatch({ type: "seatGroup", groupId: payload.id, tableId });
    }
  }

  function handleUnassignedDrop(event: DragEvent) {
    event.preventDefault();
    const payload = safeParse(event.dataTransfer?.getData("text/plain") || "");
    if (payload?.type === "group") {
      dispatch({ type: "unseatGroup", groupId: payload.id });
    }
  }

  function startTableDrag(event: MouseEvent, tableId: string) {
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".table-guest, .chip-action, input, button, textarea, select, [contenteditable='true']")) return;
    const table = state().tables[tableId];
    if (!table) return;
    dragTableState = {
      tableId,
      startX: event.clientX,
      startY: event.clientY,
      origin: { ...table.position },
    };
    window.addEventListener("mousemove", moveTable);
    window.addEventListener("mouseup", endTableDrag);
  }

  function moveTable(event: MouseEvent) {
    if (!dragTableState) return;
    const dx = event.clientX - dragTableState.startX;
    const dy = event.clientY - dragTableState.startY;
    if (!dragPreview()) {
      if (Math.hypot(dx, dy) < 8) return;
    }
    const origin = dragTableState.origin;
    const left = Math.max(0, origin.left + dx);
    const top = Math.max(0, origin.top + dy);
    setDragPreview({ tableId: dragTableState.tableId, left, top });
  }

  function endTableDrag() {
    if (!dragTableState) return;
    const preview = dragPreview();
    if (!preview) {
      dragTableState = null;
      window.removeEventListener("mousemove", moveTable);
      window.removeEventListener("mouseup", endTableDrag);
      return;
    }
    dispatch({
      type: "moveTable",
      tableId: dragTableState.tableId,
      position: preview && preview.tableId === dragTableState.tableId ? { left: preview.left, top: preview.top } : dragTableState.origin,
    });
    dragTableState = null;
    setDragPreview(null);
    window.removeEventListener("mousemove", moveTable);
    window.removeEventListener("mouseup", endTableDrag);
  }

  function safeParse(value: string) {
    try {
      return JSON.parse(value) as { type: string; id: string } | null;
    } catch {
      return null;
    }
  }

  function removeConstraint(groupId: string, relation: "mustSitWith" | "mustNotSitWith", targetGroupId: string) {
    dispatch({ type: "removeConstraint", groupId, relation, targetGroupId });
  }

  function addConstraint(groupId: string, relation: "mustSitWith" | "mustNotSitWith", targetGroupId: string) {
    dispatch({ type: "addConstraint", groupId, relation, targetGroupId });
  }

  function updateGroupName(groupId: string, name: string) {
    dispatch({ type: "renameGroup", groupId, name });
  }

  function updateGroupNotes(groupId: string, notes: string) {
    dispatch({ type: "updateGroupNotes", groupId, notes });
  }

  function updateGuest(guestId: string, name: string, kind: "adult" | "kid" | "teen" | "other", notes: string) {
    dispatch({ type: "updateGuest", guestId, name, kind, notes });
  }

  function setGroupDraftField(field: "name" | "notes", value: string) {
    setGroupDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function commitGroupDraft() {
    const draft = groupDraft();
    const groupView = selectedGroup();
    if (!draft || !groupView || draft.id !== groupView.group.id) return;
    if (draft.name !== groupView.group.name) updateGroupName(draft.id, draft.name);
    if (draft.notes !== groupView.group.notes) updateGroupNotes(draft.id, draft.notes);
  }

  function setMemberDraftField(guestId: string, field: "name" | "kind" | "notes", value: string) {
    setMemberDrafts((current) => {
      const next = current[guestId];
      if (!next) return current;
      return { ...current, [guestId]: { ...next, [field]: value } as { name: string; kind: GuestKind; notes: string } };
    });
  }

  function commitMemberDraft(guestId: string) {
    const groupView = selectedGroup();
    const guest = groupView?.guests.find((item) => item.id === guestId);
    const draft = memberDrafts()[guestId];
    if (!guest || !draft) return;
    if (draft.name !== guest.name || draft.kind !== guest.kind || draft.notes !== guest.notes) {
      updateGuest(guestId, draft.name, draft.kind, draft.notes);
    }
  }

  function updateTableName(tableId: string, name: string) {
    dispatch({ type: "renameTable", tableId, name });
  }

  function beginTableNameEdit(tableId: string, name: string) {
    setTableNameDraft({ tableId, value: name });
  }

  function setDraftTableName(tableId: string, value: string) {
    setTableNameDraft({ tableId, value });
  }

  function commitTableNameEdit(tableId: string) {
    const draft = tableNameDraft();
    if (!draft || draft.tableId !== tableId) return;
    const nextName = draft.value;
    setTableNameDraft(null);
    if (nextName !== state().tables[tableId]?.name) {
      updateTableName(tableId, nextName);
    }
  }

  function cancelTableNameEdit(tableId: string) {
    const draft = tableNameDraft();
    if (draft?.tableId === tableId) setTableNameDraft(null);
  }

  function updateTableCapacity(tableId: string, capacity: number) {
    dispatch({ type: "setTableCapacity", tableId, capacity });
  }

  function setTableInspectorField(field: "name" | "capacity", value: string) {
    setTableInspectorDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function commitTableInspectorDraft() {
    const draft = tableInspectorDraft();
    const tableView = selectedTable();
    if (!draft || !tableView || draft.id !== tableView.table.id) return;
    if (draft.name !== tableView.table.name) updateTableName(draft.id, draft.name);
    const parsedCapacity = Number.parseInt(draft.capacity, 10);
    if (Number.isFinite(parsedCapacity) && parsedCapacity > 0 && parsedCapacity !== tableView.table.capacity) {
      updateTableCapacity(draft.id, parsedCapacity);
    }
  }

  function updatePolicy(key: "tableCapacity" | "incompatibleGuests" | "groupSplit" | "duplicateNames", mode: PolicyMode) {
    dispatch({ type: "setPolicy", policy: { [key]: mode } as Partial<PlannerDocument["policy"]> });
  }

  function seatSelectedGroup() {
    const group = selectedGroup();
    if (!group) return;
    const selected = selectedTable()?.table.id;
    const tableId = selected || tables()[0]?.table.id;
    if (!tableId) return;
    dispatch({ type: "seatGroup", groupId: group.group.id, tableId });
  }

  function undo() {
    setDoc((current) => {
      const next = undoDocument(current);
      return { ...next, policy: currentPolicy(next) };
    });
  }

  function redo() {
    setDoc((current) => {
      const next = redoDocument(current);
      return { ...next, policy: currentPolicy(next) };
    });
  }

  function exportPlannerCsv() {
    const blob = new Blob([exportCsv(state())], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = window.document.createElement("a");
    a.href = url;
    a.download = "wedding-table-plan.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div class="app-shell">
      <AppHeader groupCount={groups().length} tableCount={tables().length} />

      <section class="kpi-grid">
        <StatCard label="Groups">{groups().length}</StatCard>
        <StatCard label="Unseated">{unassignedGroups().length}</StatCard>
        <StatCard label="Tables">{tables().length}</StatCard>
        <StatCard label="Seats placed">{assignedSeats()}</StatCard>
        <StatCard label="Capacity">{totalSeats()}</StatCard>
        <StatCard label="Occupancy">{occupancyRate()}</StatCard>
      </section>

      <main class="layout">
        <GuestsSidebar
          unassignedCount={unassignedGroups().length}
          visibleGroups={visibleGroups()}
          selectedGroupId={selectedGroup()?.group.id ?? null}
          search={search()}
          policy={policy()}
          onAddGuests={addGroupFromForm}
          onSearch={updateSearch}
          onSelectGroup={selectGroup}
          onGroupDragStart={handleGroupDragStart}
          onUnassignedDrop={handleUnassignedDrop}
          onAddTable={addTable}
          onUpdatePolicy={updatePolicy}
          onUndo={undo}
          onRedo={redo}
          onExportJson={exportJson}
          onExportCsv={exportPlannerCsv}
          onImportJson={importJson}
          onImportCsv={importCsv}
        />

        <TablesWorkspace
          tableCount={tables().length}
          tables={tables()}
          selectedTableId={selectedTable()?.table.id ?? null}
          dragPreview={dragPreview()}
          tableNameDraft={tableNameDraft()}
          conflicts={conflicts()}
          groups={groups()}
          onAddTable={addTable}
          onSelectTable={selectTable}
          onSelectGroup={selectGroup}
          onStartTableDrag={startTableDrag}
          onTableDrop={handleGroupDrop}
          onGroupDragStart={handleGroupDragStart}
          onUnseatGroup={(groupId) => dispatch({ type: "unseatGroup", groupId })}
          onBeginTableNameEdit={beginTableNameEdit}
          onSetDraftTableName={setDraftTableName}
          onCommitTableNameEdit={commitTableNameEdit}
          onCancelTableNameEdit={cancelTableNameEdit}
          onUpdateTableCapacity={updateTableCapacity}
        />

        <InspectorPanel
          selectedGroup={selectedGroup()}
          selectedTable={selectedTable()}
          tables={tables()}
          groups={groups()}
          localConflicts={localConflicts()}
          groupDraft={groupDraft()}
          memberDrafts={memberDrafts()}
          tableInspectorDraft={tableInspectorDraft()}
          onSetGroupDraftField={setGroupDraftField}
          onCommitGroupDraft={commitGroupDraft}
          onSeatSelectedGroup={seatSelectedGroup}
          onUnseatGroup={(groupId) => dispatch({ type: "unseatGroup", groupId })}
          onAddConstraint={addConstraint}
          onRemoveConstraint={removeConstraint}
          onSetMemberDraftField={setMemberDraftField}
          onCommitMemberDraft={commitMemberDraft}
          onSetTableInspectorField={setTableInspectorField}
          onCommitTableInspectorDraft={commitTableInspectorDraft}
        />
      </main>

      {status() ? <div class={`status-bar visible ${status()!.type}`}>{status()!.message}</div> : null}
    </div>
  );
}
