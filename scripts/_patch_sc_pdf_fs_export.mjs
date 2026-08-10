/**
 * Patch: PDF textual (sem matrizes), títulos FS corretos, export menu.
 * Run: node scripts/_patch_sc_pdf_fs_export.mjs
 */
import fs from "fs";

const path = new URL("../index.html", import.meta.url);
let s = fs.readFileSync(path, "utf8");
let n = 0;
function rep(a, b, label) {
  if (!s.includes(a)) {
    console.warn("MISS:", label);
    return false;
  }
  s = s.split(a).join(b);
  n += 1;
  console.log("OK:", label);
  return true;
}

// —— 1) Modal titles: data-sc-fs-title on each zoom bar ——
const fsTitles = [
  ["scCancelMatrixStage", "Cancelamento — correlações e associações"],
  ["scNpsMatrixStage", "NPS — matriz de correlação"],
  ["scRenewalMatrixStage", "Renovações — correlações e associações"],
  ["scTenureMatrixStage", "Permanência — matriz de correlação"],
  ["scGroupMatrixStage", "Matriz comparativa dos grupos"],
  ["scCohortStage", "Análise de cohort de retenção"],
  ["scMatrixStage", "Matriz geral de relações entre variáveis"],
  ["scNpsCompStage", "Matriz comparativa de NPS"],
];
for (const [id, title] of fsTitles) {
  rep(
    `data-sc-zoom-for="${id}"`,
    `data-sc-zoom-for="${id}" data-sc-fs-title="${title}"`,
    `fs-title-${id}`,
  );
}

rep(
  `if (action === 'fs') { scOpenFullscreen(stageId, bar.closest('.sc-axis-block, .section-head')?.querySelector('h2')?.textContent || 'Cohort'); return; }`,
  `if (action === 'fs') {
            const fsTitle = bar.getAttribute('data-sc-fs-title')
              || btn.getAttribute('data-sc-fs-title')
              || 'Visualização ampliada';
            scOpenFullscreen(stageId, fsTitle);
            return;
          }`,
  "fs-open-title",
);

rep(
  `scOpenFullscreen('scSurvivalChart', 'Curva de sobrevivência', extra);`,
  `scOpenFullscreen('scSurvivalChart', 'Curva de sobrevivência', extra);`,
  "survival-title-ok",
);

// —— 2) Export menu labels ——
rep(
  `<button type="button" data-format="xlsx">Excel</button>
              <button type="button" data-format="csv">CSV</button>`,
  `<button type="button" data-format="xlsx">Exportar Excel</button>
              <button type="button" data-format="csv">Exportar CSV</button>`,
  "export-menu-labels",
);

// —— 3) DOM export: include all rows (not only visible) ——
rep(
  `const rows = [...table.querySelectorAll('tbody tr')].filter((tr) => tr.offsetParent !== null).map((tr) => {`,
  `const rows = [...table.querySelectorAll('tbody tr')].map((tr) => {`,
  "export-all-rows",
);

// —— 4) Add missing SC export hosts near detail tables ——
rep(
  `<details class="sc-data-details"><summary>Ver dados da matriz de cancelamento</summary><div id="scCancelMatrixTable" class="table-wrap"></div></details>`,
  `<details class="sc-data-details"><summary>Ver dados da matriz de cancelamento <span class="export-host" id="scCancelMatrixExportHost" style="float:right" onclick="event.stopPropagation()"></span></summary><div id="scCancelMatrixTable" class="table-wrap"></div></details>`,
  "export-host-cancel-matrix",
);

rep(
  `<details class="sc-data-details"><summary>Ver ranking completo — cancelamento</summary><div id="scCancelRankTable" class="table-wrap"></div></details>`,
  `<details class="sc-data-details"><summary>Ver ranking completo — cancelamento <span class="export-host" id="scCancelRankExportHost" style="float:right" onclick="event.stopPropagation()"></span></summary><div id="scCancelRankTable" class="table-wrap"></div></details>`,
  "export-host-cancel-rank",
);

