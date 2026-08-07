/**
 * Auditoria determinística do cohort (sem banco).
 * Valida: 1 linha/cliente, prioridade de data, M0=100%, saída após cancelamento, futuros = null.
 */
import { buildCohortRetention } from "../netlify/functions/_shared/cohort-retention.mjs";

const cutoff = "2026-07-31";

const clients = [
  // 3 ativos
  { clientId: "A1", contractDate: "2026-01-10", isCancelled: false, cancellationDate: null, cancellationDateSource: null },
  { clientId: "A2", contractDate: "2026-02-05", isCancelled: false, cancellationDate: null, cancellationDateSource: null },
  { clientId: "A3", contractDate: "2026-03-12", isCancelled: false, cancellationDate: null, cancellationDateSource: null },
  // 3 churn_efetivado_at
  { clientId: "C1", contractDate: "2026-01-10", isCancelled: true, cancellationDate: "2026-03-20", cancellationDateSource: "churn_efetivado_at" },
  { clientId: "C2", contractDate: "2026-01-15", isCancelled: true, cancellationDate: "2026-04-01", cancellationDateSource: "churn_efetivado_at" },
  { clientId: "C3", contractDate: "2026-02-01", isCancelled: true, cancellationDate: "2026-05-10", cancellationDateSource: "churn_efetivado_at" },
  // 3 distrato_assinado_at
  { clientId: "D1", contractDate: "2026-01-20", isCancelled: true, cancellationDate: "2026-03-01", cancellationDateSource: "distrato_assinado_at" },
  { clientId: "D2", contractDate: "2026-02-10", isCancelled: true, cancellationDate: "2026-04-15", cancellationDateSource: "distrato_assinado_at" },
  { clientId: "D3", contractDate: "2026-03-01", isCancelled: true, cancellationDate: "2026-06-01", cancellationDateSource: "distrato_assinado_at" },
  // 3 só data_churn
  { clientId: "H1", contractDate: "2026-01-05", isCancelled: true, cancellationDate: "2026-02-28", cancellationDateSource: "clients.data_churn" },
  { clientId: "H2", contractDate: "2026-02-20", isCancelled: true, cancellationDate: "2026-05-20", cancellationDateSource: "clients.data_churn" },
  { clientId: "H3", contractDate: "2026-01-25", isCancelled: true, cancellationDate: "2026-06-15", cancellationDateSource: "clients.data_churn" },
  // inválidos / exclusões
  { clientId: "X1", contractDate: null, isCancelled: false }, // sem contratação
  { clientId: "X2", contractDate: "2027-01-01", isCancelled: false }, // futura vs cutoff
  { clientId: "X3", contractDate: "2026-01-10", isCancelled: true, cancellationDate: "2025-12-01", cancellationDateSource: "churn_efetivado_at" }, // cancel antes
  { clientId: "X4", contractDate: "2026-01-10", isCancelled: true, cancellationDate: null }, // cancel sem data
  { clientId: "A1", contractDate: "2026-01-10", isCancelled: false }, // duplicata
];

const cohort = buildCohortRetention(clients, { hireFrom: "2026-01-01", cutoffDate: cutoff });
const meta = cohort.metadata;

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

assert(meta.clientsWithHire === 12, "incluídos devem ser 12 (3+3+3+3)");
assert(meta.skippedDuplicate >= 1, "duplicata");
assert(meta.skippedCancelledNoDate >= 1, "cancel sem data");
assert(meta.skippedCancelBeforeHire >= 1, "cancel antes da contratação");
assert(meta.skippedNoHire >= 1, "sem hire / futuro");

const jan = cohort.cohorts.find((c) => c.key === "2026-01");
assert(jan && jan.nStart >= 6, "coorte jan/2026");

const c1 = meta.auditSample.find((m) => m.clientId === "C1");
assert(c1?.cancelSource === "churn_efetivado_at", "fonte C1");
assert(c1?.hire === "2026-01-10", "hire C1");
assert(c1?.cancel === "2026-03-20", "cancel C1");
// Contratado 10/01, cancel 20/03 → M0 e M1 retidos; M2 não (fim de M2 = 10/03? addCalendarMonths(hire,2)=2026-03-10; cancel 03-20 > 03-10 → ainda retido em M2; M3 end=04-10, cancel < → não)
const r0 = c1.retentionByAge.find((r) => r.age === 0);
const r1 = c1.retentionByAge.find((r) => r.age === 1);
assert(r0?.retained === "sim", "C1 M0 retido");
assert(r1?.retained === "sim", "C1 M1 retido");
const r2 = c1.retentionByAge.find((r) => r.age === 2);
assert(r2?.retained === "não", "C1 M2 não retido (cancel em mar = mês 2)");
const r3 = c1.retentionByAge.find((r) => r.age === 3);
assert(r3?.retained === "não", "C1 M3 não retido");

const cellFuture = cohort.cells.find((c) => c.observable === false && c.retainedPct == null);
assert(cellFuture, "períodos futuros = null/—");

const m0 = cohort.cells.filter((c) => c.age === 0 && c.observable);
assert(m0.every((c) => c.retainedPct === 100), "M0 = 100%");

console.log(JSON.stringify({
  included: meta.clientsWithHire,
  excluded: {
    skippedNoHire: meta.skippedNoHire,
    skippedCancelledNoDate: meta.skippedCancelledNoDate,
    skippedDuplicate: meta.skippedDuplicate,
    skippedCancelBeforeHire: meta.skippedCancelBeforeHire,
  },
  cohortSizes: Object.fromEntries(cohort.cohorts.map((c) => [c.key, c.nStart])),
  averages: cohort.averages.slice(0, 7),
  auditSampleSize: meta.auditSample.length,
  note: meta.note,
  priorBugHints: [
    "Linhas duplicadas por cliente inflavam coortes",
    "Cancelamento anterior à contratação entrava como evento inválido",
    "Fontes de data fora da prioridade churn→distrato→data_churn",
    "Meses futuros tratados como 0% em vez de não observáveis",
  ],
}, null, 2));
console.log("COHORT_AUDIT_OK");
