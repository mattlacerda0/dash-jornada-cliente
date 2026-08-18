/**
 * Etapa 8.7 — refinamento visual e deduplicação estatística.
 * Sem Git. Sem Gemini live. Sem n8n.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
for (const name of [".env", "exemplo.env"]) {
  const p = resolve(root, name);
  if (!existsSync(p)) continue;
  for (const raw of readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !process.env[key]) process.env[key] = value;
  }
}
process.env.PORTAL_INTERNAL_DATA_RUN = "1";
if (!process.env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = "test-mock-key";

import { composeDeterministicAnalysis, analysisHasForbiddenCausality } from "./netlify/functions/_shared/executive-composer.mjs";
import { extractCandidatesFromSnapshot, groupStatisticalInsights } from "./netlify/functions/_shared/executive-candidates.mjs";
import { visibleAnalysisHasTechnicalLeak } from "./netlify/functions/_shared/executive-labels.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assert");
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || "" });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
}
function tryCase(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then((detail) => record(name, true, detail))
    .catch((err) => record(name, false, err.message));
}

function loadSnapshot(page) {
  const file = resolve(root, `docs/debug-executive-snapshot-${page}.json`);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  return raw.executive_snapshot || raw;
}

const html = readFileSync(resolve(root, "index.html"), "utf8");
const snap = loadSnapshot("statistical-crosses");

await tryCase("estatísticas: agrupa a mesma variável em um insight", () => {
  const grouped = groupStatisticalInsights(snap);
  const themes = grouped.filter((c) => c.reason === "multi_method_theme");
  assert(themes.length === 1, `themes=${themes.length}`);
  assert(themes[0].methods?.length >= 2, "methods");
  assert(themes[0].insight_group === "daysToFirstMeeting");
  const sameVarCards = grouped.filter((c) => c.insight_group === "daysToFirstMeeting");
  assert(sameVarCards.length === 1, `same var cards=${sameVarCards.length}`);
  return themes[0].title;
});

await tryCase("estatísticas: diversidade sem repetir o mesmo card", () => {
  const a = composeDeterministicAnalysis(snap, extractCandidatesFromSnapshot(snap)).executive_analysis;
  assert(!analysisHasForbiddenCausality(a));
  assert(!visibleAnalysisHasTechnicalLeak(a).hit, visibleAnalysisHasTechnicalLeak(a).snippet);
  assert(a.attention_points.length >= 3 && a.attention_points.length <= 5);
  const titles = a.attention_points.map((c) => c.title);
  const blob = titles.join(" | ");
  const firstMeetingMentions = titles.filter((t) => /primeira reunião|tempo até/i.test(t)).length;
  assert(firstMeetingMentions <= 1, blob);
  assert(titles.some((t) => /reunião|associ/i.test(t)));
  assert(titles.some((t) => /perman/i.test(t)));
  assert(titles.some((t) => /reten/i.test(t)));
  const evidenceBlob = JSON.stringify(a.attention_points[0].evidence || []);
  assert(/Força da associação|Capacidade de diferenciar|Diferença entre grupos/.test(evidenceBlob));
  return titles.join(" | ");
});

await tryCase("estatísticas: highlight de associação não parece dias", () => {
  const a = composeDeterministicAnalysis(snap).executive_analysis;
  const assoc = a.highlight_numbers.find((h) => h.metric === "sc_top_association" || h.unit === "association");
  assert(assoc, "highlight association ausente");
  assert(/associa/i.test(assoc.label), assoc.label);
  assert(!/^Dias até primeira reunião$/i.test(assoc.label), assoc.label);
  return `${assoc.value} · ${assoc.label}`;
});

await tryCase("botão IA: texto, enabled e disabled", () => {
  assert(html.includes("Resumo analisado pela IA"));
  assert(!html.includes('<span class="btn-ai-analysis-label">Análise com IA</span>'));
  assert(/general:\s*\{\s*enabled:\s*true/.test(html));
  assert(/meetings:\s*\{\s*enabled:\s*true/.test(html));
  assert(/'statistical-crosses':\s*\{\s*enabled:\s*true/.test(html));
  assert(/renewal:\s*\{\s*enabled:\s*true/.test(html));
  assert(/ep:\s*\{\s*enabled:\s*true/.test(html));
  assert(/temporal:\s*\{\s*enabled:\s*true/.test(html));
  assert(/plan:\s*\{\s*enabled:\s*false/.test(html));
  assert(/mechanisms:\s*\{\s*enabled:\s*false/.test(html));
  assert(html.includes("Resumo com IA disponível em breve nesta página."));
  assert(html.includes("btn.disabled || btn.classList.contains('is-disabled')"));
});

await tryCase("alertas persistentes ocultos no corpo das páginas", () => {
  assert(html.includes(".view .portal-alert{display:none!important}"));
});

await tryCase("chatbot dourado preenchido e accents no painel", () => {
  assert(html.includes("asst-launcher::after"));
  assert(html.includes("background:linear-gradient(145deg,#f3dd9a,#d4b45a 52%,#c49a3e)"));
  assert(/\.asst-launcher\{[^}]*color:var\(--color-ai-gold-ink\)/.test(html));
  assert(!html.includes("background:linear-gradient(145deg,#f47920,#d9660f)"));
  assert(html.includes(".asst-send{") && html.includes("var(--color-ai-gold)"));
  assert(html.includes(".asst-input:focus{border-color:var(--color-ai-gold)"));
  assert(html.includes(".asst-chip:hover{border-color:var(--color-ai-gold)"));
});

await tryCase("KPI highlight permanece laranja, sem faixa e sem dourado", () => {
  assert(html.includes(".kpi-card--highlight"));
  assert(html.includes(".metric.highlight"));
  assert(html.includes("box-shadow:0 0 0 1px rgba(244,121,32,.08),0 10px 26px rgba(244,121,32,.10),0 0 22px rgba(244,121,32,.12)"));
  assert(!html.includes("border-top:2px solid var(--color-primary)"));
  assert(html.includes("#view-cancellations .metric.kpi-effective{"));
  assert(html.includes("border:1px solid rgba(244,121,32,.40)"));
  assert(html.includes("#view-cancellations .metric.kpi-primary .metric-value{color:#ffc796"));
  assert(!html.includes("#view-cancellations .metric.kpi-effective .metric-value{color:#f0d78c"));
  assert(!html.includes("#view-mechanisms .metric.kpi-primary{\n      border-color:rgba(212,180,90,.40)"));
});

await tryCase("logo do portal usa favicon.ico", () => {
  assert(html.includes('<link rel="icon" href="/favicon.ico"'));
  assert(html.includes('src="/favicon.ico"'));
  assert(!html.includes('aria-label="Quarta Via">QV</div>'));
});

await tryCase("linguagem humana permanece nas estatísticas", () => {
  const a = composeDeterministicAnalysis(snap).executive_analysis;
  const text = [a.headline, a.executive_summary, ...a.attention_points.map((c) => `${c.title} ${c.description}`)].join(" ");
  for (const token of ["daysToFirstMeeting", "vw_info_cliente", "public.clients", "payload", "PostgREST"]) {
    assert(!text.includes(token), token);
  }
});

const failed = results.filter((r) => !r.ok);
console.log("\n--- Etapa 8.7 visual/executivo ---");
console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
if (failed.length) {
  process.exitCode = 1;
  for (const f of failed) console.error(`FAIL ${f.name}: ${f.detail}`);
}