rep(
  `<details class="sc-data-details"><summary>Ver dados da matriz geral</summary><div id="scMatrixTableHost" class="table-wrap"></div></details>`,
  `<details class="sc-data-details"><summary>Ver dados da matriz geral <span class="export-host" id="scGeneralMatrixExportHost" style="float:right" onclick="event.stopPropagation()"></span></summary><div id="scMatrixTableHost" class="table-wrap"></div></details>`,
  "export-host-general-matrix",
);

rep(
  `<details class="sc-data-details"><summary>Ver clientes com sinais</summary><div id="scSignalsTable" class="table-wrap"></div></details>`,
  `<details class="sc-data-details"><summary>Ver clientes com sinais <span class="export-host" id="scSignalsExportHost" style="float:right" onclick="event.stopPropagation()"></span></summary><div id="scSignalsTable" class="table-wrap"></div></details>`,
  "export-host-signals",
);

rep(
  `<details class="sc-data-details"><summary>Ver dados da matriz de grupos</summary><div id="scGroupMatrixTable" class="table-wrap"></div></details>`,
  `<details class="sc-data-details"><summary>Ver dados da matriz de grupos</summary><div id="scGroupMatrixTable" class="table-wrap"></div></details>`,
  "group-table-ok",
);

// Move scDiff export closer to its table header text by leaving section host — OK.
// Deduplicate: remove export from cancel section head (scDiffExportHost) if we keep one near diff table.
rep(
  `<div class="section-head"><div><h2>3. Cancelamento — correlações e associações</h2>
              <p class="sc-section-note" style="margin:0">Mostra quais variáveis possuem maior relação observada com cancelamento. Valores maiores representam associações mais fortes, não causalidade.</p></div>
              <span class="export-host" id="scDiffExportHost"></span></div>`,
  `<div class="section-head"><div><h2>3. Cancelamento — correlações e associações</h2>
              <p class="sc-section-note" style="margin:0">Mostra quais variáveis possuem maior relação observada com cancelamento. Valores maiores representam associações mais fortes, não causalidade.</p></div></div>`,
  "remove-diff-host-from-section",
);

rep(
  `<details class="sc-data-details"><summary>Ver dados de cancelamento (diferenças)</summary>
              <section class="table-panel" style="margin:0;border:0;padding:0;background:transparent">
                <div class="table-wrap"><table class="sc-diff-table"><thead><tr>`,
  `<details class="sc-data-details"><summary>Ver dados de cancelamento (diferenças) <span class="export-host" id="scDiffExportHost" style="float:right" onclick="event.stopPropagation()"></span></summary>
              <section class="table-panel" style="margin:0;border:0;padding:0;background:transparent">
                <div class="table-wrap"><table class="sc-diff-table" data-export-covered="1"><thead><tr>`,
  "diff-export-on-details",
);

rep(
  `<div class="section-head"><div><h2>4. NPS — matriz de correlação</h2>
              <p class="sc-section-note" style="margin:0">Correlação com a nota NPS e diferença padronizada entre Promotores e Detratores (quando a amostra permite). Associação observada, não causalidade.</p></div>
              <span class="export-host" id="scNpsCorrExportHost"></span></div>`,
  `<div class="section-head"><div><h2>4. NPS — matriz de correlação</h2>
              <p class="sc-section-note" style="margin:0">Correlação com a nota NPS e diferença padronizada entre Promotores e Detratores (quando a amostra permite). Associação observada, não causalidade.</p></div></div>`,
  "remove-nps-corr-section-host",
);

rep(
  `<details class="sc-data-details"><summary>Ver dados de NPS (correlações)</summary><div id="scNpsCorrHost"></div></details>`,
  `<details class="sc-data-details"><summary>Ver dados de NPS (correlações) <span class="export-host" id="scNpsCorrExportHost" style="float:right" onclick="event.stopPropagation()"></span></summary><div id="scNpsCorrHost"></div></details>`,
  "nps-corr-export-on-details",
);

fs.writeFileSync(path, s);
console.log("partial patches:", n);
