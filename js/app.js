document.addEventListener("DOMContentLoaded", () => {
  // --- Load or initialize table settings from localStorage ---
  const storedTableConfig = JSON.parse(
    localStorage.getItem("tableConfig") || "null"
  );
  let numberOfTables = storedTableConfig
    ? storedTableConfig.numberOfTables
    : 20;
  let tableCapacity = storedTableConfig ? storedTableConfig.tableCapacity : 12;

  // Elements
  const guestsContainer = document.getElementById("guestsContainer");
  const tablesContainer = document.getElementById("tables");
  const clearAllBtn = document.getElementById("clearAll");
  const saveProgressBtn = document.getElementById("saveProgress");
  const statusMessage = document.getElementById("statusMessage");
  const guestInfoBtn = document.getElementById("guestInfoBtn");

  // Guest Editor Elements
  const guestNameInput = document.getElementById("guestNameInput");
  const guestCountInput = document.getElementById("guestCountInput");
  const addGuestBtn = document.getElementById("addGuestBtn");
  const guestEditorList = document.getElementById("guestEditorList");

  // Table Settings Elements
  const numTablesInput = document.getElementById("numTablesInput");
  const seatsPerTableInput = document.getElementById("seatsPerTableInput");
  const applyTableSettingsBtn = document.getElementById(
    "applyTableSettingsBtn"
  );

  // Track assigned guests
  const assignedGuests = new Set();

  // Track table positions
  let tablePositions = {};

  // Load or initialize dynamic guest list
  let guestList = loadGuestList();

  // Populate the table settings inputs
  numTablesInput.value = numberOfTables;
  seatsPerTableInput.value = tableCapacity;

  // INITIALIZE UI
  initializeTables();
  loadFromLocalStorage(); // will re-assign any previously saved seats
  renderGuestList();
  renderGuestEditor();

  // ---------- EVENT LISTENERS ----------

  // Clear All Tables button
  clearAllBtn.addEventListener("click", clearAllTables);

  // Save Progress button
  saveProgressBtn.addEventListener("click", () => {
    saveToLocalStorage(false);
  });

  // Guest Info button
  guestInfoBtn.addEventListener("click", showGuestInfo);

  // Guest Editor: click Add
  addGuestBtn.addEventListener("click", () => {
    attemptAddGuest();
  });

  // Allow pressing ENTER in either guestNameInput or guestCountInput to add
  guestNameInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      attemptAddGuest();
      // after adding, move focus to count so user can tab to name next:
      guestCountInput.focus();
    }
  });

  guestCountInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      attemptAddGuest();
      // after adding, put focus back on the name field:
      guestNameInput.focus();
      guestNameInput.select();
    }
  });

  // Table Settings: click Apply
  applyTableSettingsBtn.addEventListener("click", () => {
    const newNum = parseInt(numTablesInput.value);
    const newCap = parseInt(seatsPerTableInput.value);
    if (isNaN(newNum) || newNum < 1 || isNaN(newCap) || newCap < 1) {
      showStatus("Enter valid table settings!", "error");
      return;
    }
    // Overwrite with new settings (clears all seating!)
    numberOfTables = newNum;
    tableCapacity = newCap;
    localStorage.setItem(
      "tableConfig",
      JSON.stringify({ numberOfTables, tableCapacity })
    );
    rebuildAllTables();
    showStatus("Table settings updated!", "success");
  });

  // Setup drag & drop for seating
  setupDragAndDrop();

  // Setup dragging for tables
  setupDraggableTables();

  // Auto‐save after any drag/drop/table move
  document.addEventListener("dragend", silentSave);
  document.addEventListener("drop", silentSave);
  document.addEventListener("tableMove", silentSave);

  // ---------- GUEST LIST FUNCTIONS ----------

  function loadGuestList() {
    const raw = localStorage.getItem("editableGuestList");
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {}
    return [];
  }

  function saveGuestList() {
    localStorage.setItem("editableGuestList", JSON.stringify(guestList));
  }

  function renderGuestEditor() {
    guestEditorList.innerHTML = "";
    guestList.forEach((guest) => {
      const li = document.createElement("li");
      li.innerHTML = `
        <span>${guest.name} (${guest.count})</span>
        <button onclick="deleteGuest('${guest.id}')">×</button>
      `;
      guestEditorList.appendChild(li);
    });
  }

  // Expose deleteGuest so inline onclick works
  window.deleteGuest = function (id) {
    assignedGuests.delete(id);
    guestList = guestList.filter((g) => g.id !== id);
    saveGuestList();
    renderGuestList();
    renderGuestEditor();
    showStatus("Guest removed!", "success");
  };

  function attemptAddGuest() {
    const name = guestNameInput.value.trim();
    const count = parseInt(guestCountInput.value);
    if (!name || isNaN(count) || count < 1) {
      showStatus("Enter valid name and count!", "error");
      return;
    }
    const id = `guest-${Date.now()}`;
    guestList.push({ id, name, count });
    saveGuestList();
    renderGuestList();
    renderGuestEditor();
    guestNameInput.value = "";
    guestCountInput.value = "";
    showStatus("Guest added!", "success");
  }

  function renderGuestList() {
    guestsContainer.innerHTML = "";
    guestList.forEach((guest) => {
      if (assignedGuests.has(guest.id)) return;
      const guestElement = document.createElement("div");
      guestElement.className = "guest";
      guestElement.id = guest.id;
      guestElement.setAttribute("draggable", "true");
      guestElement.setAttribute("data-guest-id", guest.id);
      guestElement.setAttribute("data-count", guest.count);
      guestElement.textContent = `${guest.name} (${guest.count})`;
      guestsContainer.appendChild(guestElement);
    });
  }

  function findGuestInfo(guestId) {
    return guestList.find((g) => g.id === guestId);
  }

  // ---------- TABLE SEATING DRAG & DROP ----------

  function setupDragAndDrop() {
    // Always re-render guest list whenever seat assignments change
    renderGuestList();

    document.addEventListener("dragstart", (event) => {
      if (event.target.classList.contains("guest")) {
        event.dataTransfer.setData(
          "text/plain",
          event.target.getAttribute("data-guest-id")
        );
        event.dataTransfer.effectAllowed = "move";
      } else if (event.target.classList.contains("table-guest")) {
        event.dataTransfer.setData(
          "text/plain",
          event.target.getAttribute("data-guest-id")
        );
        event.dataTransfer.setData(
          "source-table",
          event.target.closest(".table-guests").getAttribute("data-table-id")
        );
        event.dataTransfer.effectAllowed = "move";
      }
    });

    document.addEventListener("dragover", (event) => {
      if (
        event.target.classList.contains("table-guests") ||
        event.target.closest(".table-guests")
      ) {
        event.preventDefault();
      }
    });

    document.addEventListener("drop", (event) => {
      event.preventDefault();
      const tableGuests = event.target.classList.contains("table-guests")
        ? event.target
        : event.target.closest(".table-guests");
      if (!tableGuests) return;

      const tableId = tableGuests.getAttribute("data-table-id");
      const guestId = event.dataTransfer.getData("text/plain");
      const sourceTableId = event.dataTransfer.getData("source-table");

      if (sourceTableId) {
        // moving between tables
        const srcDiv = document.querySelector(
          `.table-guests[data-table-id="${sourceTableId}"]`
        );
        const guestElem = srcDiv.querySelector(`[data-guest-id="${guestId}"]`);
        if (guestElem && sourceTableId !== tableId) {
          moveGuestBetweenTables(guestElem, sourceTableId, tableId);
        }
      } else {
        // dragging from guest list
        const guestElem = document.querySelector(`#${guestId}`);
        if (guestElem) {
          const gInfo = findGuestInfo(guestId);
          if (gInfo && canAddToTable(tableId, gInfo.count)) {
            addGuestToTable(tableId, gInfo);
          } else {
            showStatus("Not enough space at this table!", "error");
          }
        }
      }
    });

    document.addEventListener("click", (event) => {
      if (event.target.classList.contains("remove")) {
        const guestElement = event.target.closest(".table-guest");
        const tableGuestsDiv = guestElement.closest(".table-guests");
        const tblId = tableGuestsDiv.getAttribute("data-table-id");
        removeGuestFromTable(guestElement, tblId);
      }
    });
  }

  function canAddToTable(tableId, guestCount) {
    const tableEl = document.getElementById(`table-${tableId}`);
    const used = parseInt(tableEl.querySelector(".seats-used").textContent);
    return used + guestCount <= tableCapacity;
  }

  function addGuestToTable(tableId, guestInfo) {
    const tableEl = document.getElementById(`table-${tableId}`);
    const seatsUsedSpan = tableEl.querySelector(".seats-used");
    const used = parseInt(seatsUsedSpan.textContent);

    // Create "table-guest" element
    const trDiv = document.createElement("div");
    trDiv.className = "table-guest";
    trDiv.setAttribute("draggable", "true");
    trDiv.setAttribute("data-guest-id", guestInfo.id);
    trDiv.setAttribute("data-count", guestInfo.count);
    trDiv.innerHTML = `
      ${guestInfo.name} (${guestInfo.count})
      <span class="remove">×</span>
    `;
    tableEl.querySelector(".table-guests").appendChild(trDiv);

    seatsUsedSpan.textContent = used + guestInfo.count;
    assignedGuests.add(guestInfo.id);

    // Remove from guest-list sidebar
    const original = document.getElementById(guestInfo.id);
    if (original) original.remove();

    silentSave();
  }

  function removeGuestFromTable(guestElement, tableId) {
    const tblEl = document.getElementById(`table-${tableId}`);
    const seatsUsedSpan = tblEl.querySelector(".seats-used");
    const used = parseInt(seatsUsedSpan.textContent);
    const count = parseInt(guestElement.getAttribute("data-count"));
    const gid = guestElement.getAttribute("data-guest-id");

    seatsUsedSpan.textContent = used - count;
    guestElement.remove();
    assignedGuests.delete(gid);

    renderGuestList();
    silentSave();
  }

  function moveGuestBetweenTables(guestElement, srcTableId, dstTableId) {
    const count = parseInt(guestElement.getAttribute("data-count"));
    if (!canAddToTable(dstTableId, count)) {
      showStatus("Not enough space at target table!", "error");
      return;
    }
    // Remove from source
    const srcTableEl = document.getElementById(`table-${srcTableId}`);
    const srcUsedSpan = srcTableEl.querySelector(".seats-used");
    const srcUsed = parseInt(srcUsedSpan.textContent);
    srcUsedSpan.textContent = srcUsed - count;

    // Add to destination
    const dstTableEl = document.getElementById(`table-${dstTableId}`);
    const dstGuestsDiv = dstTableEl.querySelector(".table-guests");
    const dstUsedSpan = dstTableEl.querySelector(".seats-used");
    const dstUsed = parseInt(dstUsedSpan.textContent);
    dstUsedSpan.textContent = dstUsed + count;

    dstGuestsDiv.appendChild(guestElement);
  }

  // ---------- TABLE INITIALIZATION & SETTINGS ----------

  function initializeTables() {
    tablesContainer.innerHTML = "";
    for (let i = 1; i <= numberOfTables; i++) {
      const table = document.createElement("div");
      table.className = "table";
      table.id = `table-${i}`;
      table.innerHTML = `
        <h3>Table ${i}</h3>
        <div class="table-info">
          <span class="seats-used">0</span> / <span class="seats-total">${tableCapacity}</span> seats
        </div>
        <div class="table-guests" data-table-id="${i}"></div>
      `;
      // Default grid positions if none saved
      if (!tablePositions[i]) {
        const row = Math.floor((i - 1) / 4);
        const col = (i - 1) % 4;
        tablePositions[i] = {
          left: col * 270 + 20,
          top: row * 180 + 20,
        };
      }
      table.style.left = `${tablePositions[i].left}px`;
      table.style.top = `${tablePositions[i].top}px`;
      tablesContainer.appendChild(table);
    }
  }

  // Clear & rebuild all tables (used when settings change)
  function rebuildAllTables() {
    // Clear assignedGuests and positions
    assignedGuests.clear();
    tablePositions = {};
    // Clear any previous localStorage of seating arrangement
    localStorage.removeItem("weddingTablePlanner");
    initializeTables();
    renderGuestList();
  }

  // ---------- SAVE & LOAD ----------

  function saveToLocalStorage(silent) {
    // Save current seating arrangement
    const tablesArr = [];
    document.querySelectorAll(".table").forEach((tableEl) => {
      const tid = tableEl.id.split("-")[1];
      const guestsArr = [];
      tableEl.querySelectorAll(".table-guest").forEach((gEl) => {
        guestsArr.push({
          id: gEl.getAttribute("data-guest-id"),
          count: parseInt(gEl.getAttribute("data-count")),
        });
      });
      tablesArr.push({
        id: tid,
        guests: guestsArr,
        position: tablePositions[tid] || {
          left: parseInt(tableEl.style.left) || 0,
          top: parseInt(tableEl.style.top) || 0,
        },
      });
    });
    localStorage.setItem("weddingTablePlanner", JSON.stringify(tablesArr));
    // Also save guest list itself
    saveGuestList();

    if (!silent) showStatus("Progress saved!", "success");
  }

  function loadFromLocalStorage() {
    const saved = localStorage.getItem("weddingTablePlanner");
    if (!saved) return;
    try {
      const tablesArr = JSON.parse(saved);
      // Restore positions
      tablesArr.forEach((tbl) => {
        if (tbl.position) {
          tablePositions[tbl.id] = tbl.position;
          const tEl = document.getElementById(`table-${tbl.id}`);
          if (tEl) {
            tEl.style.left = `${tbl.position.left}px`;
            tEl.style.top = `${tbl.position.top}px`;
          }
        }
      });
      // Restore assigned guests
      tablesArr.forEach((tbl) => {
        tbl.guests.forEach((g) => {
          const gInfo = findGuestInfo(g.id);
          if (gInfo && canAddToTable(tbl.id, gInfo.count)) {
            addGuestToTable(tbl.id, gInfo);
          }
        });
      });
      showStatus("Saved arrangement loaded!", "success");
    } catch (err) {
      console.error("Error loading saved data:", err);
      showStatus("Error loading saved data!", "error");
    }
  }

  // ---------- TABLE DRAGGING ----------

  function setupDraggableTables() {
    let activeTable = null;
    let initialX, initialY;
    let currentX, currentY;
    let xOffset = 0,
      yOffset = 0;

    tablesContainer.addEventListener("mousedown", (e) => {
      const table = e.target.closest(".table");
      if (!table) return;
      // Don’t start dragging if clicking a seated guest or its remove button
      if (
        e.target.classList.contains("table-guest") ||
        e.target.classList.contains("remove")
      ) {
        return;
      }
      activeTable = table;
      initialX = e.clientX;
      initialY = e.clientY;

      const rect = activeTable.getBoundingClientRect();
      const containerRect = tablesContainer.getBoundingClientRect();
      xOffset = rect.left - containerRect.left + tablesContainer.scrollLeft;
      yOffset = rect.top - containerRect.top + tablesContainer.scrollTop;

      activeTable.classList.add("dragging");
      document.addEventListener("mousemove", moveTable);
      document.addEventListener("mouseup", stopMovingTable);
    });

    function moveTable(e) {
      if (!activeTable) return;
      e.preventDefault();
      currentX = e.clientX - initialX;
      currentY = e.clientY - initialY;
      const newX = xOffset + currentX;
      const newY = yOffset + currentY;
      activeTable.style.left = `${newX}px`;
      activeTable.style.top = `${newY}px`;
    }

    function stopMovingTable() {
      if (!activeTable) return;
      const tid = activeTable.id.replace("table-", "");
      tablePositions[tid] = {
        left: parseInt(activeTable.style.left),
        top: parseInt(activeTable.style.top),
      };
      activeTable.classList.remove("dragging");
      activeTable = null;
      document.dispatchEvent(new Event("tableMove"));
      document.removeEventListener("mousemove", moveTable);
      document.removeEventListener("mouseup", stopMovingTable);
    }
  }

  // ---------- AUTO-SAVE ----------

  function silentSave() {
    setTimeout(() => {
      saveToLocalStorage(true);
    }, 300);
  }

  // ---------- STATUS MESSAGES ----------

  function showStatus(message, type) {
    statusMessage.textContent = message;
    statusMessage.className = "status " + type;
    setTimeout(() => {
      statusMessage.textContent = "";
      statusMessage.className = "status";
    }, 3000);
  }

  // ---------- GUEST INFO PANEL ----------

  function showGuestInfo() {
    const guestInfoContainer = document.getElementById("guest-info");
    guestInfoContainer.innerHTML = "";

    const totalGuests = guestList.reduce((sum, g) => sum + g.count, 0);
    const assignedCount = Array.from(
      document.querySelectorAll(".table-guest")
    ).reduce(
      (sum, el) => sum + parseInt(el.getAttribute("data-count") || 0),
      0
    );
    const remainingGuests = totalGuests - assignedCount;

    const tables = document.querySelectorAll(".table");
    const stats = Array.from(tables).map((t) => {
      const tid = t.id.split("-")[1];
      const used = parseInt(t.querySelector(".seats-used").textContent);
      return { tableId: tid, seatsUsed: used };
    });
    stats.sort((a, b) => b.seatsUsed - a.seatsUsed);

    const totalUsed = stats.reduce((s, t) => s + t.seatsUsed, 0);
    const totalSeats = tableCapacity * numberOfTables;
    const seatsLeft = totalSeats - totalUsed;

    let html = `
      <h3>Guest Statistics</h3>
      <p>Total guests: ${totalGuests}</p>
      <p>Assigned guests: ${assignedCount}</p>
      <p>Remaining to assign: ${remainingGuests}</p>
      <p>Total seats used: ${totalUsed} / ${totalSeats}</p>
      <p>Seats remaining: ${seatsLeft}</p>
      <h4>Most filled tables:</h4>
      <ul>
    `;
    stats.slice(0, 5).forEach((t) => {
      if (t.seatsUsed > 0) {
        html += `<li>Table ${t.tableId}: ${t.seatsUsed} / ${tableCapacity} seats</li>`;
      }
    });
    html += `</ul><h4>Empty tables:</h4><ul>`;
    const empties = stats.filter((t) => t.seatsUsed === 0);
    if (empties.length > 0) {
      empties.forEach((t) => {
        html += `<li>Table ${t.tableId}</li>`;
      });
    } else {
      html += `<li>No empty tables</li>`;
    }
    html += `</ul>`;
    guestInfoContainer.innerHTML = html;
  }

  // ---------- CLEAR ALL TABLES ----------

  function clearAllTables() {
    if (confirm("Are you sure you want to clear all tables?")) {
      document.querySelectorAll(".table-guests").forEach((tg) => {
        tg.innerHTML = "";
      });
      document.querySelectorAll(".seats-used").forEach((su) => {
        su.textContent = "0";
      });
      assignedGuests.clear();
      renderGuestList();
      showStatus("All tables cleared!", "success");
      saveToLocalStorage(false);
    }
  }
});
