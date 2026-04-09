document.addEventListener("DOMContentLoaded", () => {
  const STORAGE_KEY = "weddingTablePlanner.state";
  const STATE_VERSION = 2;

  const els = {
    guestNameInput: qs("#guestNameInput"),
    guestSizeInput: qs("#guestSizeInput"),
    guestGroupInput: qs("#guestGroupInput"),
    addGuestBtn: qs("#addGuestBtn"),
    guestSearchInput: qs("#guestSearchInput"),
    importCsvInput: qs("#importCsvInput"),
    exportCsvBtn: qs("#exportCsvBtn"),
    exportJsonBtn: qs("#exportJsonBtn"),
    importJsonBtn: qs("#importJsonBtn"),
    jsonImportInput: qs("#jsonImportInput"),
    clearAllBtn: qs("#clearAllBtn"),
    tableCountInput: qs("#tableCountInput"),
    defaultCapacityInput: qs("#defaultCapacityInput"),
    applyTableDefaultsBtn: qs("#applyTableDefaultsBtn"),
    guestList: qs("#guestList"),
    tableCanvas: qs("#tableCanvas"),
    inspector: qs("#inspector"),
    conflictList: qs("#conflictList"),
    statusBar: qs("#statusBar"),
    guestCountBadge: qs("#guestCountBadge"),
    unassignedCountBadge: qs("#unassignedCountBadge"),
    tableCountBadge: qs("#tableCountBadge"),
    conflictBadge: qs("#conflictBadge"),
    statTotalGuests: qs("#statTotalGuests"),
    statAssignedGuests: qs("#statAssignedGuests"),
    statUnassignedGuests: qs("#statUnassignedGuests"),
    statTotalSeats: qs("#statTotalSeats"),
    statSeatsRemaining: qs("#statSeatsRemaining"),
    statConflicts: qs("#statConflicts"),
  };

  let state = loadState();
  let dragTable = null;
  let dragOffset = { x: 0, y: 0 };
  let saveTimer = null;
  let statusTimer = null;

  bindEvents();
  render();
  persist(true);

  function qs(sel) {
    return document.querySelector(sel);
  }

  function uid(prefix) {
    return `${prefix}_${crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(16).slice(2)}`}`;
  }

  function defaultState() {
    return {
      version: STATE_VERSION,
      config: { defaultTableCount: 6, defaultTableCapacity: 10, search: "" },
      guests: [],
      tables: seedTables(6, 10),
      assignments: {},
      ui: { selectedGuestId: null, selectedTableId: null },
    };
  }

  function seedTables(count, capacity) {
    const tables = [];
    for (let i = 0; i < count; i += 1) {
      tables.push({
        id: uid("table"),
        name: `Table ${i + 1}`,
        capacity,
        position: { left: 24 + (i % 4) * 330, top: 24 + Math.floor(i / 4) * 220 },
      });
    }
    return tables;
  }

  function loadState() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    try {
      const parsed = JSON.parse(raw);
      return migrateState(parsed);
    } catch {
      return defaultState();
    }
  }

  function migrateState(input) {
    const base = defaultState();
    if (!input || typeof input !== "object") return base;
    const version = Number(input.version || 0);
    const guests = Array.isArray(input.guests) ? input.guests.map(normalizeGuest).filter(Boolean) : [];
    const tables = Array.isArray(input.tables) ? input.tables.map(normalizeTable).filter(Boolean) : [];
    const assignments = isRecord(input.assignments) ? { ...input.assignments } : {};
    const ui = isRecord(input.ui) ? { ...base.ui, ...input.ui } : base.ui;
    const config = isRecord(input.config) ? { ...base.config, ...input.config } : base.config;

    const migrated = {
      version: STATE_VERSION,
      config: {
        defaultTableCount: clampInt(config.defaultTableCount, 1, 200, base.config.defaultTableCount),
        defaultTableCapacity: clampInt(config.defaultTableCapacity, 1, 200, base.config.defaultTableCapacity),
        search: typeof config.search === "string" ? config.search : "",
      },
      guests,
      tables: tables.length ? tables : seedTables(base.config.defaultTableCount, base.config.defaultTableCapacity),
      assignments,
      ui: {
        selectedGuestId: typeof ui.selectedGuestId === "string" ? ui.selectedGuestId : null,
        selectedTableId: typeof ui.selectedTableId === "string" ? ui.selectedTableId : null,
      },
    };

    migrated.tables = ensureTableShape(migrated.tables, migrated.config.defaultTableCount, migrated.config.defaultTableCapacity);
    migrated.assignments = normalizeAssignments(migrated.assignments, migrated.guests, migrated.tables);
    if (version < STATE_VERSION) migrated.version = STATE_VERSION;
    return migrated;
  }

  function normalizeGuest(raw) {
    if (!isRecord(raw)) return null;
    const name = String(raw.name || raw.label || "").trim();
    if (!name) return null;
    return {
      id: String(raw.id || uid("guest")),
      name,
      size: clampInt(raw.size ?? raw.count, 1, 99, 1),
      groupId: raw.groupId ? String(raw.groupId) : (raw.group ? String(raw.group) : ""),
      mustSitWith: normalizeIdList(raw.mustSitWith),
      mustNotSitWith: normalizeIdList(raw.mustNotSitWith),
      notes: typeof raw.notes === "string" ? raw.notes.trim() : "",
    };
  }

  function normalizeTable(raw, index = 0) {
    if (!isRecord(raw)) return null;
    return {
      id: String(raw.id || uid("table")),
      name: String(raw.name || `Table ${index + 1}`).trim() || `Table ${index + 1}`,
      capacity: clampInt(raw.capacity ?? raw.seats ?? 10, 1, 200, 10),
      position: normalizePosition(raw.position),
    };
  }

  function ensureTableShape(tables, defaultCount, defaultCapacity) {
    const normalized = tables.map((t, index) => normalizeTable(t, index)).filter(Boolean);
    while (normalized.length < defaultCount) {
      normalized.push({
        id: uid("table"),
        name: `Table ${normalized.length + 1}`,
        capacity: defaultCapacity,
        position: { left: 24 + (normalized.length % 4) * 330, top: 24 + Math.floor(normalized.length / 4) * 220 },
      });
    }
    return normalized;
  }

  function normalizeAssignments(assignments, guests, tables) {
    const guestIds = new Set(guests.map((g) => g.id));
    const tableIds = new Set(tables.map((t) => t.id));
    const result = {};
    for (const [guestId, tableId] of Object.entries(assignments || {})) {
      if (!guestIds.has(guestId)) continue;
      result[guestId] = tableId && tableIds.has(tableId) ? tableId : null;
    }
    for (const guest of guests) {
      if (!Object.prototype.hasOwnProperty.call(result, guest.id)) result[guest.id] = null;
    }
    return result;
  }

  function normalizeIdList(value) {
    if (Array.isArray(value)) return [...new Set(value.map((id) => String(id).trim()).filter(Boolean))];
    if (typeof value === "string") {
      return [...new Set(value.split(/[;,|]/).map((id) => id.trim()).filter(Boolean))];
    }
    return [];
  }

  function normalizePosition(position) {
    if (!isRecord(position)) return { left: 24, top: 24 };
    return {
      left: clampInt(position.left, -2000, 5000, 24),
      top: clampInt(position.top, -2000, 5000, 24),
    };
  }

  function isRecord(value) {
    return value && typeof value === "object" && !Array.isArray(value);
  }

  function clampInt(value, min, max, fallback) {
    const n = Number.parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  }

  function bindEvents() {
    els.addGuestBtn.addEventListener("click", addGuestFromForm);
    els.guestNameInput.addEventListener("keydown", handleFormEnter);
    els.guestSizeInput.addEventListener("keydown", handleFormEnter);
    els.guestGroupInput.addEventListener("keydown", handleFormEnter);
    els.guestSearchInput.addEventListener("input", () => {
      updateState((draft) => {
        draft.config.search = els.guestSearchInput.value;
      });
    });
    els.importCsvInput.addEventListener("change", importCsvFromFile);
    els.exportCsvBtn.addEventListener("click", exportCsv);
    els.exportJsonBtn.addEventListener("click", exportJson);
    els.importJsonBtn.addEventListener("click", () => els.jsonImportInput.click());
    els.jsonImportInput.addEventListener("change", importJsonFromFile);
    els.clearAllBtn.addEventListener("click", clearAllSeating);
    els.applyTableDefaultsBtn.addEventListener("click", applyTableDefaults);
    els.tableCanvas.addEventListener("click", handleCanvasClick);
    els.tableCanvas.addEventListener("dragover", (event) => {
      const zone = event.target.closest("[data-table-dropzone]");
      if (!zone) return;
      event.preventDefault();
      zone.classList.add("drag-over");
    });
    els.tableCanvas.addEventListener("dragleave", (event) => {
      const zone = event.target.closest("[data-table-dropzone]");
      if (zone) zone.classList.remove("drag-over");
    });
    els.tableCanvas.addEventListener("drop", handleDrop);
    els.tableCanvas.addEventListener("mousedown", startTableDrag);
    els.tableCanvas.addEventListener("dragstart", handleTableGuestDragStart);
    els.guestList.addEventListener("click", handleGuestListClick);
    els.guestList.addEventListener("dragstart", handleGuestDragStart);
    els.guestList.addEventListener("dragover", (event) => event.preventDefault());
    els.guestList.addEventListener("drop", handleGuestListDrop);
    els.conflictList.addEventListener("click", handleConflictListClick);
    els.inspector.addEventListener("click", handleInspectorClick);
    document.addEventListener("input", handleDocumentInput);
  }

  function handleFormEnter(event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    addGuestFromForm();
  }

  function addGuestFromForm() {
    const name = els.guestNameInput.value.trim();
    const size = clampInt(els.guestSizeInput.value, 1, 99, 0);
    const groupId = els.guestGroupInput.value.trim();
    if (!name || !size) return showStatus("Enter a guest name and size.", "error");
    updateState((draft) => {
      const duplicate = draft.guests.some((guest) => normalizeText(guest.name) === normalizeText(name));
      draft.guests.push({
        id: uid("guest"),
        name,
        size,
        groupId,
        mustSitWith: [],
        mustNotSitWith: [],
        notes: "",
      });
      if (duplicate) draft.ui.selectedGuestId = draft.guests[draft.guests.length - 1].id;
    });
    els.guestNameInput.value = "";
    els.guestSizeInput.value = "";
    els.guestGroupInput.value = "";
    els.guestNameInput.focus();
  }

  function handleGuestListClick(event) {
    const card = event.target.closest("[data-guest-id]");
    if (!card) return;
    selectGuest(card.dataset.guestId);
  }

  function handleCanvasClick(event) {
    const tableCard = event.target.closest("[data-table-id]");
    if (!tableCard) return;
    const tableId = tableCard.dataset.tableId;
    const guestButton = event.target.closest("[data-remove-guest-id]");
    if (guestButton) {
      unassignGuest(guestButton.dataset.removeGuestId);
      return;
    }
    selectTable(tableId);
  }

  function handleInspectorClick(event) {
    const action = event.target.closest("[data-inspector-action]");
    if (!action) return;
    const { inspectorAction, targetId } = action.dataset;
    if (inspectorAction === "delete-guest" && targetId) {
      deleteGuest(targetId);
      return;
    }
    if (inspectorAction === "select-guest") selectGuest(targetId);
    if (inspectorAction === "select-table") selectTable(targetId);
  }

  function handleDocumentInput(event) {
    const { target } = event;
    const guestId = target.closest?.("[data-edit-guest-id]")?.dataset.editGuestId;
    if (guestId) {
      updateGuestFromInspector(guestId);
      return;
    }
    const tableId = target.closest?.("[data-edit-table-id]")?.dataset.editTableId;
    if (tableId) {
      updateTableFromInspector(tableId);
    }
  }

  function handleGuestDragStart(event) {
    const card = event.target.closest("[draggable='true']");
    if (!card?.dataset.guestId) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: "guest", id: card.dataset.guestId, source: "guest-list" }));
    event.dataTransfer.effectAllowed = "move";
  }

  function handleTableGuestDragStart(event) {
    const chip = event.target.closest("[data-guest-chip]");
    if (!chip) return;
    event.dataTransfer.setData("text/plain", JSON.stringify({ type: "guest", id: chip.dataset.guestChip, source: "table" }));
    event.dataTransfer.effectAllowed = "move";
  }

  function startTableDrag(event) {
    const tableCard = event.target.closest("[data-table-id]");
    if (!tableCard || event.target.closest("input, button, textarea, .table-guest")) return;
    event.preventDefault();
    dragTable = tableCard;
    const rect = tableCard.getBoundingClientRect();
    const canvasRect = els.tableCanvas.getBoundingClientRect();
    dragOffset = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      canvasLeft: canvasRect.left + els.tableCanvas.scrollLeft,
      canvasTop: canvasRect.top + els.tableCanvas.scrollTop,
    };
    tableCard.classList.add("dragging");
    document.addEventListener("mousemove", moveTable);
    document.addEventListener("mouseup", stopTableDrag);
  }

  function moveTable(event) {
    if (!dragTable) return;
    const canvasRect = els.tableCanvas.getBoundingClientRect();
    const left = event.clientX - canvasRect.left + els.tableCanvas.scrollLeft - dragOffset.x;
    const top = event.clientY - canvasRect.top + els.tableCanvas.scrollTop - dragOffset.y;
    dragTable.style.left = `${Math.max(-20, left)}px`;
    dragTable.style.top = `${Math.max(-20, top)}px`;
  }

  function stopTableDrag() {
    if (!dragTable) return;
    const tableId = dragTable.dataset.tableId;
    const left = Number.parseInt(dragTable.style.left, 10) || 24;
    const top = Number.parseInt(dragTable.style.top, 10) || 24;
    updateState((draft) => {
      const table = draft.tables.find((item) => item.id === tableId);
      if (table) table.position = { left, top };
    }, false);
    dragTable.classList.remove("dragging");
    dragTable = null;
    document.removeEventListener("mousemove", moveTable);
    document.removeEventListener("mouseup", stopTableDrag);
    render();
  }

  function handleDrop(event) {
    const zone = event.target.closest("[data-table-dropzone]");
    if (!zone) return;
    event.preventDefault();
    zone.classList.remove("drag-over");
    zone.closest(".table-card")?.classList.remove("drag-over");
    const payload = safeParse(event.dataTransfer.getData("text/plain"));
    if (!payload) return;
    if (payload.type === "guest") {
      assignGuestToTable(payload.id, zone.dataset.tableDropzone);
    }
  }

  function handleGuestListDrop(event) {
    event.preventDefault();
    const payload = safeParse(event.dataTransfer.getData("text/plain"));
    if (payload?.type === "guest") unassignGuest(payload.id);
  }

  function handleConflictListClick(event) {
    const item = event.target.closest("[data-conflict-guest-id],[data-conflict-table-id]");
    if (!item) return;
    const guestId = item.dataset.conflictGuestId;
    const tableId = item.dataset.conflictTableId;
    if (guestId) selectGuest(guestId);
    else if (tableId) selectTable(tableId);
  }

  function safeParse(raw) {
    try { return JSON.parse(raw); } catch { return null; }
  }

  function updateState(mutator, shouldRender = true) {
    const draft = structuredClone(state);
    mutator(draft);
    draft.version = STATE_VERSION;
    draft.tables = ensureTableShape(draft.tables, draft.config.defaultTableCount, draft.config.defaultTableCapacity);
    draft.assignments = normalizeAssignments(draft.assignments, draft.guests, draft.tables);
    state = draft;
    if (shouldRender) render();
    persist();
  }

  function persist(immediate = false) {
    clearTimeout(saveTimer);
    const commit = () => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      } catch {
        showStatus("Could not save planner state.", "error");
      }
    };
    if (immediate) commit();
    else saveTimer = setTimeout(commit, 120);
  }

  function render() {
    const search = normalizeText(state.config.search);
    const guests = state.guests
      .filter((guest) => !state.assignments[guest.id])
      .filter((guest) => !search || normalizeText(guest.name).includes(search) || normalizeText(guest.groupId).includes(search))
      .sort((a, b) => a.name.localeCompare(b.name));
    const assignments = state.assignments;
    const metrics = getMetrics();
    renderStats(metrics);
    renderGuestList(guests, assignments, metrics);
    renderTables(metrics);
    renderInspector();
    renderConflictList(metrics.conflicts);
    els.guestSearchInput.value = state.config.search;
    els.tableCountInput.value = String(state.tables.length);
    els.defaultCapacityInput.value = String(state.config.defaultTableCapacity);
    els.tableCanvas.querySelectorAll(".table-guests.drag-over").forEach((node) => node.classList.remove("drag-over"));
    els.tableCanvas.querySelectorAll(".table-card.drag-over").forEach((node) => node.classList.remove("drag-over"));
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function getMetrics() {
    const tableMap = new Map(state.tables.map((table) => [table.id, table]));
    const guestMap = new Map(state.guests.map((guest) => [guest.id, guest]));
    const tableGuests = new Map(state.tables.map((table) => [table.id, []]));
    let assignedSeats = 0;

    for (const guest of state.guests) {
      const tableId = state.assignments[guest.id];
      if (tableId && tableGuests.has(tableId)) {
        tableGuests.get(tableId).push(guest);
        assignedSeats += guest.size;
      }
    }

    const tableStates = state.tables.map((table) => {
      const seated = tableGuests.get(table.id) || [];
      const used = seated.reduce((sum, guest) => sum + guest.size, 0);
      return { ...table, used, remaining: table.capacity - used, guests: seated };
    });

    const conflicts = detectConflicts(state.guests, state.assignments, tableMap, guestMap);
    const conflictCounts = summarizeConflicts(conflicts);
    const totalGuests = state.guests.reduce((sum, guest) => sum + guest.size, 0);
    const totalSeats = state.tables.reduce((sum, table) => sum + table.capacity, 0);
    const unassignedGuests = state.guests.filter((guest) => !state.assignments[guest.id]).reduce((sum, guest) => sum + guest.size, 0);
    return {
      tableStates,
      conflicts,
      totalGuests,
      totalSeats,
      assignedSeats,
      unassignedGuests,
      seatsRemaining: totalSeats - assignedSeats,
      guestMap,
      tableMap,
      conflictCounts,
    };
  }

  function summarizeConflicts(conflicts) {
    const byGuest = new Map();
    const byTable = new Map();
    for (const conflict of conflicts) {
      for (const guestId of conflict.guests || []) {
        byGuest.set(guestId, (byGuest.get(guestId) || 0) + 1);
      }
      for (const tableId of conflict.tables || []) {
        byTable.set(tableId, (byTable.get(tableId) || 0) + 1);
      }
    }
    return { byGuest, byTable };
  }

  function detectConflicts(guests, assignments, tableMap, guestMap) {
    const issues = [];
    for (const guest of guests) {
      const tableId = assignments[guest.id];
      const table = tableMap.get(tableId);
      for (const otherId of guest.mustSitWith) {
        const other = guestMap.get(otherId);
        if (!other) continue;
        const otherTable = assignments[other.id];
        if (!tableId || !otherTable || tableId !== otherTable) {
          issues.push({
            type: "must-sit",
            severity: "error",
            text: `${guest.name} must sit with ${other.name}.`,
            guests: [guest.id, other.id],
          });
        }
      }
      for (const otherId of guest.mustNotSitWith) {
        const other = guestMap.get(otherId);
        if (!other) continue;
        const otherTable = assignments[other.id];
        if (tableId && otherTable && tableId === otherTable) {
          issues.push({
            type: "keep-apart",
            severity: "error",
            text: `${guest.name} must be kept apart from ${other.name}.`,
            guests: [guest.id, other.id],
          });
        }
      }
      if (guest.groupId) {
        const groupMembers = guests.filter((candidate) => candidate.groupId && candidate.groupId === guest.groupId);
        const seatedTables = new Set(groupMembers.map((member) => assignments[member.id]).filter(Boolean));
        if (seatedTables.size > 1) {
          issues.push({
            type: "group",
            severity: "warn",
            text: `Group "${guest.groupId}" is split across tables.`,
            guests: groupMembers.map((member) => member.id),
          });
        }
      }
      if (table && table.capacity < (tableStateUsed(table.id, guests, assignments))) {
        issues.push({
          type: "capacity",
          severity: "error",
          text: `${table.name} is over capacity.`,
          tables: [table.id],
        });
      }
    }
    return dedupeConflicts(issues);
  }

  function tableStateUsed(tableId, guests, assignments) {
    return guests.filter((guest) => assignments[guest.id] === tableId).reduce((sum, guest) => sum + guest.size, 0);
  }

  function dedupeConflicts(conflicts) {
    const seen = new Set();
    return conflicts.filter((item) => {
      const key = `${item.type}:${item.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function renderStats(metrics) {
    els.statTotalGuests.textContent = String(metrics.totalGuests);
    els.statAssignedGuests.textContent = String(metrics.assignedSeats);
    els.statUnassignedGuests.textContent = String(metrics.unassignedGuests);
    els.statTotalSeats.textContent = String(metrics.totalSeats);
    els.statSeatsRemaining.textContent = String(metrics.seatsRemaining);
    els.statConflicts.textContent = String(metrics.conflicts.length);
    els.guestCountBadge.textContent = String(state.guests.length);
    els.unassignedCountBadge.textContent = String(metrics.unassignedGuests);
    els.tableCountBadge.textContent = String(state.tables.length);
    els.conflictBadge.textContent = String(metrics.conflicts.length);
  }

  function renderGuestList(guests, assignments, metrics) {
    els.guestList.innerHTML = "";
    if (!guests.length) {
      els.guestList.innerHTML = '<div class="empty-state">No guests match the current search.</div>';
      return;
    }
    for (const guest of guests) {
      const card = document.createElement("div");
      card.className = "guest-card";
      card.draggable = true;
      card.dataset.guestId = guest.id;
      if (state.ui.selectedGuestId === guest.id) card.classList.add("selected");
      const issueCount = metrics.conflictCounts.byGuest.get(guest.id) || 0;
      card.innerHTML = `
        <div>
          <strong>${escapeHtml(guest.name)}</strong>
          <div class="guest-meta">${guest.size} seat${guest.size > 1 ? "s" : ""}${guest.groupId ? ` • ${escapeHtml(guest.groupId)}` : ""}${issueCount ? ` • ${issueCount} issue${issueCount > 1 ? "s" : ""}` : ""}</div>
        </div>
      `;
      els.guestList.appendChild(card);
    }
  }

  function renderTables(metrics) {
    els.tableCanvas.innerHTML = "";
    for (const table of metrics.tableStates) {
      const card = document.createElement("section");
      card.className = "table-card";
      card.draggable = true;
      card.dataset.tableId = table.id;
      card.dataset.editTableId = table.id;
      card.style.left = `${table.position.left}px`;
      card.style.top = `${table.position.top}px`;
      if (state.ui.selectedTableId === table.id) card.classList.add("selected");
      if (table.used > table.capacity) card.classList.add("over-capacity");
      const conflictCount = metrics.conflictCounts.byTable.get(table.id) || 0;
      card.dataset.tableDropzone = table.id;
      card.innerHTML = `
        <div class="table-head">
          <div style="flex:1">
            <input data-edit-table-id="${table.id}" data-field="name" value="${escapeAttr(table.name)}" aria-label="Table name" />
          </div>
          <button data-action="select-table" data-table-id="${table.id}" class="secondary">Inspect</button>
        </div>
        <div class="table-summary ${table.used > table.capacity ? "over-capacity" : ""}">${table.used} / ${table.capacity} seats used${conflictCount ? ` • ${conflictCount} issue${conflictCount > 1 ? "s" : ""}` : ""}</div>
        <div class="card-actions" style="margin:10px 0">
          <input data-edit-table-id="${table.id}" data-field="capacity" type="number" min="1" step="1" value="${table.capacity}" aria-label="Table capacity" />
        </div>
        <div class="table-guests" data-table-dropzone="1" data-table-dropzone-id="${table.id}">
          ${table.guests
              .map(
                (guest) => `
                <span class="table-guest" draggable="true" data-guest-chip="${guest.id}">
                  ${escapeHtml(guest.name)} (${guest.size})
                  <button type="button" data-remove-guest-id="${guest.id}" aria-label="Unassign ${escapeAttr(guest.name)}">×</button>
                </span>
              `,
            )
            .join("")}
        </div>
      `;
      card.querySelector("[data-table-dropzone]").dataset.tableDropzone = table.id;
      els.tableCanvas.appendChild(card);
    }
    if (!metrics.tableStates.length) {
      els.tableCanvas.innerHTML = '<div class="empty-state">No tables yet. Add some in the defaults panel.</div>';
    }
  }

  function renderInspector() {
    const guest = state.guests.find((item) => item.id === state.ui.selectedGuestId) || null;
    const table = state.tables.find((item) => item.id === state.ui.selectedTableId) || null;
    const metrics = getMetrics();
    const relatedConflicts = metrics.conflicts.filter((conflict) =>
      conflict.guests?.includes(guest?.id) || conflict.tables?.includes(table?.id),
    );

    if (guest) {
      els.inspector.innerHTML = `
        <div class="detail-card" data-edit-guest-id="${guest.id}">
          <div class="section-head">
            <strong>Edit guest</strong>
            <button data-inspector-action="select-table" data-target-id="" class="secondary" style="display:none"></button>
          </div>
          <label>Name<input data-edit-guest-id="${guest.id}" data-field="name" value="${escapeAttr(guest.name)}" /></label>
          <label>Size<input data-edit-guest-id="${guest.id}" data-field="size" type="number" min="1" step="1" value="${guest.size}" /></label>
          <label>Group<input data-edit-guest-id="${guest.id}" data-field="groupId" value="${escapeAttr(guest.groupId)}" placeholder="Optional group" /></label>
          <label>Must sit with<textarea data-edit-guest-id="${guest.id}" data-field="mustSitWith" rows="2" placeholder="Comma-separated guest names">${escapeHtml(resolveRelationshipLabels(guest.mustSitWith).join(", "))}</textarea></label>
          <label>Keep apart<textarea data-edit-guest-id="${guest.id}" data-field="mustNotSitWith" rows="2" placeholder="Comma-separated guest names">${escapeHtml(resolveRelationshipLabels(guest.mustNotSitWith).join(", "))}</textarea></label>
          <label>Notes<textarea data-edit-guest-id="${guest.id}" data-field="notes" rows="3">${escapeHtml(guest.notes || "")}</textarea></label>
          <div class="guest-actions">
            <button class="secondary" data-inspector-action="select-guest" data-target-id="${guest.id}">Selected</button>
            <button class="danger" data-inspector-action="delete-guest" data-target-id="${guest.id}">Delete</button>
          </div>
          <p class="muted">Use exact names. Relationships resolve to IDs on save.</p>
          <div class="muted">${relationshipSummary(guest, metrics)}</div>
        </div>
        <div class="detail-card">
          <strong>Guest issues</strong>
          ${relatedConflicts.length ? `<div class="conflict-list">${relatedConflicts.map(renderConflictItem).join("")}</div>` : '<p class="muted">No conflicts for this guest.</p>'}
        </div>
      `;
      return;
    }

    if (table) {
      const seated = metrics.tableStates.find((item) => item.id === table.id) || table;
      els.inspector.innerHTML = `
        <div class="detail-card" data-edit-table-id="${table.id}">
          <strong>Edit table</strong>
          <label>Name<input data-edit-table-id="${table.id}" data-field="name" value="${escapeAttr(table.name)}" /></label>
          <label>Capacity<input data-edit-table-id="${table.id}" data-field="capacity" type="number" min="1" step="1" value="${table.capacity}" /></label>
          <label>X<input data-edit-table-id="${table.id}" data-field="left" type="number" value="${table.position.left}" /></label>
          <label>Y<input data-edit-table-id="${table.id}" data-field="top" type="number" value="${table.position.top}" /></label>
          <div class="card-actions">
            <button data-action="select-table" data-inspector-action="select-table" data-target-id="${table.id}" class="secondary">Selected</button>
          </div>
          <p class="muted">${seated.used} used / ${table.capacity} capacity</p>
          <p class="muted">${metrics.conflictCounts.byTable.get(table.id) || 0} conflict(s) linked to this table</p>
        </div>
        <div class="detail-card">
          <strong>Seated guests</strong>
          ${
            seated.guests.length
              ? seated.guests.map((guest) => `<div class="muted">${escapeHtml(guest.name)} (${guest.size})</div>`).join("")
              : '<p class="muted">No guests seated here.</p>'
          }
        </div>
      `;
      return;
    }

    els.inspector.innerHTML = `
      <div class="empty-state">
        <p>Select a guest or table to edit details and review conflicts.</p>
      </div>
    `;
  }

  function resolveRelationshipLabels(ids) {
    return ids
      .map((id) => state.guests.find((guest) => guest.id === id)?.name || id)
      .filter(Boolean);
  }

  function relationshipSummary(guest, metrics) {
    const seatedTable = state.assignments[guest.id];
    const must = resolveRelationshipLabels(guest.mustSitWith).join(", ") || "none";
    const apart = resolveRelationshipLabels(guest.mustNotSitWith).join(", ") || "none";
    const conflictCount = metrics.conflictCounts.byGuest.get(guest.id) || 0;
    const group = guest.groupId || "none";
    return `Group: ${escapeHtml(group)} · Must sit with: ${escapeHtml(must)} · Keep apart: ${escapeHtml(apart)} · Issues: ${conflictCount}${seatedTable ? "" : " · Unassigned"}`;
  }

  function renderConflictList(conflicts) {
    els.conflictList.innerHTML = conflicts.length
      ? conflicts.map(renderConflictItem).join("")
      : '<div class="empty-state">No conflicts detected.</div>';
  }

  function renderConflictItem(conflict) {
    const guestId = conflict.guests?.[0] || "";
    const tableId = conflict.tables?.[0] || "";
    const targetAttr = guestId
      ? `data-conflict-guest-id="${escapeAttr(guestId)}"`
      : tableId
        ? `data-conflict-table-id="${escapeAttr(tableId)}"`
        : "";
    const meta = guestId
      ? "Select related guest"
      : tableId
        ? "Select related table"
        : "Conflict";
    return `<button type="button" class="conflict-item ${conflict.severity}" ${targetAttr}><strong>${escapeHtml(conflict.text)}</strong><span class="muted">${meta}</span></button>`;
  }

  function selectGuest(guestId) {
    updateState((draft) => {
      draft.ui.selectedGuestId = guestId;
      draft.ui.selectedTableId = null;
    });
  }

  function selectTable(tableId) {
    updateState((draft) => {
      draft.ui.selectedTableId = tableId;
      draft.ui.selectedGuestId = null;
    });
  }

  function deleteGuest(guestId) {
    updateState((draft) => {
      draft.guests = draft.guests.filter((guest) => guest.id !== guestId);
      delete draft.assignments[guestId];
      for (const guest of draft.guests) {
        guest.mustSitWith = guest.mustSitWith.filter((id) => id !== guestId);
        guest.mustNotSitWith = guest.mustNotSitWith.filter((id) => id !== guestId);
      }
      if (draft.ui.selectedGuestId === guestId) draft.ui.selectedGuestId = null;
    });
    showStatus("Guest deleted.", "success");
  }

  function assignGuestToTable(guestId, tableId) {
    updateState((draft) => {
      const guest = draft.guests.find((item) => item.id === guestId);
      const table = draft.tables.find((item) => item.id === tableId);
      if (!guest || !table) return;
      const used = draft.guests.filter((item) => draft.assignments[item.id] === tableId).reduce((sum, item) => sum + item.size, 0);
      if (used + guest.size > table.capacity) {
        showStatus("That table is over capacity.", "warn");
      }
      draft.assignments[guestId] = tableId;
    });
  }

  function unassignGuest(guestId) {
    updateState((draft) => {
      draft.assignments[guestId] = null;
    });
  }

  function updateGuestFromInspector(guestId) {
    const guest = state.guests.find((item) => item.id === guestId);
    if (!guest) return;
    const root = els.inspector.querySelector(`[data-edit-guest-id="${guestId}"]`);
    if (!root) return;
    updateState((draft) => {
      const target = draft.guests.find((item) => item.id === guestId);
      if (!target) return;
      const get = (field) => root.querySelector(`[data-field="${field}"]`);
      target.name = get("name").value.trim() || target.name;
      target.size = clampInt(get("size").value, 1, 99, target.size);
      target.groupId = get("groupId").value.trim();
      target.mustSitWith = resolveRelationshipList(get("mustSitWith").value, draft.guests, guestId);
      target.mustNotSitWith = resolveRelationshipList(get("mustNotSitWith").value, draft.guests, guestId);
      target.notes = get("notes").value.trim();
    }, false);
    render();
  }

  function updateTableFromInspector(tableId) {
    const table = state.tables.find((item) => item.id === tableId);
    if (!table) return;
    const root = els.inspector.querySelector(`[data-edit-table-id="${tableId}"]`);
    if (!root) return;
    updateState((draft) => {
      const target = draft.tables.find((item) => item.id === tableId);
      if (!target) return;
      const get = (field) => root.querySelector(`[data-field="${field}"]`);
      target.name = get("name").value.trim() || target.name;
      target.capacity = clampInt(get("capacity").value, 1, 200, target.capacity);
      target.position = {
        left: clampInt(get("left").value, -2000, 5000, target.position.left),
        top: clampInt(get("top").value, -2000, 5000, target.position.top),
      };
    }, false);
    render();
  }

  function resolveRelationshipList(raw, guests, currentGuestId) {
    const names = String(raw || "")
      .split(/[,\n;]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    const lowerNameMap = new Map(
      guests.map((guest) => [normalizeText(guest.name), guest.id]),
    );
    return [...new Set(names.map((entry) => lowerNameMap.get(normalizeText(entry)) || entry).filter((id) => id !== currentGuestId))];
  }

  function applyTableDefaults() {
    const requestedCount = clampInt(els.tableCountInput.value, 1, 200, state.tables.length);
    const requestedCapacity = clampInt(els.defaultCapacityInput.value, 1, 200, state.config.defaultTableCapacity);
    updateState((draft) => {
      draft.config.defaultTableCount = requestedCount;
      draft.config.defaultTableCapacity = requestedCapacity;
      while (draft.tables.length < requestedCount) {
        draft.tables.push({
          id: uid("table"),
          name: `Table ${draft.tables.length + 1}`,
          capacity: requestedCapacity,
          position: { left: 24 + (draft.tables.length % 4) * 330, top: 24 + Math.floor(draft.tables.length / 4) * 220 },
        });
      }
      draft.tables.forEach((table) => {
        if (table.capacity <= 0) table.capacity = requestedCapacity;
      });
    });
    showStatus("Table defaults updated.", "success");
  }

  function clearAllSeating() {
    if (!confirm("Clear all guest assignments? Guests and tables will be kept.")) return;
    updateState((draft) => {
      for (const guestId of Object.keys(draft.assignments)) draft.assignments[guestId] = null;
    });
    showStatus("All seating cleared.", "success");
  }

  function importCsvFromFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = parseCsv(String(reader.result || ""));
        if (!imported.length) throw new Error("No guests found.");
        updateState((draft) => {
          for (const row of imported) {
            const name = row.name?.trim();
            const size = clampInt(row.size, 1, 99, 1);
            if (!name) continue;
            draft.guests.push({
              id: uid("guest"),
              name,
              size,
              groupId: row.group || row.groupId || "",
              mustSitWith: resolveTextList(row.mustSitWith),
              mustNotSitWith: resolveTextList(row.mustNotSitWith),
              notes: row.notes || "",
            });
          }
        });
        showStatus("CSV imported.", "success");
      } catch (error) {
        showStatus(error.message || "CSV import failed.", "error");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function exportCsv() {
    const rows = [
      ["name", "size", "group", "mustSitWith", "mustNotSitWith", "notes"],
      ...state.guests.map((guest) => [
        guest.name,
        String(guest.size),
        guest.groupId || "",
        guest.mustSitWith.join(";"),
        guest.mustNotSitWith.join(";"),
        guest.notes || "",
      ]),
    ];
    downloadText(csvSerialize(rows), "wedding-guests.csv", "text/csv");
  }

  function exportJson() {
    downloadText(JSON.stringify(state, null, 2), "wedding-table-plan.json", "application/json");
  }

  function importJsonFromFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ""));
        state = migrateState(parsed);
        render();
        persist(true);
        showStatus("JSON imported.", "success");
      } catch {
        showStatus("Could not import JSON.", "error");
      } finally {
        event.target.value = "";
      }
    };
    reader.readAsText(file);
  }

  function downloadText(text, filename, mime) {
    const blob = new Blob([text], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  function csvSerialize(rows) {
    return rows.map((row) => row.map(csvCell).join(",")).join("\n");
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  }

  function parseCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
    return lines.slice(1).filter(Boolean).map((line) => {
      const cells = parseCsvLine(line);
      const row = {};
      headers.forEach((header, index) => { row[header] = cells[index] ?? ""; });
      return {
        name: row.name || row.guest || row.fullname || "",
        size: row.size || row.count || "",
        group: row.group || row.groupid || "",
        mustSitWith: row.mustsitwith || row.must_sit_with || "",
        mustNotSitWith: row.mustnotsitwith || row.must_not_sit_with || "",
        notes: row.notes || "",
      };
    }).filter((row) => row.name);
  }

  function parseCsvLine(line) {
    const cells = [];
    let cell = "";
    let quoted = false;
    for (let i = 0; i < line.length; i += 1) {
      const char = line[i];
      if (quoted) {
        if (char === '"' && line[i + 1] === '"') { cell += '"'; i += 1; }
        else if (char === '"') quoted = false;
        else cell += char;
      } else if (char === '"') {
        quoted = true;
      } else if (char === ",") {
        cells.push(cell); cell = "";
      } else {
        cell += char;
      }
    }
    cells.push(cell);
    return cells;
  }

  function resolveTextList(value) {
    return String(value || "")
      .split(/[;,|]/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replaceAll("'", "&#39;");
  }

  function showStatus(message, type = "success") {
    clearTimeout(statusTimer);
    els.statusBar.textContent = message;
    els.statusBar.className = `status-bar visible ${type}`;
    statusTimer = setTimeout(() => {
      els.statusBar.className = "status-bar";
      els.statusBar.textContent = "";
    }, 2800);
  }
});
