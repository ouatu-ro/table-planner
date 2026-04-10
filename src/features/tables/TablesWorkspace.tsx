import { For, createEffect, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import { DisclosureSection, MetaPill, SectionIntro } from "../../design-system/composition";
import { Button } from "../../design-system/primitives";
import type { TablesWorkspaceProps } from "../types";

const TABLE_CARD_WIDTH = 270;
const TABLE_CARD_HEIGHT = 164;
const WORLD_PADDING = 180;
const WORLD_MIN_WIDTH = 1400;
const WORLD_MIN_HEIGHT = 900;

export function TablesWorkspace(props: TablesWorkspaceProps) {
  let viewportRef: HTMLDivElement | undefined;
  let panState:
    | {
        startX: number;
        startY: number;
        scrollLeft: number;
        scrollTop: number;
      }
    | null = null;

  const [isPanning, setIsPanning] = createSignal(false);

  const worldBounds = createMemo(() => {
    const positions = props.tables.map((tableView) => {
      const preview = props.dragPreview?.tableId === tableView.table.id ? props.dragPreview : null;
      return {
        left: preview?.left ?? tableView.table.position.left,
        top: preview?.top ?? tableView.table.position.top,
      };
    });

    const maxRight = positions.length ? Math.max(...positions.map((item) => item.left + TABLE_CARD_WIDTH)) : 0;
    const maxBottom = positions.length ? Math.max(...positions.map((item) => item.top + TABLE_CARD_HEIGHT)) : 0;

    return {
      width: Math.max(WORLD_MIN_WIDTH, maxRight + WORLD_PADDING),
      height: Math.max(WORLD_MIN_HEIGHT, maxBottom + WORLD_PADDING),
    };
  });

  function clearPan() {
    panState = null;
    setIsPanning(false);
    window.removeEventListener("pointermove", handlePanMove);
    window.removeEventListener("pointerup", endPan);
    window.removeEventListener("pointercancel", endPan);
  }

  function handlePanMove(event: PointerEvent) {
    if (!viewportRef || !panState) return;
    const dx = event.clientX - panState.startX;
    const dy = event.clientY - panState.startY;
    if (!isPanning() && Math.hypot(dx, dy) < 4) return;
    setIsPanning(true);
    viewportRef.scrollLeft = panState.scrollLeft - dx;
    viewportRef.scrollTop = panState.scrollTop - dy;
  }

  function endPan() {
    clearPan();
  }

  function startPan(event: PointerEvent) {
    if (!viewportRef) return;
    if (event.button !== 0) return;
    const target = event.target as HTMLElement | null;
    if (!target) return;
    if (target.closest(".table-card, .conflict-item, input, button, textarea, select, label, a, [role='button']")) return;

    panState = {
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewportRef.scrollLeft,
      scrollTop: viewportRef.scrollTop,
    };

    window.addEventListener("pointermove", handlePanMove);
    window.addEventListener("pointerup", endPan);
    window.addEventListener("pointercancel", endPan);
  }

  onMount(() => {
    const viewport = viewportRef;
    if (!viewport) return;
    if (props.tables.length) {
      viewport.scrollLeft = 0;
      viewport.scrollTop = 0;
    }
  });

  createEffect(() => {
    worldBounds();
    if (!viewportRef) return;
    const maxScrollLeft = Math.max(0, worldBounds().width - viewportRef.clientWidth);
    const maxScrollTop = Math.max(0, worldBounds().height - viewportRef.clientHeight);
    if (viewportRef.scrollLeft > maxScrollLeft) viewportRef.scrollLeft = maxScrollLeft;
    if (viewportRef.scrollTop > maxScrollTop) viewportRef.scrollTop = maxScrollTop;
  });

  onCleanup(() => clearPan());

  return (
    <section class="panel center-panel">
      <div class="section-head">
        <SectionIntro
          title="Tables"
          copy="Drag groups onto a table. Drag tables on the grid to reorganize the room."
          meta={<MetaPill>{props.tableCount}</MetaPill>}
        />
      </div>
      <div class="canvas-toolbar">
        <div class="canvas-chip">Room view</div>
        <div class="canvas-chip">Grid aligned</div>
        <div class="canvas-chip">Drop groups on tables</div>
        <div class="canvas-chip">Drag empty space to pan</div>
      </div>
      <div
        ref={viewportRef}
        classList={{
          "table-canvas-viewport": true,
          panning: isPanning(),
        }}
        onPointerDown={startPan}
      >
        <div
          class="table-canvas"
          style={{
            width: `${worldBounds().width}px`,
            height: `${worldBounds().height}px`,
          }}
        >
          <For each={props.tables}>
            {(tableView) => {
              const table = tableView.table;
              return (
                <section
                  classList={{
                    "table-card": true,
                    selected: props.selectedTableId === table.id,
                    "over-capacity": tableView.used > table.capacity,
                    warning: tableView.conflictCount > 0,
                  }}
                  data-table-id={table.id}
                  style={{
                    left: `${props.dragPreview?.tableId === table.id ? props.dragPreview.left : table.position.left}px`,
                    top: `${props.dragPreview?.tableId === table.id ? props.dragPreview.top : table.position.top}px`,
                    "z-index": `${table.zIndex}`,
                  }}
                  onClick={() => props.onSelectTable(table.id)}
                  onMouseDown={(e) => props.onStartTableDrag(e, table.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => props.onTableDrop(e, table.id)}
                >
                  <div class="table-frame" />
                  <div class="table-head">
                    <input
                      value={props.tableNameDraft?.tableId === table.id ? props.tableNameDraft.value : table.name}
                      onFocus={() => props.onBeginTableNameEdit(table.id, table.name)}
                      onInput={(e) => props.onSetDraftTableName(table.id, e.currentTarget.value)}
                      onBlur={() => props.onCommitTableNameEdit(table.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        else if (e.key === "Escape") {
                          e.preventDefault();
                          props.onCancelTableNameEdit(table.id);
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
                      onInput={(e) => props.onUpdateTableCapacity(table.id, Number.parseInt(e.currentTarget.value, 10))}
                      onMouseDown={(e) => e.stopPropagation()}
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Table capacity"
                    />
                  </div>
                  <div class="table-summary">
                    {tableView.used} / {table.capacity} seats used
                    {tableView.conflictCount ? ` • ${tableView.conflictCount} issue${tableView.conflictCount === 1 ? "" : "s"}` : ""}
                  </div>
                  {tableView.used > table.capacity ? <div class="table-alert">Over capacity</div> : null}
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
                          onDragStart={(e) => props.onGroupDragStart(e, groupView.group.id)}
                          onClick={(e) => {
                            e.stopPropagation();
                            props.onSelectGroup(groupView.group.id);
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          title={groupView.group.name}
                        >
                          <span class="table-guest-label">{groupView.group.name}</span>
                          <button
                            type="button"
                            class="chip-action"
                            onClick={(e) => {
                              e.stopPropagation();
                              props.onUnseatGroup(groupView.group.id);
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
          {!props.tables.length ? (
            <div class="canvas-empty-state">
              <p>No tables yet. Add one to start laying out the room.</p>
              {props.onAddTable ? (
                <Button variant="utility" size="xs" onClick={props.onAddTable}>
                  Add table
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
      <DisclosureSection
        class="table-conflicts-panel"
        title="Table conflicts"
        copy="Global issues across the current seating plan."
        level={3}
        open={props.conflicts.length > 0}
        meta={<MetaPill tone={props.conflicts.length ? "warning" : "default"}>{props.conflicts.length}</MetaPill>}
      >
        <div class="conflict-list">
          <For each={props.conflicts}>
            {(issue) => (
              <button
                class={`conflict-item ${issue.severity}`}
                onClick={() => {
                  const groupId = issue.groupIds[0];
                  const tableId = issue.tableIds[0];
                  if (groupId && props.groups.some((item) => item.group.id === groupId)) props.onSelectGroup(groupId);
                  else if (tableId && props.tables.some((item) => item.table.id === tableId)) props.onSelectTable(tableId);
                }}
              >
                {issue.message}
              </button>
            )}
          </For>
        </div>
      </DisclosureSection>
    </section>
  );
}
