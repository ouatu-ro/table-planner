import { For } from "solid-js";
import { DisclosureSection, MetaPill } from "../../design-system/composition";
import { Button, FileButton } from "../../design-system/primitives";
import type { PolicyMode } from "../../core/types";
import type { GuestsSidebarProps } from "../types";

export function GuestsSidebar(props: GuestsSidebarProps) {
  return (
    <aside class="panel left-panel">
      <DisclosureSection
        title="Add guests"
        copy="Create a seatable group, then drag it onto a table."
        meta={<MetaPill>{props.unassignedCount}</MetaPill>}
      >
        <form
          class="guest-form"
          onSubmit={(e) => {
            e.preventDefault();
            props.onAddGuests(e.currentTarget);
          }}
        >
          <div class="form-grid form-grid-guest">
            <label class="field">
              <span>Guest names</span>
              <input name="names" type="text" placeholder="Ana, Mihai, Sofia" />
            </label>
            <label class="field">
              <span>Group name</span>
              <input name="groupName" type="text" placeholder="Ionescu family" />
            </label>
            <label class="field field-span-2">
              <span>Notes</span>
              <input name="notes" type="text" placeholder="Needs easy aisle access" />
            </label>
            <Button type="submit">Add guests</Button>
          </div>
        </form>
        <label class="field">
          <span>Search unseated groups</span>
          <input value={props.search} onInput={(e) => props.onSearch(e.currentTarget.value)} type="search" placeholder="Find by group or guest name" />
        </label>
      </DisclosureSection>

      <DisclosureSection title="Unseated groups" copy="These groups are waiting to be placed." level={3}>
        <div class="guest-list" onDragOver={(e) => e.preventDefault()} onDrop={props.onUnassignedDrop}>
          <For each={props.visibleGroups}>
            {(groupView) => (
              <div
                classList={{
                  "guest-card": true,
                  selected: props.selectedGroupId === groupView.group.id,
                  warning: groupView.conflictCount > 0,
                  blocked: groupView.status === "blocked",
                }}
                draggable="true"
                data-group-id={groupView.group.id}
                onClick={() => props.onSelectGroup(groupView.group.id)}
                onDragStart={(e) => props.onGroupDragStart(e, groupView.group.id)}
              >
                <div class="guest-main">
                  <strong class="guest-name">{groupView.group.name}</strong>
                  <div class="guest-meta">
                    {groupView.seatCount} seat{groupView.seatCount === 1 ? "" : "s"}
                    {groupView.conflictCount ? ` • ${groupView.conflictCount} issue${groupView.conflictCount === 1 ? "" : "s"}` : ""}
                  </div>
                </div>
                <div class="guest-summary" title={groupView.guests.map((guest) => guest.name).join(", ")}>
                  {groupView.guests.map((guest) => guest.name).join(", ")}
                </div>
              </div>
            )}
          </For>
          {!props.visibleGroups.length ? <div class="empty-state">No unseated groups match the current search.</div> : null}
        </div>
      </DisclosureSection>

      <DisclosureSection title="Add table" copy="Tables are the seating containers in the room." level={3}>
        <div class="stack-row stack-row-compact">
          <Button variant="utility" size="xs" onClick={props.onAddTable}>
            Add table
          </Button>
        </div>
        <p class="help-text">Groups always sit together inside a table.</p>
      </DisclosureSection>

      <DisclosureSection title="Policies" copy="Control how the planner reacts to invalid or risky placements." level={3}>
        <div class="policy-grid">
          <label class="field">
            <span>Table capacity</span>
            <select value={props.policy.tableCapacity} onInput={(e) => props.onUpdatePolicy("tableCapacity", e.currentTarget.value as PolicyMode)}>
              <option value="ignore">Ignore</option>
              <option value="warning">Warn</option>
              <option value="blocked">Block</option>
            </select>
          </label>
          <label class="field">
            <span>Incompatible guests</span>
            <select value={props.policy.incompatibleGuests} onInput={(e) => props.onUpdatePolicy("incompatibleGuests", e.currentTarget.value as PolicyMode)}>
              <option value="ignore">Ignore</option>
              <option value="warning">Warn</option>
              <option value="blocked">Block</option>
            </select>
          </label>
          <label class="field">
            <span>Group splits</span>
            <select value={props.policy.groupSplit} onInput={(e) => props.onUpdatePolicy("groupSplit", e.currentTarget.value as PolicyMode)}>
              <option value="ignore">Ignore</option>
              <option value="warning">Warn</option>
              <option value="blocked">Block</option>
            </select>
          </label>
          <label class="field">
            <span>Duplicate names</span>
            <select value={props.policy.duplicateNames} onInput={(e) => props.onUpdatePolicy("duplicateNames", e.currentTarget.value as PolicyMode)}>
              <option value="ignore">Ignore</option>
              <option value="warning">Warn</option>
              <option value="blocked">Block</option>
            </select>
          </label>
        </div>
      </DisclosureSection>

      <DisclosureSection title="Project" copy="History and import/export actions." level={3}>
        <div class="toolbar-stack">
          <p class="toolbar-label">History</p>
          <div class="header-actions header-actions-compact">
            <Button variant="utility" size="xs" onClick={props.onUndo}>
              Undo
            </Button>
            <Button variant="utility" size="xs" onClick={props.onRedo}>
              Redo
            </Button>
          </div>
        </div>
        <div class="toolbar-stack">
          <p class="toolbar-label">Import / export</p>
          <div class="header-actions header-actions-compact">
            <Button variant="utility" size="xs" onClick={props.onExportJson}>
              Export JSON
            </Button>
            <Button variant="utility" size="xs" onClick={props.onExportCsv}>
              Export CSV
            </Button>
            <FileButton variant="utility" size="xs">
              Import JSON
              <input type="file" accept="application/json,.json" onChange={(e) => props.onImportJson(e.currentTarget.files?.[0] || null)} />
            </FileButton>
            <FileButton variant="utility" size="xs">
              Import CSV
              <input type="file" accept=".csv,text/csv" onChange={(e) => props.onImportCsv(e.currentTarget.files?.[0] || null)} />
            </FileButton>
          </div>
        </div>
      </DisclosureSection>
    </aside>
  );
}
