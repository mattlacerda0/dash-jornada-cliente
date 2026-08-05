/**
 * Retenção por coorte (heatmap) — permanência contratual BASE QV.
 * Coorte = mês/trimestre de contratação; idade = meses completos desde a contratação.
 */
import { calendarDateFromValue, civilDateInSaoPaulo } from "./client-cycle-renewal.mjs";
import { round3 } from "./stats-tests.mjs";

function parseYmd(ymd) {
  if (!ymd || !/^\d{4}-\d{2}-\d{2}$/.test(String(ymd).slice(0, 10))) return null;
  const [y, m, d] = String(ymd).slice(0, 10).split("-").map(Number);
  return { y, m, d };
}

function ymdParts(y, m, d) {
  const mm = String(m).padStart(2, "0");
  const dd = String(d).padStart(2, "0");
  return `${y}-${mm}-${dd}`;
}

/** Adiciona N meses civis à data YYYY-MM-DD (mantém dia, clamp no fim do mês). */
export function addCalendarMonths(ymd, months) {
  const p = parseYmd(ymd);
  if (!p || !Number.isFinite(months)) return null;
  const idx = p.y * 12 + (p.m - 1) + Math.trunc(months);
  const y = Math.floor(idx / 12);
  const m = (idx % 12) + 1;
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const d = Math.min(p.d, lastDay);
  return ymdParts(y, m, d);
}

/** Meses civis completos de fromYmd até toYmd (floor). */
export function completeMonthsBetween(fromYmd, toYmd) {
  const a = parseYmd(fromYmd);
  const b = parseYmd(toYmd);
  if (!a || !b) return null;
  let months = (b.y - a.y) * 12 + (b.m - a.m);
  if (b.d < a.d) months -= 1;
  return months;
}

function hireYmd(client) {
  return calendarDateFromValue(client?.contractDate || client?.hireDate || client?.acquisitionDate);
}

function cancelYmd(client) {
  if (!client?.isCancelled) return null;
  return calendarDateFromValue(client.cancellationDate);
}

function cohortKeyFromHire(hire, granularity) {
  const p = parseYmd(hire);
  if (!p) return null;
  if (granularity === "quarter") {
    const q = Math.floor((p.m - 1) / 3) + 1;
    return `${p.y}-Q${q}`;
  }
  return `${p.y}-${String(p.m).padStart(2, "0")}`;
}

function cohortLabel(key, granularity) {
  if (!key) return null;
  if (granularity === "quarter") {
    const m = /^(\d{4})-Q([1-4])$/.exec(key);
    return m ? `T${m[2]} ${m[1]}` : key;
  }
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return key;
  const months = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  return `${months[Number(m[2]) - 1]}/${m[1]}`;
}

/** Último dia civil do período da coorte (mês ou trimestre). */
function cohortPeriodEnd(key, granularity) {
  if (granularity === "quarter") {
    const m = /^(\d{4})-Q([1-4])$/.exec(key);
    if (!m) return null;
    const y = Number(m[1]);
    const q = Number(m[2]);
    const endMonth = q * 3;
    const lastDay = new Date(Date.UTC(y, endMonth, 0)).getUTCDate();
    return ymdParts(y, endMonth, lastDay);
  }
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const lastDay = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  return ymdParts(y, mo, lastDay);
}

/**
 * Retido na idade N se nunca cancelou com data, ou cancelamento é DEPOIS do fim do mês N desde a contratação.
 * Idade futura (cutoff < fim do mês N) → não observável.
 */
function retentionAtAge(hire, cancel, cutoff, age) {
  const endOfAge = addCalendarMonths(hire, age);
  if (!endOfAge) return { observable: false, retained: null };
  if (cutoff < endOfAge) return { observable: false, retained: null };
  if (!cancel) return { observable: true, retained: true };
  return { observable: true, retained: cancel > endOfAge };
}

/**
 * @param {object[]} clients
 * @param {{ granularity?: 'month'|'quarter', cutoffDate?: Date|string }} [options]
 */
