import { For } from "solid-js";
import { DisclosureSection, MetaGrid, MetaItem, MetaPill, MetaRow, SectionIntro } from "../../design-system/composition";
import { Button } from "../../design-system/primitives";
import type { InspectorPanelProps } from "../types";

export function InspectorPanel(props: InspectorPanelProps) {
  return (
    <aside class="panel right-panel">
      <div class="panel-section">
        <div class="section-head">
          <SectionIntro title="Inspector" copy="Edit the current selection without leaving the canvas." />
        </div>
        {(() => {
          const groupView = props.selectedGroup;
          if (groupView) {
            return (
              <div class="detail-card">
                <DisclosureSection inner title="Group" open meta={<MetaPill>{groupView.seatCount} seats</MetaPill>}>
                  <label class="field">
                    <span>Name</span>
                    <input
                      value={props.groupDraft?.id === groupView.group.id ? props.groupDraft.name : groupView.group.name}
                      onInput={(e) => props.onSetGroupDraftField("name", e.currentTarget.value)}
                      onBlur={props.onCommitGroupDraft}
                    />
                  </label>
                  <MetaGrid compact>
                    <MetaItem label="Members" value={groupView.guests.length} />
                    <MetaItem label="Issues" value={groupView.conflictCount} />
                  </MetaGrid>
                  <MetaRow label="Placement" value={groupView.tableId ? props.tables.find((table) => table.table.id === groupView.tableId)?.table.name : "Unassigned"} />
                  <div class="muted member-inline-list">{groupView.guests.map((guest) => guest.name).join(", ")}</div>
                  <label class="field compact-field">
                    <span>Group notes</span>
                    <textarea
                      value={props.groupDraft?.id === groupView.group.id ? props.groupDraft.notes : groupView.group.notes}
                      onInput={(e) => props.onSetGroupDraftField("notes", e.currentTarget.value)}
                      onBlur={props.onCommitGroupDraft}
                    />
                  </label>
                  <div class="card-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => {
                        if (groupView.tableId) props.onUnseatGroup(groupView.group.id);
                        else props.onSeatSelectedGroup();
                      }}
                    >
                      {groupView.tableId ? "Unseat" : props.selectedTable ? `Seat at ${props.selectedTable.table.name}` : "Seat group"}
                    </Button>
                  </div>
                </DisclosureSection>
                <DisclosureSection inner title="Constraints" level={3}>
                  <div class="constraint-panel constraint-panel-stack">
                    <label class="field">
                      <span>Add must-sit constraint</span>
                      <select
                        onChange={(e) => {
                          const target = e.currentTarget.value;
                          if (target) props.onAddConstraint(groupView.group.id, "mustSitWith", target);
                          e.currentTarget.value = "";
                        }}
                      >
                        <option value="">Choose group</option>
                        <For each={props.groups.filter((item) => item.group.id !== groupView.group.id)}>
                          {(candidate) => <option value={candidate.group.id}>{candidate.group.name}</option>}
                        </For>
                      </select>
                    </label>
                    <label class="field">
                      <span>Add keep-apart constraint</span>
                      <select
                        onChange={(e) => {
                          const target = e.currentTarget.value;
                          if (target) props.onAddConstraint(groupView.group.id, "mustNotSitWith", target);
                          e.currentTarget.value = "";
                        }}
                      >
                        <option value="">Choose group</option>
                        <For each={props.groups.filter((item) => item.group.id !== groupView.group.id)}>
                          {(candidate) => <option value={candidate.group.id}>{candidate.group.name}</option>}
                        </For>
                      </select>
                    </label>
                    <div class="constraint-list">
                      <For each={groupView.group.mustSitWith}>
                        {(targetId) => {
                          const target = props.groups.find((candidate) => candidate.group.id === targetId);
                          return (
                            <button type="button" class="constraint-pill" onClick={() => props.onRemoveConstraint(groupView.group.id, "mustSitWith", targetId)}>
                              must sit with {target?.group.name || targetId}
                            </button>
                          );
                        }}
                      </For>
                      <For each={groupView.group.mustNotSitWith}>
                        {(targetId) => {
                          const target = props.groups.find((candidate) => candidate.group.id === targetId);
                          return (
                            <button type="button" class="constraint-pill" onClick={() => props.onRemoveConstraint(groupView.group.id, "mustNotSitWith", targetId)}>
                              keep apart {target?.group.name || targetId}
                            </button>
                          );
                        }}
                      </For>
                    </div>
                  </div>
                </DisclosureSection>
                <DisclosureSection inner title="Members" level={3}>
                  <div class="member-list">
                    <For each={groupView.guests}>
                      {(guest) => (
                        <div class="member-card compact-card">
                          <div class="member-row">
                            <label class="field">
                              <span>Name</span>
                              <input
                                value={props.memberDrafts[guest.id]?.name ?? guest.name}
                                onInput={(e) => props.onSetMemberDraftField(guest.id, "name", e.currentTarget.value)}
                                onBlur={() => props.onCommitMemberDraft(guest.id)}
                              />
                            </label>
                            <label class="field">
                              <span>Type</span>
                              <select
                                value={props.memberDrafts[guest.id]?.kind ?? guest.kind}
                                onChange={(e) => {
                                  props.onSetMemberDraftField(guest.id, "kind", e.currentTarget.value);
                                  props.onCommitMemberDraft(guest.id);
                                }}
                              >
                                <option value="adult">adult</option>
                                <option value="kid">kid</option>
                                <option value="teen">teen</option>
                                <option value="other">other</option>
                              </select>
                            </label>
                          </div>
                          <label class="field">
                            <span>Notes</span>
                            <input
                              value={props.memberDrafts[guest.id]?.notes ?? guest.notes}
                              onInput={(e) => props.onSetMemberDraftField(guest.id, "notes", e.currentTarget.value)}
                              onBlur={() => props.onCommitMemberDraft(guest.id)}
                              placeholder="Member notes"
                            />
                          </label>
                        </div>
                      )}
                    </For>
                  </div>
                </DisclosureSection>
                <DisclosureSection
                  inner
                  title="Local conflicts"
                  level={3}
                  open={props.localConflicts.length > 0}
                  meta={<MetaPill tone={props.localConflicts.length ? "warning" : "default"}>{props.localConflicts.length}</MetaPill>}
                >
                  <div class="conflict-list">
                    <For each={props.localConflicts}>
                      {(issue) => <div class={`conflict-item ${issue.severity}`}>{issue.message}</div>}
                    </For>
                    {!props.localConflicts.length ? <div class="empty-state">No conflicts for this group.</div> : null}
                  </div>
                </DisclosureSection>
              </div>
            );
          }

          const tableView = props.selectedTable;
          if (tableView) {
            return (
              <div class="detail-card">
                <DisclosureSection inner title="Table" open meta={<MetaPill>{tableView.used} used</MetaPill>}>
                  <label class="field">
                    <span>Name</span>
                    <input
                      value={props.tableInspectorDraft?.id === tableView.table.id ? props.tableInspectorDraft.name : tableView.table.name}
                      onInput={(e) => props.onSetTableInspectorField("name", e.currentTarget.value)}
                      onBlur={props.onCommitTableInspectorDraft}
                    />
                  </label>
                  <label class="field">
                    <span>Capacity</span>
                    <input
                      type="number"
                      min="1"
                      value={props.tableInspectorDraft?.id === tableView.table.id ? props.tableInspectorDraft.capacity : String(tableView.table.capacity)}
                      onInput={(e) => props.onSetTableInspectorField("capacity", e.currentTarget.value)}
                      onBlur={props.onCommitTableInspectorDraft}
                    />
                  </label>
                  <MetaGrid>
                    <MetaItem label="Used" value={tableView.used} />
                    <MetaItem label="Open seats" value={Math.max(0, tableView.table.capacity - tableView.used)} />
                    <MetaItem label="Groups" value={tableView.groups.length} />
                  </MetaGrid>
                  <div class="muted member-inline-list">{tableView.groups.map((group) => group.group.name).join(", ") || "No groups seated here yet."}</div>
                </DisclosureSection>
                <DisclosureSection
                  inner
                  title="Local conflicts"
                  level={3}
                  open={props.localConflicts.length > 0}
                  meta={<MetaPill tone={props.localConflicts.length ? "warning" : "default"}>{props.localConflicts.length}</MetaPill>}
                >
                  <div class="conflict-list">
                    <For each={props.localConflicts}>
                      {(issue) => <div class={`conflict-item ${issue.severity}`}>{issue.message}</div>}
                    </For>
                    {!props.localConflicts.length ? <div class="empty-state">No conflicts for this table.</div> : null}
                  </div>
                </DisclosureSection>
              </div>
            );
          }

          return <p class="empty-state">Select a group or table.</p>;
        })()}
      </div>
    </aside>
  );
}
