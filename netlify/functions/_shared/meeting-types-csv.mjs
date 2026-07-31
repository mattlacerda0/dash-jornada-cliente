/**
 * Fonte exclusiva do gráfico "Reuniões por tipo".
 * Não misturar com o dataset operacional de reuniões (meetings.mjs).
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { normalizeMeetingEventType, buildMeetingTypeDistributions } from "./meeting-event-type.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DEFAULT_CSV = "filtered-event-data-from-20250731-to-20260730.csv";

function parseCsvLine(line) {
  const cols = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      q = !q;
      continue;
    }
    if (ch === "," && !q) {
      cols.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  cols.push(cur);
  return cols;
}

function findCsvPath() {
  const envPath = (process.env.MEETING_TYPES_CSV_PATH || "").trim();
  const candidates = [
    envPath || null,
    resolve(ROOT, DEFAULT_CSV),
    resolve(process.cwd(), DEFAULT_CSV),
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Lê o CSV e devolve apenas a distribuição por tipo (dedupe por Event UUID).
 * @returns {{
 *  available: boolean,
 *  byFamily: Array,
 *  byRaw: Array,
 *  metadata: object,
 *  events: Array<{eventUuid, rawEventType, canceled, startTime}>
 * }}
 */
export function loadMeetingTypesFromCsv() {
  const path = findCsvPath();
  if (!path) {
    return {
      available: false,
      byFamily: [],
      byRaw: [],
      events: [],
      metadata: {
        source: "csv",
        file: DEFAULT_CSV,
        message: "Arquivo CSV de tipos de reunião não encontrado.",
        scope: "meeting_types_chart_only",
      },
    };
  }

  const text = readFileSync(path, "utf8");
  const lines = text.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return {
      available: false,
      byFamily: [],
      byRaw: [],
      events: [],
      metadata: {
        source: "csv",
        file: path,
        message: "CSV vazio ou sem dados.",
        scope: "meeting_types_chart_only",
      },
    };
  }

  const header = parseCsvLine(lines[0]);
  const typeIdx = header.indexOf("Event Type Name");
  const cancelIdx = header.indexOf("Canceled");
  const uuidIdx = header.indexOf("Event UUID");
  const startIdx = header.indexOf("Start Date & Time");
  const noshowIdx = header.indexOf("Marked as No-Show");

  const byUuid = new Map();
  let noshowYes = 0;
  let noshowNo = 0;
  let canceledRows = 0;

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const rawType = String(cols[typeIdx] || "").trim();
    if (!rawType) continue;
    const uuid = String(cols[uuidIdx] || "").trim() || `row:${i}`;
    const canceled = String(cols[cancelIdx] || "").trim().toLowerCase() === "true";
    if (canceled) canceledRows += 1;
    const noshow = String(cols[noshowIdx] || "").trim().toLowerCase();
    if (noshow === "yes" || noshow === "true") noshowYes += 1;
    else noshowNo += 1;
    // Dedup por Event UUID — mantém a primeira ocorrência
    if (byUuid.has(uuid)) continue;
    byUuid.set(uuid, {
      eventUuid: uuid,
      rawEventType: rawType,
      title: rawType,
      canceled,
      startTime: cols[startIdx] || null,
      attendanceStatus: canceled ? "cancelada" : "desconhecido",
    });
  }

  const events = [...byUuid.values()];
  const dist = buildMeetingTypeDistributions(events, { now: new Date() });

  return {
    available: true,
    byFamily: dist.byFamily,
    byRaw: dist.byRaw,
    events: events.map((e) => ({
      eventUuid: e.eventUuid,
      rawEventType: e.rawEventType,
      canceled: e.canceled,
      startTime: e.startTime,
      ...normalizeMeetingEventType(e.rawEventType),
    })),
    metadata: {
      source: "csv",
      file: path.split(/[/\\]/).pop(),
      scope: "meeting_types_chart_only",
      note: "Fonte exclusiva do gráfico Reuniões por tipo. Não altera KPIs operacionais.",
      rowCount: lines.length - 1,
      distinctEventUuids: events.length,
      distinctRawTypes: dist.byRaw.length,
      distinctFamilies: dist.byFamily.length,
      canceledRows,
      csvNoShowYes: noshowYes,
      csvNoShowCoverage: noshowYes === 0 ? 0 : Math.round((noshowYes / (noshowYes + noshowNo)) * 1000) / 10,
    },
  };
}
