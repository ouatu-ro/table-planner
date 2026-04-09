import type { CsvRow, GuestKind, PlannerState } from "./types";
import { titleCaseName, normalizeWhitespace } from "./utils";

export function exportCsv(state: PlannerState): string {
  const rows: string[][] = [["group_name", "guest_name", "kind", "notes", "table_name", "must_sit_with", "must_not_sit_with"]];
  for (const group of Object.values(state.groups)) {
    const tableId = state.assignments[group.id];
    const tableName = tableId ? state.tables[tableId]?.name || "" : "";
    const mustSitWith = group.mustSitWith.map((id) => state.groups[id]?.name || "").filter(Boolean).join("|");
    const mustNotSitWith = group.mustNotSitWith.map((id) => state.groups[id]?.name || "").filter(Boolean).join("|");
    for (const guestId of group.guestIds) {
      const guest = state.guests[guestId];
      if (!guest) continue;
      rows.push([
        group.name,
        guest.name,
        guest.kind,
        guest.notes || "",
        tableName,
        mustSitWith,
        mustNotSitWith,
      ]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n");
}

export function parseCsv(text: string): CsvRow[] {
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length || lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((header) => header.trim().toLowerCase());
  return lines
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const cells = parseCsvLine(line);
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = cells[index] ?? "";
      });
      return {
        groupName: row.group_name || row.group || row.family || "",
        guestName: row.guest_name || row.name || "",
        kind: (row.kind || "adult") as GuestKind,
        notes: row.notes || "",
        tableName: row.table_name || row.table || "",
        mustSitWith: row.must_sit_with || row.mustsitwith || "",
        mustNotSitWith: row.must_not_sit_with || row.mustnotsitwith || "",
      } satisfies CsvRow;
    })
    .filter((row) => row.guestName.length > 0);
}

export function csvToRows(text: string): CsvRow[] {
  return parseCsv(text).map((row) => ({
    ...row,
    guestName: titleCaseName(row.guestName),
    groupName: normalizeWhitespace(row.groupName),
  }));
}

export function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells;
}
