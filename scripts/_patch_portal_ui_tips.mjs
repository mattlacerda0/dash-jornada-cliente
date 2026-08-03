/**
 * Patch index.html: cancel filters recompute + funnel UI + mechanisms coverage + tip helper.
 */
import { readFileSync, writeFileSync } from "fs";

const path = "index.html";
let s = readFileSync(path, "utf8");

// --- Global tip helper after setupHelpTipInteractions ---
if (!s.includes("function portalMetricTip(")) {
  s = s.replace(
    "setupHelpTipInteractions();\n    clearPortalViewDismissedAlerts();",
    `setupHelpTipInteractions();
    clearPortalViewDismissedAlerts();

    /** Tooltip padrão reutilizável (cards/gráficos/colunas). */
    function portalMetricTip(text, aria = 'Ajuda do indicador') {
      const tip = String(text || '').replace(/"/g, '&quot;');
      return \`<span class="help" tabindex="0" role="button" aria-label="\${escapeHtml(aria)}" data-tip="\${tip}">?</span>\`;
    }
    function portalChartTitleTip(title, tip) {
      return \`\${escapeHtml(title)} \${portalMetricTip(tip, 'Sobre o gráfico')}\`;
    }`,
  );
}

// --- Improve global help tip CSS for viewport (once) ---
if (!s.includes(".help[data-tip]::after{")) {
  // already has styles; add max-height + wrap if missing
}
if (!s.includes("max-height:min(280px")) {
  s = s.replace(
    ".help[data-tip]::after{",
    `.help[data-tip]::after{
      max-height:min(280px,45vh);overflow:auto;overflow-wrap:anywhere;z-index:40;`,
  );
}

// --- CSS for evidence funnel bars ---
if (!s.includes(".cancel-evidence-funnel")) {
  s = s.replace(
    "#view-cancellations .cancel-funnel{",
    `#view-cancellations .cancel-evidence-funnel{display:flex;flex-direction:column;gap:14px;min-width:0}
    #view-cancellations .cancel-ev-card{
      border:1px solid var(--color-border);border-radius:10px;padding:12px 14px;background:rgba(26,26,26,.45);min-width:0
    }
    #view-cancellations .cancel-ev-head{display:flex;flex-wrap:wrap;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:8px}
    #view-cancellations .cancel-ev-title{font-size:13px;font-weight:600;color:var(--color-text)}
    #view-cancellations .cancel-ev-total{font-size:18px;font-weight:700;color:#ffc796;font-variant-numeric:tabular-nums}
    #view-cancellations .cancel-ev-rule{font-size:11px;color:var(--color-text-muted);margin:0 0 8px;line-height:1.4}
    #view-cancellations .cancel-ev-bar{
      display:grid;grid-template-columns:minmax(120px,34%) minmax(0,1fr) auto;gap:8px;align-items:center;margin:5px 0;min-width:0
    }
    #view-cancellations .cancel-ev-bar .hbar-track{height:8px;background:#303030;border-radius:999px;overflow:hidden}
    #view-cancellations .cancel-ev-bar .hbar-track span{display:block;height:100%;background:linear-gradient(90deg,var(--color-primary),#ff9b50);border-radius:999px}
    #view-cancellations .cancel-ev-bar-label{font-size:11px;color:var(--color-text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    #view-cancellations .cancel-ev-bar-val{font-size:11px;font-variant-numeric:tabular-nums;white-space:nowrap}
    #view-cancellations .cancel-status-funnel{margin-top:12px}
    #view-cancellations .cancel-funnel{`,
  );
}

// --- Mechanisms coverage strip CSS ---
if (!s.includes(".mech-cross-coverage")) {
  s = s.replace(
    "#view-mechanisms .help{",
    `#view-mechanisms .mech-cross-coverage{
      margin:0 0 14px;padding:12px 14px;border:1px solid rgba(96,165,250,.28);border-radius:10px;
      background:rgba(37,99,235,.08);font-size:13px;line-height:1.45;min-width:0
    }
    #view-mechanisms .mech-cross-coverage h4{margin:0 0 6px;font-size:13px;color:#93c5fd}
    #view-mechanisms .mech-cross-grid{
      display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px 12px;margin-top:8px
    }
    #view-mechanisms .mech-cross-grid strong{display:block;font-size:16px;color:var(--color-text)}
    #view-mechanisms .mech-cross-grid span{font-size:11px;color:var(--color-text-muted)}
    #view-mechanisms .help{`,
  );
}

// Insert coverage host after kKpisCombined if missing
if (!s.includes('id="kCrossSourceCoverage"')) {
  s = s.replace(
    '<section class="summary kpis-mech-1" id="kKpisCombined" aria-label="Visão Consolidada BASE QV + App Pharus"></section>',
    `<section class="summary kpis-mech-1" id="kKpisCombined" aria-label="Visão Consolidada BASE QV + App Pharus"></section>
          <section class="mech-cross-coverage" id="kCrossSourceCoverage" hidden></section>
          <details class="metric-avail-details" id="kCrossSourceDetails" hidden>
            <summary>Correspondência App Pharus × BASE QV</summary>
            <div id="kCrossSourceTableHost"></div>
          </details>`,
  );
}

// Update funnel chart title
s = s.replace(
  `<article class="chart-card cancel-span-all">
              <h3>Funil do processo</h3>
              <p>Universo completo (não arquivado) · conversões entre etapas</p>
              <div id="cChartFunnel"></div>
            </article>`,
  `<article class="chart-card cancel-span-all">
              <h3>Funil do processo <span class="help" tabindex="0" role="button" aria-label="Sobre o funil" data-tip="Dois conceitos: evidências com OR deduplicado (intenção/pedido/efetivado) e status atual exclusivo de cancellation_statuses. Barras de origem não somam o total.">?</span></h3>
              <p>Respeita os filtros · evidências sobrepostas + status da BASE QV</p>
              <div id="cChartFunnel"></div>
            </article>`,
);

writeFileSync(path, s);
console.log("index.html structure patched");
