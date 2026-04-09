import { For, createEffect, createMemo, createSignal } from "solid-js";
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

export default function App() {
  const [doc, setDoc] = createSignal<PlannerDocument>(loadDocument());
  const [status, setStatus] = createSignal<{ type: "success" | "warning" | "error"; message: string } | null>(null);
  const [dragPreview, setDragPreview] = createSignal<{ tableId: string; left: number; top: number } | null>(null);
  const [tableNameDraft, setTableNameDraft] = createSignal<{ tableId: string; value: string } | null>(null);

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

  let dragTableState: {
    tableId: string;
    startX: number;
    startY: number;
    origin: TablePosition;
  } | null = null;

  createEffect(() => {
    saveDocument(doc());
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
    const kind = String(formData.get("kind") || "adult") as "adult" | "kid" | "teen" | "other";
    const notes = String(formData.get("notes") || "");
    dispatch({ type: "addGuests", names, groupName, kind, notes });
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

  return (
    <div class="app-shell">
      <header class="app-header">
        <div>
          <p class="eyebrow">Local-first seating planner</p>
          <h1>Wedding Table Planner</h1>
          <p class="subtitle">Groups are the seatable unit. Guests are individuals inside those groups.</p>
        </div>
        <div class="header-actions">
          <button class="secondary" onClick={undo}>
            Undo
          </button>
          <button class="secondary" onClick={redo}>
            Redo
          </button>
          <button class="secondary" onClick={exportJson}>
            Export JSON
          </button>
          <label class="file-button secondary">
            Import JSON
            <input type="file" accept="application/json,.json" onChange={(e) => importJson(e.currentTarget.files?.[0] || null)} />
          </label>
          <label class="file-button secondary">
            Import CSV
            <input type="file" accept=".csv,text/csv" onChange={(e) => importCsv(e.currentTarget.files?.[0] || null)} />
          </label>
          <button class="secondary" onClick={() => {
            const blob = new Blob([exportCsv(state())], { type: "text/csv" });
            const url = URL.createObjectURL(blob);
            const a = window.document.createElement("a");
            a.href = url;
            a.download = "wedding-table-plan.csv";
            a.click();
            URL.revokeObjectURL(url);
          }}>
            Export CSV
          </button>
        </div>
      </header>

      <section class="kpi-grid">
        <article>
          <span>Groups</span>
        <strong>{groups().length}</strong>
        </article>
        <article>
          <span>Unseated</span>
          <strong>{unassignedGroups().length}</strong>
        </article>
        <article>
          <span>Tables</span>
          <strong>{tables().length}</strong>
        </article>
        <article>
          <span>Seats used</span>
          <strong>{assignedSeats()}</strong>
        </article>
        <article>
          <span>Conflicts</span>
          <strong>{conflicts().length}</strong>
        </article>
        <article>
          <span>Search</span>
          <strong>{search() ? "On" : "Off"}</strong>
        </article>
        <article>
          <span>Total seats</span>
          <strong>{totalSeats()}</strong>
        </article>
      </section>

      <main class="layout">
        <aside class="panel left-panel">
          <div class="panel-section">
            <div class="section-head">
              <h2>Guests</h2>
              <span class="badge">{unassignedGroups().length}</span>
            </div>
            <form
              class="guest-form"
              onSubmit={(e) => {
                e.preventDefault();
                addGroupFromForm(e.currentTarget);
              }}
            >
              <div class="form-grid">
                <input name="names" type="text" placeholder="Guest names, comma-separated" />
                <input name="groupName" type="text" placeholder="Group / family name" />
                <select name="kind">
                  <option value="adult">Adult</option>
                  <option value="kid">Kid</option>
                  <option value="teen">Teen</option>
                  <option value="other">Other</option>
                </select>
                <input name="notes" type="text" placeholder="Group notes" />
                <button type="submit">Add guests</button>
              </div>
            </form>
            <input value={search()} onInput={(e) => updateSearch(e.currentTarget.value)} type="search" placeholder="Search unseated groups" />
          </div>

          <div class="panel-section">
            <div class="section-head">
              <h3>Unseated groups</h3>
            </div>
              <div class="guest-list" onDragOver={(e) => e.preventDefault()} onDrop={handleUnassignedDrop}>
              <For each={visibleGroups()}>
                {(groupView) => (
                  <div
                    classList={{
                      "guest-card": true,
                      selected: selectedGroup()?.group.id === groupView.group.id,
                      warning: groupView.conflictCount > 0,
                      blocked: groupView.status === "blocked",
                    }}
                    draggable="true"
                    data-group-id={groupView.group.id}
                    onClick={() => selectGroup(groupView.group.id)}
                    onDragStart={(e) => handleGroupDragStart(e, groupView.group.id)}
                  >
                    <div>
                      <strong>{groupView.group.name}</strong>
                      <div class="guest-meta">
                        {groupView.seatCount} seat{groupView.seatCount === 1 ? "" : "s"}
                        {groupView.conflictCount ? ` • ${groupView.conflictCount} issue${groupView.conflictCount === 1 ? "" : "s"}` : ""}
                      </div>
                    </div>
                    <div class="guest-summary">{groupView.guests.map((guest) => guest.name).join(", ")}</div>
                  </div>
                )}
              </For>
            </div>
          </div>

            <div class="panel-section">
              <div class="section-head">
                <h3>Table defaults</h3>
                <button class="secondary" onClick={addTable}>
                  Add table
                </button>
              </div>
            <p class="help-text">Tables are the only occupancy container. Groups seat together.</p>
          </div>
          <div class="panel-section">
            <div class="section-head">
              <h3>Action policy</h3>
            </div>
            <div class="policy-grid">
              <label>
                Table capacity
                <select value={policy().tableCapacity} onInput={(e) => updatePolicy("tableCapacity", e.currentTarget.value as PolicyMode)}>
                  <option value="ignore">Ignore</option>
                  <option value="warning">Warn</option>
                  <option value="blocked">Block</option>
                </select>
              </label>
              <label>
                Incompatible guests
                <select value={policy().incompatibleGuests} onInput={(e) => updatePolicy("incompatibleGuests", e.currentTarget.value as PolicyMode)}>
                  <option value="ignore">Ignore</option>
                  <option value="warning">Warn</option>
                  <option value="blocked">Block</option>
                </select>
              </label>
              <label>
                Group splits
                <select value={policy().groupSplit} onInput={(e) => updatePolicy("groupSplit", e.currentTarget.value as PolicyMode)}>
                  <option value="ignore">Ignore</option>
                  <option value="warning">Warn</option>
                  <option value="blocked">Block</option>
                </select>
              </label>
              <label>
                Duplicate names
                <select value={policy().duplicateNames} onInput={(e) => updatePolicy("duplicateNames", e.currentTarget.value as PolicyMode)}>
                  <option value="ignore">Ignore</option>
                  <option value="warning">Warn</option>
                  <option value="blocked">Block</option>
                </select>
              </label>
            </div>
          </div>
        </aside>

        <section class="panel center-panel">
          <div class="section-head">
            <h2>Tables</h2>
            <span class="badge">{tables().length}</span>
          </div>
          <div class="table-canvas">
            <For each={tables()}>
              {(tableView) => {
                const table = tableView.table;
                return (
                  <section
                    classList={{
                      "table-card": true,
                      selected: selectedTable()?.table.id === table.id,
                      "over-capacity": tableView.used > table.capacity,
                      warning: tableView.conflictCount > 0,
                    }}
                    data-table-id={table.id}
                    style={{
                      left: `${dragPreview()?.tableId === table.id ? dragPreview()!.left : table.position.left}px`,
                      top: `${dragPreview()?.tableId === table.id ? dragPreview()!.top : table.position.top}px`,
                      "z-index": `${table.zIndex}`,
                    }}
                    onClick={() => selectTable(table.id)}
                    onMouseDown={(e) => startTableDrag(e, table.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => handleGroupDrop(e, table.id)}
                  >
                    <div class="table-head">
                      <input
                        value={tableNameDraft()?.tableId === table.id ? tableNameDraft()!.value : table.name}
                        onFocus={() => beginTableNameEdit(table.id, table.name)}
                        onInput={(e) => setDraftTableName(table.id, e.currentTarget.value)}
                        onBlur={() => commitTableNameEdit(table.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelTableNameEdit(table.id);
                            e.currentTarget.blur();
                          }
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Table name"
                      />
                      <input
                        class="capacity-input"
                        type="number"
                        min="1"
                        value={table.capacity}
                        onInput={(e) => updateTableCapacity(table.id, Number.parseInt(e.currentTarget.value, 10))}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Table capacity"
                      />
                    </div>
                    <div class="table-summary">
                      {tableView.used} / {table.capacity} seats used
                      {tableView.conflictCount ? ` • ${tableView.conflictCount} issue${tableView.conflictCount === 1 ? "" : "s"}` : ""}
                    </div>
                    <div class="table-guests">
                      <For each={tableView.groups}>
                        {(groupView) => (
                          <div
                            classList={{
                              "table-guest": true,
                              warning: groupView.conflictCount > 0,
                            }}
                            draggable="true"
                            data-group-id={groupView.group.id}
                            onDragStart={(e) => handleGroupDragStart(e, groupView.group.id)}
                            onClick={(e) => {
                              e.stopPropagation();
                              selectGroup(groupView.group.id);
                            }}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            {groupView.group.name}
                            <button
                              type="button"
                              class="chip-action"
                              onClick={(e) => {
                                e.stopPropagation();
                                dispatch({ type: "unseatGroup", groupId: groupView.group.id });
                              }}
                            >
                              ×
                            </button>
                          </div>
                        )}
                      </For>
                    </div>
                  </section>
                );
              }}
            </For>
          </div>
        </section>

        <aside class="panel right-panel">
          <div class="panel-section">
            <div class="section-head">
              <h2>Inspector</h2>
            </div>
            {(() => {
              const groupView = selectedGroup();
              if (groupView) {
                return (
                  <div class="detail-card">
                    <strong>Group</strong>
                    <label>
                      Name
                      <input value={groupView.group.name} onInput={(e) => updateGroupName(groupView.group.id, e.currentTarget.value)} />
                    </label>
                    <div class="muted">Members: {groupView.guests.map((guest) => guest.name).join(", ")}</div>
                    <div class="muted">Table: {groupView.tableId ? tables().find((table) => table.table.id === groupView.tableId)?.table.name : "Unassigned"}</div>
                    <div class="muted">Issues: {groupView.conflictCount}</div>
                    <label>
                      Group notes
                      <textarea value={groupView.group.notes} onInput={(e) => updateGroupNotes(groupView.group.id, e.currentTarget.value)} />
                    </label>
                    <div class="card-actions">
                      <button
                        type="button"
                        class="secondary"
                        onClick={() => {
                          if (groupView.tableId) dispatch({ type: "unseatGroup", groupId: groupView.group.id });
                          else seatSelectedGroup();
                        }}
                      >
                        {state().assignments[groupView.group.id] ? "Unseat" : selectedTable() ? `Seat at ${selectedTable()!.table.name}` : "Seat group"}
                      </button>
                    </div>
                    <div class="constraint-panel">
                      <label>
                        Add must-sit constraint
                        <select
                          onChange={(e) => {
                            const target = e.currentTarget.value;
                            if (target) addConstraint(groupView.group.id, "mustSitWith", target);
                            e.currentTarget.value = "";
                          }}
                        >
                          <option value="">Choose group</option>
                          <For each={groups().filter((item) => item.group.id !== groupView.group.id)}>
                            {(candidate) => <option value={candidate.group.id}>{candidate.group.name}</option>}
                          </For>
                        </select>
                      </label>
                      <label>
                        Add keep-apart constraint
                        <select
                          onChange={(e) => {
                            const target = e.currentTarget.value;
                            if (target) addConstraint(groupView.group.id, "mustNotSitWith", target);
                            e.currentTarget.value = "";
                          }}
                        >
                          <option value="">Choose group</option>
                          <For each={groups().filter((item) => item.group.id !== groupView.group.id)}>
                            {(candidate) => <option value={candidate.group.id}>{candidate.group.name}</option>}
                          </For>
                        </select>
                      </label>
                      <div class="constraint-list">
                        <For each={groupView.group.mustSitWith}>
                          {(targetId) => {
                            const target = groups().find((candidate) => candidate.group.id === targetId);
                            return (
                              <button type="button" class="constraint-pill" onClick={() => removeConstraint(groupView.group.id, "mustSitWith", targetId)}>
                                must sit with {target?.group.name || targetId}
                              </button>
                            );
                          }}
                        </For>
                        <For each={groupView.group.mustNotSitWith}>
                          {(targetId) => {
                            const target = groups().find((candidate) => candidate.group.id === targetId);
                            return (
                              <button type="button" class="constraint-pill" onClick={() => removeConstraint(groupView.group.id, "mustNotSitWith", targetId)}>
                                keep apart {target?.group.name || targetId}
                              </button>
                            );
                          }}
                        </For>
                      </div>
                    </div>
                    <div class="member-list">
                      <For each={groupView.guests}>
                        {(guest) => (
                          <div class="member-row">
                            <input value={guest.name} onInput={(e) => updateGuest(guest.id, e.currentTarget.value, guest.kind, guest.notes)} />
                            <select onChange={(e) => updateGuest(guest.id, guest.name, e.currentTarget.value as GuestKind, guest.notes)} value={guest.kind}>
                              <option value="adult">adult</option>
                              <option value="kid">kid</option>
                              <option value="teen">teen</option>
                              <option value="other">other</option>
                            </select>
                            <input
                              value={guest.notes}
                              onInput={(e) => updateGuest(guest.id, guest.name, guest.kind, e.currentTarget.value)}
                              placeholder="Member notes"
                            />
                          </div>
                        )}
                      </For>
                    </div>
                  </div>
                );
              }

              const tableView = selectedTable();
              if (tableView) {
                return (
                  <div class="detail-card">
                    <strong>Table</strong>
                    <label>
                      Name
                      <input
                        value={tableNameDraft()?.tableId === tableView.table.id ? tableNameDraft()!.value : tableView.table.name}
                        onFocus={() => beginTableNameEdit(tableView.table.id, tableView.table.name)}
                        onInput={(e) => setDraftTableName(tableView.table.id, e.currentTarget.value)}
                        onBlur={() => commitTableNameEdit(tableView.table.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.currentTarget.blur();
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            cancelTableNameEdit(tableView.table.id);
                            e.currentTarget.blur();
                          }
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </label>
                    <label>
                      Capacity
                      <input
                        type="number"
                        min="1"
                        value={tableView.table.capacity}
                        onInput={(e) => updateTableCapacity(tableView.table.id, Number.parseInt(e.currentTarget.value, 10))}
                        onMouseDown={(e) => e.stopPropagation()}
                        onClick={(e) => e.stopPropagation()}
                      />
                    </label>
                    <div class="muted">
                      Used: {tableView.used} / {tableView.table.capacity}
                    </div>
                    <div class="muted">Groups: {tableView.groups.map((group) => group.group.name).join(", ") || "None"}</div>
                  </div>
                );
              }

              return <p class="empty-state">Select a group or table.</p>;
            })()}
          </div>

          <div class="panel-section">
            <div class="section-head">
              <h3>Conflicts</h3>
              <span class="badge">{conflicts().length}</span>
            </div>
            <div class="conflict-list">
              <For each={conflicts()}>
              {(issue) => (
                  <button
                    class={`conflict-item ${issue.severity}`}
                    onClick={() => {
                      const groupId = issue.groupIds[0];
                      const tableId = issue.tableIds[0];
                      if (groupId && groups().some((item) => item.group.id === groupId)) selectGroup(groupId);
                      else if (tableId && tables().some((item) => item.table.id === tableId)) selectTable(tableId);
                    }}
                  >
                    {issue.message}
                  </button>
                )}
              </For>
            </div>
          </div>
        </aside>
      </main>

      {status() ? <div class={`status-bar visible ${status()!.type}`}>{status()!.message}</div> : null}
    </div>
  );
}