export function buildCohortRetention(clients, options = {}) {
  const granularity = String(options.granularity || "month").toLowerCase() === "quarter" ? "quarter" : "month";
  const cutoffRaw = options.cutoffDate != null ? options.cutoffDate : new Date();
  const cutoff =
    typeof cutoffRaw === "string" && /^\d{4}-\d{2}-\d{2}/.test(cutoffRaw)
      ? cutoffRaw.slice(0, 10)
      : civilDateInSaoPaulo(cutoffRaw instanceof Date ? cutoffRaw : new Date(cutoffRaw)) ||
        civilDateInSaoPaulo(new Date());

  const hireFrom = options.hireFrom ? String(options.hireFrom).slice(0, 10) : null;
  const hireTo = options.hireTo ? String(options.hireTo).slice(0, 10) : null;

  const members = [];
  let skippedNoHire = 0;
  for (const c of clients || []) {
    const hire = hireYmd(c);
    if (!hire || hire > cutoff) {
      skippedNoHire += 1;
      continue;
    }
    if (hireFrom && hire < hireFrom) continue;
    if (hireTo && hire > hireTo) continue;
    const key = cohortKeyFromHire(hire, granularity);
    if (!key) {
      skippedNoHire += 1;
      continue;
    }
    const cancel = cancelYmd(c);
    members.push({
      clientId: c.clientId,
      hire,
      cancel,
      key,
      ageMonth: completeMonthsBetween(hire, cancel && cancel <= cutoff ? cancel : cutoff),
    });
  }

  const byCohort = new Map();
  for (const m of members) {
    if (!byCohort.has(m.key)) byCohort.set(m.key, []);
    byCohort.get(m.key).push(m);
  }

  const cohortKeys = [...byCohort.keys()].sort();
  const cohorts = cohortKeys.map((key) => ({
    key,
    label: cohortLabel(key, granularity),
    nStart: byCohort.get(key).length,
    periodEnd: cohortPeriodEnd(key, granularity),
  }));

  let maxAge = 0;
  for (const m of members) {
    // Idades observáveis: até complete months hire→cutoff
    const obs = completeMonthsBetween(m.hire, cutoff);
    if (obs != null && obs > maxAge) maxAge = obs;
  }
  // Cap razoável para heatmap (evita matrizes enormes)
  maxAge = Math.min(Math.max(0, maxAge), 60);
  const ages = Array.from({ length: maxAge + 1 }, (_, i) => i);

  const cells = [];
  for (const cohort of cohorts) {
    const group = byCohort.get(cohort.key) || [];
    const nStart = group.length;
    for (const age of ages) {
      if (age === 0) {
        cells.push({
          cohortKey: cohort.key,
          age: 0,
          retainedPct: nStart > 0 ? 100 : null,
          retainedN: nStart,
          cancelledCum: 0,
          observable: nStart > 0,
        });
        continue;
      }

      let observableN = 0;
      let retainedN = 0;
      for (const m of group) {
        const r = retentionAtAge(m.hire, m.cancel, cutoff, age);
        if (!r.observable) continue;
        observableN += 1;
        if (r.retained) retainedN += 1;
      }

      // Coorte observável na idade N se o fim do período da coorte + N meses ≤ cutoff
      // (todos os membros do período já puderam atingir a idade).
      const periodEnd = cohort.periodEnd;
      const cohortAgeEnd = periodEnd ? addCalendarMonths(periodEnd, age) : null;
      const cohortObservable = Boolean(cohortAgeEnd && cutoff >= cohortAgeEnd && nStart > 0);

      if (!cohortObservable || observableN === 0) {
        cells.push({
          cohortKey: cohort.key,
          age,
          retainedPct: null,
          retainedN: null,
          cancelledCum: null,
          observable: false,
        });
        continue;
      }

      cells.push({
        cohortKey: cohort.key,
        age,
        retainedPct: round3((retainedN / nStart) * 100),
        retainedN,
        cancelledCum: nStart - retainedN,
        observable: true,
      });
    }
  }

  const averages = ages.map((age) => {
    const obs = cells.filter((c) => c.age === age && c.observable && c.retainedPct != null);
    if (!obs.length) {
      return { age, meanRetentionPct: null, deltaPp: null, cohortsObservable: 0 };
    }
    const meanRetentionPct = round3(obs.reduce((a, c) => a + c.retainedPct, 0) / obs.length);
    return { age, meanRetentionPct, deltaPp: null, cohortsObservable: obs.length };
  });
  for (let i = 1; i < averages.length; i += 1) {
    const prev = averages[i - 1].meanRetentionPct;
    const cur = averages[i].meanRetentionPct;
    averages[i].deltaPp =
      prev != null && cur != null ? round3(cur - prev) : null;
  }

  return {
    granularity,
    cutoffDate: cutoff,
    hireFrom,
    hireTo,
    periodLabel: hireFrom ? (hireTo ? `${hireFrom} → ${hireTo}` : `desde ${hireFrom}`) : "todo o histórico elegível",
    cohorts,
    ages,
    cells,
    averages,
    metadata: {
      clientsWithHire: members.length,
      skippedNoHire,
      cohortCount: cohorts.length,
      maxAge,
      note:
        "Retido na idade N se cancelamento analítico é posterior ao fim do mês N desde a contratação (ou nunca cancelou). Idades futuras = null.",
    },
  };
}
