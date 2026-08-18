/**
 * Etapa 8.4 — testes de fixtures e contrato do modal.
 * Sem chamada Gemini. Sem Git.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import vm from "vm";

const root = dirname(fileURLToPath(import.meta.url));

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail: detail || "" });
  console.log(`${ok ? "PASS" : "FAIL"} — ${name}${detail ? `: ${detail}` : ""}`);
}

function tryCase(name, fn) {
  try {
    record(name, true, fn() || "");
  } catch (err) {
    record(name, false, err.message);
  }
}

const fixtureSrc = readFileSync(resolve(root, "ai-analysis-fixtures.js"), "utf8");
const sandbox = { window: {} };
vm.runInNewContext(fixtureSrc, sandbox);
const fx = sandbox.window.AI_ANALYSIS_FIXTURES;
const html = readFileSync(resolve(root, "index.html"), "utf8");

tryCase("fixtures file exists and loads", () => {
  assert(existsSync(resolve(root, "ai-analysis-fixtures.js")));
  assert(fx && typeof fx === "object");
  return Object.keys(fx).join(", ");
});

tryCase("fixture complete renders all sections", () => {
  const ea = fx.complete.executive_analysis;
  assert(ea.headline && ea.executive_summary);
  assert(ea.attention_points.length >= 1);
  assert(ea.positive_signals.length >= 1);
  assert(ea.recommended_actions.length >= 1);
  assert(ea.limitations.length >= 1);
  assert(ea.attention_points.some((p) => p.severity === "critical"));
  assert(ea.attention_points.some((p) => p.severity === "attention"));
});

tryCase("fixture attention_only hides positives conceptually (empty array)", () => {
  assert(fx.attention_only.executive_analysis.positive_signals.length === 0);
  assert(fx.attention_only.executive_analysis.attention_points.length >= 1);
  assert(fx.attention_only.executive_analysis.recommended_actions.length >= 1);
});

tryCase("fixture no_actions has empty recommended_actions", () => {
  assert(fx.no_actions.executive_analysis.recommended_actions.length === 0);
  assert(fx.no_actions.executive_analysis.limitations.length >= 1);
});

tryCase("fixture rate_limited", () => {
  assert(fx.rate_limited.success === false);
  assert(fx.rate_limited.reason === "rate_limited");
});

tryCase("fixture generic_error", () => {
  assert(fx.generic_error.success === false);
  assert(fx.generic_error.code === "ai_generation_failed");
});

tryCase("fixture ai_not_configured", () => {
  assert(fx.ai_not_configured.code === "ai_not_configured");
});

tryCase("modal HTML has required nodes", () => {
  assert(html.includes('id="aiAnalysisModal"'));
  assert(html.includes('id="aiAnalysisBody"'));
  assert(html.includes('id="aiAnalysisRefresh"'));
  assert(html.includes('id="aiAnalysisAsk"'));
  assert(html.includes('Integração disponível em breve.'));
  assert(html.includes("Disponível após a conclusão da análise."));
});

tryCase("frontend calls existing endpoint with generate true", () => {
  assert(html.includes("'/api/ai-analysis'"));
  assert(html.includes("generate: true"));
  assert(html.includes("Resumo analisado pela IA"));
  assert(html.includes("Resumo com IA disponível em breve nesta página."));
  assert(html.includes("backendPage: 'general'"));
  assert(html.includes("backendPage: 'meetings'"));
  assert(html.includes("backendPage: 'statistical-crosses'"));
  assert(html.includes("backendPage: 'renewal'"));
  assert(html.includes("backendPage: 'ep'"));
  assert(html.includes("backendPage: 'temporal'"));
  assert(html.includes("plan: { enabled: false"));
  assert(html.includes("mechanisms: { enabled: false"));
});

tryCase("rate limit and error copy is user-facing", () => {
  assert(html.includes("Análise temporariamente indisponível"));
  assert(html.includes("O serviço de IA atingiu o limite temporário de processamento."));
  assert(html.includes("Tente novamente em alguns instantes."));
  assert(html.includes("Análise com IA ainda não está configurada neste ambiente."));
  assert(html.includes("A funcionalidade estará disponível após a configuração do serviço de IA."));
  assert(html.includes("Não foi possível gerar a análise agora."));
  assert(html.includes("Não foi possível conectar ao serviço de análise."));
  assert(html.includes("Análise com IA em breve nesta página"));
  assert(!html.includes("HTTP 429"));
});

tryCase("modal states have distinct layouts", () => {
  assert(html.includes("setModalMode"));
  assert(html.includes("is-loading"));
  assert(html.includes("is-success"));
  assert(html.includes("is-error"));
  assert(html.includes("is-unsupported"));
  assert(html.includes("Preparando análise executiva"));
  assert(html.includes("Estamos lendo os principais indicadores desta página."));
  assert(html.includes("ai-skel--line"));
  assert(html.includes("ai-analysis-state--rate"));
  assert(html.includes("kind: 'loading'"));
});

tryCase("no duplicate Fechar in modal body", () => {
  const start = html.indexOf('id="aiAnalysisModal"');
  const end = html.indexOf("Análise com IA (Etapa 8.4 — modal funcional)");
  assert(start > 0 && end > start, "modal markers");
  const modalHtml = html.slice(start, end);
  assert(!modalHtml.includes("data-ai-dismiss"));
  assert((modalHtml.match(/id="aiAnalysisClose"/g) || []).length === 1);
  assert((modalHtml.match(/id="aiAnalysisDismiss"/g) || []).length === 1);
  assert(!/>Fechar<\/button>[\s\S]*data-ai-retry/.test(modalHtml));
  const bodyFechar = (html.match(/data-ai-retry>Tentar novamente[\s\S]{0,180}Fechar/g) || []).length;
  assert(bodyFechar === 0, "retry must not be followed by a body Fechar");
});

tryCase("footer actions are state-dependent", () => {
  assert(html.includes('id="aiAnalysisRefresh" hidden'));
  assert(html.includes('id="aiAnalysisAsk" hidden'));
  assert(html.includes('id="aiAnalysisExport" hidden'));
  assert(html.includes("refreshBtn.hidden = !isSuccess"));
  assert(html.includes("askBtn.hidden = !isSuccess"));
  assert(html.includes("exportBtn.hidden = !isSuccess"));
  assert(html.includes("data-ai-retry>Tentar novamente"));
});

tryCase("no Gemini key or prompt in frontend", () => {
  assert(!/GEMINI_API_KEY/.test(html));
  assert(!html.includes("generativelanguage.googleapis.com"));
  assert(!html.includes("EXECUTIVE_SYSTEM_PROMPT"));
});

tryCase("modal renders highlight numbers and scope", () => {
  assert(html.includes("ai-analysis-highlights"));
  assert(html.includes("ai-analysis-scope"));
  assert(html.includes("Números de destaque"));
  assert(html.includes("Escopo · "));
});

tryCase("sucesso com executive_analysis prevalece sobre 429", () => {
  assert(html.includes("payload?.success && payload?.executive_analysis"));
  const successIdx = html.indexOf("payload?.success && payload?.executive_analysis");
  const rateIdx = html.indexOf("httpStatus === 429");
  assert(successIdx > 0 && rateIdx > successIdx);
  assert(html.includes("Análise gerada agora"));
  assert(html.includes("refresh: Boolean(opts?.refresh)"));
});

tryCase("fixtures not auto-enabled for production hostnames", () => {
  assert(html.includes("hostname === 'localhost'"));
  assert(html.includes("aiFixture"));
});

const failed = results.filter((r) => !r.ok);
console.log("\n--- Etapa 8.4 ---");
console.log(`total=${results.length} pass=${results.length - failed.length} fail=${failed.length}`);
if (failed.length) {
  process.exitCode = 1;
  for (const f of failed) console.error(`FAIL ${f.name}: ${f.detail}`);
}
