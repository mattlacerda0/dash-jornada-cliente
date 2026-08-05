/**
 * Corrige visualizações da página Análises Estatísticas:
 * - heatmap SVG (matriz e coorte)
 * - curva KM em degraus com tooltip / n em risco / censura
 * - tabelas recolhidas
 * - gráficos AUC / diff / NPS
 * Sem Git. Sem alteração de regras estatísticas no backend.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const path = resolve(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
let html = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function replaceOnce(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error(`Missing: ${label}`);
  html = html.replace(oldStr, newStr);
}

// --- CSS upgrades ---
{
  const cssOld = `#view-statistical-crosses .sc-matrix-wrap{width:100%;max-width:100%;overflow:auto;min-width:0;border:1px solid var(--color-border);border-radius:8px;background:#141414}`;
  const cssNew = `#view-statistical-crosses .sc-matrix-layout{display:grid;grid-template-columns:minmax(0,1fr) 56px;gap:12px;align-items:start;min-width:0}
    #view-statistical-crosses .sc-matrix-wrap{width:100%;max-width:100%;overflow:auto;min-width:0;border:1px solid var(--color-border);border-radius:8px;background:#141414;padding:8px;box-sizing:border-box}
    #view-statistical-crosses .sc-matrix-svg{display:block;min-width:480px}
    #view-statistical-crosses .sc-matrix-legend{width:56px;min-height:180px}
    #view-statistical-crosses .sc-matrix-insights{margin:12px 0 8px;padding:12px;border:1px solid var(--color-border);border-radius:8px;background:rgba(255,255,255,.03)}
    #view-statistical-crosses .sc-matrix-insights ul{margin:8px 0 0;padding-left:18px;font-size:12px;line-height:1.45;color:var(--color-text-muted)}
    #view-statistical-crosses .sc-chart-host{width:100%;min-height:220px;border:1px solid var(--color-border);border-radius:8px;background:#141414;padding:12px;box-sizing:border-box;margin-bottom:10px;overflow:auto}
    #view-statistical-crosses .sc-chart-host svg{display:block;width:100%;max-width:100%}
    #view-statistical-crosses .sc-at-risk{margin:8px 0 12px;overflow:auto}
    #view-statistical-crosses .sc-at-risk table{border-collapse:collapse;font-size:11px}
    #view-statistical-crosses .sc-at-risk th,#view-statistical-crosses .sc-at-risk td{border:1px solid var(--color-border);padding:4px 8px;text-align:center}
    #view-statistical-crosses .sc-tooltip-float{position:fixed;z-index:90;pointer-events:none;max-width:280px;padding:8px 10px;border-radius:6px;background:#111;border:1px solid #555;color:#eee;font-size:11px;line-height:1.4;box-shadow:0 6px 18px rgba(0,0,0,.45)}
    #view-statistical-crosses details.sc-data-details{margin:8px 0 16px;padding:8px 12px;border:1px solid var(--color-border);border-radius:8px;background:rgba(26,26,26,.55)}
    #view-statistical-crosses details.sc-data-details > summary{cursor:pointer;font-weight:600;font-size:13px;list-style:revert}
    @media(max-width:900px){#view-statistical-crosses .sc-matrix-layout{grid-template-columns:1fr}}`;
  if (html.includes(cssOld)) html = html.replace(cssOld, cssNew);
}

// --- HTML: matrix section hosts ---
replaceOnce(
  `          <div id="scMatrixVarsHost" class="sc-matrix-vars"></div>
          <div id="scMatrixHost" class="sc-matrix-wrap"></div>
          <aside id="scMatrixDrawer" class="sc-matrix-drawer" hidden>
            <button type="button" class="sc-matrix-drawer-close" id="scMatrixDrawerClose" aria-label="Fechar">×</button>
            <div id="scMatrixDrawerBody"></div>
          </aside>`,
  `          <div id="scMatrixVarsHost" class="sc-matrix-vars"></div>
          <div class="sc-matrix-layout">
            <div id="scMatrixHost" class="sc-matrix-wrap" aria-label="Heatmap de correlação"></div>
            <div id="scMatrixLegend" class="sc-matrix-legend" aria-hidden="true"></div>
          </div>
          <div id="scMatrixInsights" class="sc-matrix-insights"></div>
          <details class="sc-data-details"><summary>Ver dados da matriz</summary><div id="scMatrixTableHost" class="table-wrap"></div></details>
          <aside id="scMatrixDrawer" class="sc-matrix-drawer" hidden>
            <button type="button" class="sc-matrix-drawer-close" id="scMatrixDrawerClose" aria-label="Fechar">×</button>
            <div id="scMatrixDrawerBody"></div>
          </aside>`,
  "matrix hosts",
);

// --- ativos vs cancelados: chart first ---
replaceOnce(
  `          <div class="section-head"><div><h2>4. Ativos vs cancelados</h2><p>Comparação das medianas dos clientes ativos e cancelados efetivados. Valores positivos indicam que a mediana dos cancelados é maior; valores negativos indicam que é menor.</p></div><span class="export-host" id="scDiffExportHost"></span></div>
          <p class="sc-section-note">Esta comparação mostra diferenças observadas entre os grupos. Não significa que uma variável causou o cancelamento. <span class="help" tabindex="0" data-tip="Compara as medianas dos dois grupos. Associação: intensidade e direção da relação com o cancelamento (não causalidade). Cobertura: percentual da população com valor válido para a variável.">?</span></p>
          <section class="table-panel">
            <div class="table-wrap">
              <table class="sc-diff-table">`,
  `          <div class="section-head"><div><h2>4. Ativos vs cancelados</h2><p>Comparação das medianas dos clientes ativos e cancelados efetivados. Valores positivos indicam que a mediana dos cancelados é maior; valores negativos indicam que é menor.</p></div><span class="export-host" id="scDiffExportHost"></span></div>
          <p class="sc-section-note">Esta comparação mostra diferenças observadas entre os grupos. Não significa que uma variável causou o cancelamento. <span class="help" tabindex="0" data-tip="Compara as medianas dos dois grupos. Associação: intensidade e direção da relação com o cancelamento (não causalidade). Cobertura: percentual da população com valor válido para a variável.">?</span></p>
          <label style="display:inline-block;margin:0 0 8px;font-size:12px">Unidade do gráfico
            <select id="scDiffUnit"><option value="time">Tempo / dias</option><option value="meetings">Reuniões</option><option value="money">Financeiro</option><option value="nps">NPS</option><option value="mech">Mecanismos</option></select>
          </label>
          <div id="scDiffChart" class="sc-chart-host"></div>
          <p class="note-muted" id="scDiffNarration"></p>
          <details class="sc-data-details"><summary>Ver dados</summary>
          <section class="table-panel" style="margin:0;border:0;padding:0;background:transparent">
            <div class="table-wrap">
              <table class="sc-diff-table">`,
  "diff chart wrap start",
);

replaceOnce(
  `            <div class="empty" id="scDiffEmpty">Não há dados suficientes para este recorte.</div>
          </section>

          <div class="section-head"><div><h2>5. Associação com cancelamento`,
  `            <div class="empty" id="scDiffEmpty">Não há dados suficientes para este recorte.</div>
          </section>
          </details>

          <div class="section-head"><div><h2>5. Associação com cancelamento`,
  "diff chart wrap end",
);

// AUC chart
replaceOnce(
  `          <div class="section-head"><div><h2>6. Poder discriminativo individual</h2><p class="sc-section-note" style="margin:0">AUC mede quanto uma variável, isoladamente, separa ativos de cancelados.</p></div><span class="export-host" id="scAucExportHost"></span></div>
          <section class="table-panel">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Variável</th>
                    <th class="num">AUC original</th>
                    <th class="num">AUC ajustada</th>
                    <th>Direção</th>
                    <th class="num">Amostra</th>
                    <th class="num">Cobertura</th>
                    <th>Status</th>
                    <th>Observação</th>
                  </tr>
                </thead>
                <tbody id="scAucRows"></tbody>
              </table>
            </div>
            <div class="empty" id="scAucEmpty" hidden>Não há variáveis elegíveis para AUC neste recorte.</div>
          </section>`,
  `          <div class="section-head"><div><h2>6. Poder discriminativo individual</h2><p class="sc-section-note" style="margin:0">AUC mede quanto uma variável, isoladamente, separa ativos de cancelados. Não é precisão de um modelo completo.</p></div><span class="export-host" id="scAucExportHost"></span></div>
          <div id="scAucChart" class="sc-chart-host"></div>
          <p class="note-muted" id="scAucNarration"></p>
          <details class="sc-data-details"><summary>Ver dados</summary>
          <section class="table-panel" style="margin:0;border:0;padding:0;background:transparent">
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Variável</th>
                    <th class="num">AUC original</th>
                    <th class="num">AUC ajustada</th>
                    <th>Direção</th>
                    <th class="num">Amostra</th>
                    <th class="num">Cobertura</th>
                    <th>Status</th>
                    <th>Observação</th>
                  </tr>
                </thead>
                <tbody id="scAucRows"></tbody>
              </table>
            </div>
            <div class="empty" id="scAucEmpty" hidden>Não há variáveis elegíveis para AUC neste recorte.</div>
          </section>
          </details>`,
  "auc chart",
);

// NPS groups chart
replaceOnce(
  `          <div class="section-head"><div><h2>8. Promotores, Neutros e Detratores <span class="help" tabindex="0" data-tip="A classificação usa a resposta NPS mais recente de cada cliente.">?</span></h2><p class="sc-section-note" style="margin:0">Classificação pela nota mais recente (9–10 / 7–8 / 0–6).</p></div><span class="export-host" id="scNpsGroupsExportHost"></span></div>
          <section class="table-panel">`,
  `          <div class="section-head"><div><h2>8. Promotores, Neutros e Detratores <span class="help" tabindex="0" data-tip="A classificação usa a resposta NPS mais recente de cada cliente.">?</span></h2><p class="sc-section-note" style="margin:0">Classificação pela nota mais recente (9–10 / 7–8 / 0–6).</p></div><span class="export-host" id="scNpsGroupsExportHost"></span></div>
          <div id="scNpsGroupsChart" class="sc-chart-host"></div>
          <p class="note-muted" id="scNpsGroupsNarration"></p>
          <details class="sc-data-details"><summary>Ver dados</summary>
          <section class="table-panel" style="margin:0;border:0;padding:0;background:transparent">`,
  "nps groups chart start",
);

// Close NPS details - find scNpsGroupEmpty section end
{
  const marker = `<div class="empty" id="scNpsGroupEmpty" hidden>Sem respostas NPS válidas no recorte.</div>
          </section>

          <div class="section-head"><div><h2>9. Associação com renovação`;
  if (!html.includes(marker)) throw new Error("nps close marker");
  html = html.replace(
    marker,
    `<div class="empty" id="scNpsGroupEmpty" hidden>Sem respostas NPS válidas no recorte.</div>
          </section>
          </details>

          <div class="section-head"><div><h2>9. Associação com renovação`,
  );
}

// Survival section enhancements
replaceOnce(
  `          <div id="scSurvivalChart" class="sc-survival-chart"></div>
          <p class="note-muted" id="scSurvivalNarration"></p>
          <details class="metric-avail-details"><summary>Ver dados da curva</summary><div id="scSurvivalHost"></div></details>
          <div id="scSurvivalGroupsHost" style="margin-top:12px"></div>`,
  `          <label style="display:inline-block;margin:0 0 8px;font-size:12px">Comparar por
            <select id="scSurvivalCompare">
              <option value="overall" selected>Curva geral</option>
              <option value="segment">Segmento</option>
              <option value="npsClass">Classe NPS</option>
              <option value="hasRenewed">Renovou / não renovou</option>
              <option value="hasMeeting">Possui reunião</option>
              <option value="hasMechanism">Possui mecanismo</option>
              <option value="hasFinancialData">Diagnóstico financeiro</option>
              <option value="engineer">EP (amostra mínima)</option>
            </select>
          </label>
          <div id="scSurvivalChart" class="sc-chart-host sc-survival-chart"></div>
          <div id="scAtRiskHost" class="sc-at-risk"></div>
          <p class="note-muted" id="scSurvivalNarration"></p>
          <details class="sc-data-details"><summary>Ver dados da curva</summary><div id="scSurvivalHost"></div></details>
          <details class="sc-data-details"><summary>Ver grupos estratificados (tabela)</summary><div id="scSurvivalGroupsHost" style="margin-top:12px"></div></details>`,
  "survival hosts",
);

// Cohort: add table details
replaceOnce(
  `          <div id="scCohortHost" class="sc-cohort-wrap"></div>
          <p class="note-muted" id="scCohortNote"></p>`,
  `          <div id="scCohortHost" class="sc-chart-host sc-cohort-wrap"></div>
          <p class="note-muted" id="scCohortNote"></p>
          <details class="sc-data-details"><summary>Ver dados da coorte</summary><div id="scCohortTableHost" class="table-wrap"></div></details>`,
  "cohort hosts",
);

// --- Replace JS visualization block ---
const startMark = "    const SC_MATRIX_RECOMMENDED = ['stayDays','meetingCount','daysSinceLastMeeting','noShowCount','npsScore','monthlyIncome','liquidityReserve','mechanismCount','currentCycle','renewalCount'];";
const endMark = "    function scRenderRiskRules(p) {";
const startIdx = html.indexOf(startMark);
const endIdx = html.indexOf(endMark);
if (startIdx < 0 || endIdx < 0) throw new Error("JS block markers not found");

const NEW_JS = `    const SC_MATRIX_ALL = [
      { id: 'stayDays', label: 'Permanência' },
      { id: 'meetingCount', label: 'Total de reuniões' },
      { id: 'daysToFirstMeeting', label: 'Dias até 1ª reunião' },
      { id: 'daysSinceLastMeeting', label: 'Dias desde última reunião' },
      { id: 'averageIntervalDays', label: 'Intervalo médio' },
      { id: 'noShowCount', label: 'No-shows' },
      { id: 'rescheduleCount', label: 'Remarcações' },
      { id: 'attendanceRate', label: 'Taxa de comparecimento' },
      { id: 'monthlyIncome', label: 'Renda mensal' },
      { id: 'liquidityReserve', label: 'Reserva de liquidez' },
      { id: 'lastContribution', label: 'Último aporte' },
      { id: 'paidPropertiesValue', label: 'Patrimônio' },
      { id: 'daysSinceFinancialUpdate', label: 'Dias desde atualização financeira' },
      { id: 'mechanismCount', label: 'Quantidade de mecanismos' },
      { id: 'npsScore', label: 'Nota NPS' },
      { id: 'currentCycle', label: 'Ciclo atual' },
      { id: 'renewalCount', label: 'Quantidade de renovações' }
    ];
    const SC_MATRIX_RECOMMENDED = ['stayDays','meetingCount','daysSinceLastMeeting','daysToFirstMeeting','noShowCount','npsScore','monthlyIncome','liquidityReserve','mechanismCount','currentCycle'];
    scState.showAllDiscoveries = false;
    scState.matrixVarIds = [...SC_MATRIX_RECOMMENDED];

    function scEnsureFloatTip() {
      let el = document.getElementById('scFloatTip');
      if (!el) {
        el = document.createElement('div');
        el.id = 'scFloatTip';
        el.className = 'sc-tooltip-float';
        el.hidden = true;
        document.body.appendChild(el);
      }
      return el;
    }
    function scShowTip(htmlContent, evt) {
      const el = scEnsureFloatTip();
      el.innerHTML = htmlContent;
      el.hidden = false;
      const x = Math.min(window.innerWidth - 300, (evt?.clientX || 0) + 14);
      const y = Math.min(window.innerHeight - 120, (evt?.clientY || 0) + 14);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    }
    function scHideTip() {
      const el = document.getElementById('scFloatTip');
      if (el) el.hidden = true;
    }

    function scCorrColor(v) {
      if (v == null || !Number.isFinite(Number(v))) return { fill: '#3a3a3a', text: '#ccc' };
      const x = Math.max(-1, Math.min(1, Number(v)));
      const t = Math.abs(x);
      let r, g, b;
      if (x >= 0) {
        // neutral -> orange/red
        r = Math.round(55 + t * (220 - 55));
        g = Math.round(55 + t * (90 - 55));
        b = Math.round(55 + t * (40 - 55));
      } else {
        // neutral -> blue
        r = Math.round(55 + t * (40 - 55));
        g = Math.round(55 + t * (110 - 55));
        b = Math.round(55 + t * (220 - 55));
      }
      const fill = 'rgb(' + r + ',' + g + ',' + b + ')';
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      return { fill, text: lum > 140 ? '#111' : '#f5f5f5' };
    }

    function scRetentionColor(pct) {
      if (pct == null || !Number.isFinite(Number(pct))) return { fill: '#3a3a3a', text: '#ccc' };
      const t = Math.max(0, Math.min(1, Number(pct) / 100));
      // low retention red/orange, high blue/green
      const r = Math.round(210 - t * 150);
      const g = Math.round(70 + t * 130);
      const b = Math.round(50 + t * 120);
      const fill = 'rgb(' + r + ',' + g + ',' + b + ')';
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      return { fill, text: lum > 140 ? '#111' : '#f5f5f5' };
    }

    function scRenderDiscoveries(p) {
      const all = p.discoveries || [];
      const rows = scState.showAllDiscoveries ? all : all.slice(0, 6);
      const host = document.querySelector('#scDiscoveriesHost');
      const btn = document.querySelector('#scDiscoveriesToggle');
      if (btn) btn.textContent = scState.showAllDiscoveries ? 'Ver menos' : 'Ver todas as descobertas';
      if (!host) return;
      if (!rows.length) {
        host.innerHTML = '<p class="note-muted">Nenhuma descoberta publicada com os limiares atuais de cobertura/amostra.</p>';
        return;
      }
      host.innerHTML = rows.map((d) => '<article class="sc-discovery-card"><strong>' + escapeHtml(d.title || d.id || 'Descoberta') + '</strong><p>' + escapeHtml(d.text || '') + '</p></article>').join('');
    }

    function scRenderMatrixVars(p) {
      const host = document.querySelector('#scMatrixVarsHost');
      if (!host) return;
      const selected = new Set(scState.matrixVarIds?.length ? scState.matrixVarIds : SC_MATRIX_RECOMMENDED);
      host.innerHTML = SC_MATRIX_ALL.map((v) => {
        const checked = selected.has(v.id);
        return '<label><input type="checkbox" data-sc-matrix-var="' + escapeHtml(v.id) + '" ' + (checked ? 'checked' : '') + '/> ' + escapeHtml(v.label) + '</label>';
      }).join('');
      host.querySelectorAll('input[data-sc-matrix-var]').forEach((inp) => {
        inp.addEventListener('change', () => {
          scState.matrixVarIds = [...host.querySelectorAll('input[data-sc-matrix-var]:checked')].map((el) => el.dataset.scMatrixVar).slice(0, 12);
          loadStatisticalCrosses();
        });
      });
    }

    function scOpenMatrixCell(cell, p) {
      const drawer = document.querySelector('#scMatrixDrawer');
      const body = document.querySelector('#scMatrixDrawerBody');
      if (!drawer || !body || !cell) return;
      const val = cell.value != null ? Number(cell.value).toFixed(2).replace('.', ',') : '—';
      const dir = cell.direction === 'positive' ? 'positiva' : cell.direction === 'negative' ? 'negativa' : 'neutra/indefinida';
      const clients = p?.clients || [];
      const fieldA = cell.idA;
      const fieldB = cell.idB;
      const pairs = [];
      for (const c of clients) {
        const xa = Number(c[fieldA]);
        const xb = Number(c[fieldB]);
        if (!Number.isFinite(xa) || !Number.isFinite(xb)) continue;
        pairs.push([xa, xb]);
      }
      const sampleN = Math.min(400, pairs.length);
      const sampled = pairs.length <= sampleN ? pairs : pairs.filter((_, i) => i % Math.ceil(pairs.length / sampleN) === 0).slice(0, sampleN);
      let scatter = '';
      if (sampled.length >= 5 && cell.idA !== cell.idB) {
        const xs = sampled.map((d) => d[0]);
        const ys = sampled.map((d) => d[1]);
        const minX = Math.min(...xs), maxX = Math.max(...xs);
        const minY = Math.min(...ys), maxY = Math.max(...ys);
        const w = 320, h = 200, pad = 28;
        const sx = (v) => pad + ((v - minX) / (maxX - minX || 1)) * (w - pad * 2);
        const sy = (v) => h - pad - ((v - minY) / (maxY - minY || 1)) * (h - pad * 2);
        const dots = sampled.map((d) => '<circle cx="' + sx(d[0]).toFixed(1) + '" cy="' + sy(d[1]).toFixed(1) + '" r="2.2" fill="#f47920" opacity="0.7"/>').join('');
        scatter = '<p class="note-muted">Dispersão amostrada (' + sampleN + ' de ' + pairs.length + ' pares). A correlação usa toda a amostra válida.</p>' +
          '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="200" role="img"><rect x="0" y="0" width="' + w + '" height="' + h + '" fill="#141414"/>' +
          '<line x1="' + pad + '" y1="' + (h - pad) + '" x2="' + (w - pad) + '" y2="' + (h - pad) + '" stroke="#555"/><line x1="' + pad + '" y1="' + pad + '" x2="' + pad + '" y2="' + (h - pad) + '" stroke="#555"/>' +
          dots + '</svg>';
      }
      body.innerHTML = '<h3 style="margin-top:0">Relação entre ' + escapeHtml(cell.labelA || cell.idA) + ' e ' + escapeHtml(cell.labelB || cell.idB) + '</h3>' +
        '<p><strong>Correlação:</strong> ' + val + ' · <strong>Método:</strong> ' + escapeHtml(cell.method || '—') + '</p>' +
        '<p><strong>Força:</strong> ' + escapeHtml(cell.strength || '—') + ' · <strong>Direção:</strong> ' + dir + '</p>' +
        '<p><strong>Amostra:</strong> ' + (cell.n ?? '—') + ' · <strong>Cobertura:</strong> ' + (cell.coveragePercent != null ? epFmtPct(cell.coveragePercent) : '—') + '</p>' +
        '<p class="note-muted">Associação observada. Não implica causalidade.</p>' + scatter;
      drawer.hidden = false;
    }

    function scRenderCorrelationMatrix(p) {
      const m = p.correlationMatrix;
      const host = document.querySelector('#scMatrixHost');
      const legend = document.querySelector('#scMatrixLegend');
      const insights = document.querySelector('#scMatrixInsights');
      const tableHost = document.querySelector('#scMatrixTableHost');
      if (!host) return;
      if (!m?.variables?.length) {
        host.innerHTML = '<div class="empty" style="display:block">Não há variáveis suficientes selecionadas para a matriz.</div>';
        if (legend) legend.innerHTML = '';
        if (insights) insights.innerHTML = '';
        return;
      }
      const vars = m.variables;
      const n = vars.length;
      const cellSize = Math.max(48, Math.min(56, Math.floor(560 / Math.max(n, 1))));
      const labelW = 120;
      const labelH = 110;
      const w = labelW + n * cellSize + 8;
      const h = labelH + n * cellSize + 8;
      const byKey = new Map((m.cells || []).map((c) => [c.idA + '||' + c.idB, c]));
      let rects = '';
      vars.forEach((row, i) => {
        vars.forEach((col, j) => {
          const cell = byKey.get(row.id + '||' + col.id) || byKey.get(col.id + '||' + row.id);
          const v = cell?.value;
          const colors = scCorrColor(v);
          const txt = v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toFixed(2).replace('.', ',');
          const x = labelW + j * cellSize;
          const y = labelH + i * cellSize;
          const tip = cell
            ? (cell.labelA || cell.idA) + ' × ' + (cell.labelB || cell.idB) + '<br/>' + (cell.method || 'Spearman') + ': ' + txt +
              '<br/>' + (cell.strength || '') + ' · direção ' + (cell.direction || '—') +
              '<br/>Amostra: ' + (cell.n ?? '—') + '<br/>Cobertura: ' + (cell.coveragePercent != null ? cell.coveragePercent + '%' : '—')
            : 'Sem dados';
          rects += '<g class="sc-hm-cell" data-ida="' + escapeHtml(row.id) + '" data-idb="' + escapeHtml(col.id) + '" data-tip="' + escapeHtml(tip) + '">' +
            '<rect x="' + x + '" y="' + y + '" width="' + (cellSize - 2) + '" height="' + (cellSize - 2) + '" rx="3" fill="' + colors.fill + '"/>' +
            '<text x="' + (x + cellSize / 2 - 1) + '" y="' + (y + cellSize / 2 + 4) + '" text-anchor="middle" font-size="10" fill="' + colors.text + '">' + txt + '</text></g>';
        });
      });
      const colLabels = vars.map((v, j) => {
        const x = labelW + j * cellSize + cellSize / 2;
        const y = labelH - 8;
        return '<text transform="translate(' + x + ',' + y + ') rotate(-55)" text-anchor="start" font-size="10" fill="#bbb">' + escapeHtml((v.label || v.id).slice(0, 18)) + '</text>';
      }).join('');
      const rowLabels = vars.map((v, i) => {
        const y = labelH + i * cellSize + cellSize / 2 + 3;
        return '<text x="' + (labelW - 8) + '" y="' + y + '" text-anchor="end" font-size="10" fill="#bbb">' + escapeHtml((v.label || v.id).slice(0, 16)) + '</text>';
      }).join('');
      host.innerHTML = '<svg class="sc-matrix-svg" viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="Heatmap de correlação">' +
        '<rect width="' + w + '" height="' + h + '" fill="#141414"/>' + colLabels + rowLabels + rects + '</svg>';
      host.querySelectorAll('.sc-hm-cell').forEach((g) => {
        g.addEventListener('mousemove', (evt) => scShowTip(g.getAttribute('data-tip') || '', evt));
        g.addEventListener('mouseleave', scHideTip);
        g.addEventListener('click', () => {
          const cell = byKey.get(g.dataset.ida + '||' + g.dataset.idb) || byKey.get(g.dataset.idb + '||' + g.dataset.ida);
          if (cell && cell.idA !== cell.idB) scOpenMatrixCell(cell, p);
        });
      });
      if (legend) {
        let stops = '';
        for (let i = 0; i <= 20; i += 1) {
          const v = -1 + i / 10;
          const c = scCorrColor(v).fill;
          const y = 10 + i * 8;
          stops += '<rect x="18" y="' + y + '" width="18" height="8" fill="' + c + '"/>';
        }
        legend.innerHTML = '<svg width="56" height="200" viewBox="0 0 56 200"><text x="28" y="10" text-anchor="middle" font-size="9" fill="#aaa">+1</text>' + stops +
          '<text x="28" y="188" text-anchor="middle" font-size="9" fill="#aaa">-1</text><text x="28" y="100" text-anchor="middle" font-size="9" fill="#888">0</text></svg>';
      }
      // insights: unique off-diagonal pairs
      const seen = new Set();
      const pairs = [];
      for (const c of (m.cells || [])) {
        if (!c || c.idA === c.idB || c.value == null || !Number.isFinite(Number(c.value))) continue;
        if ((c.n || 0) < 20 || (c.coveragePercent != null && c.coveragePercent < 20)) continue;
        const key = [c.idA, c.idB].sort().join('||');
        if (seen.has(key)) continue;
        seen.add(key);
        pairs.push(c);
      }
      const pos = [...pairs].filter((c) => c.value > 0).sort((a, b) => b.value - a.value).slice(0, 3);
      const neg = [...pairs].filter((c) => c.value < 0).sort((a, b) => a.value - b.value).slice(0, 3);
      if (insights) {
        const lines = [
          ...pos.map((c) => c.labelA + ' e ' + c.labelB + ' apresentam associação positiva ' + (c.strength || '') + ' de ' + Number(c.value).toFixed(2).replace('.', ',') + '.'),
          ...neg.map((c) => c.labelA + ' e ' + c.labelB + ' apresentam associação negativa ' + (c.strength || '') + ' de ' + Number(c.value).toFixed(2).replace('.', ',') + '.')
        ];
        insights.innerHTML = '<strong>Principais relações encontradas</strong><ul>' +
          (lines.length ? lines.map((t) => '<li>' + escapeHtml(t) + '</li>').join('') : '<li>Sem pares com amostra/cobertura suficientes além da diagonal.</li>') +
          '</ul><p class="note-muted" style="margin:8px 0 0">Método: ' + escapeHtml(m.method || 'spearman') + '. Associação observada, não causalidade.</p>';
      }
      if (tableHost) {
        tableHost.innerHTML = '<table><thead><tr><th>X</th><th>Y</th><th class="num">ρ</th><th class="num">n</th><th class="num">Cobertura</th><th>Força</th></tr></thead><tbody>' +
          pairs.map((c) => '<tr><td>' + escapeHtml(c.labelA) + '</td><td>' + escapeHtml(c.labelB) + '</td><td class="num">' + Number(c.value).toFixed(3).replace('.', ',') + '</td><td class="num">' + (c.n ?? '—') + '</td><td class="num">' + (c.coveragePercent != null ? epFmtPct(c.coveragePercent) : '—') + '</td><td>' + escapeHtml(c.strength || '—') + '</td></tr>').join('') +
          '</tbody></table>';
      }
    }

    function scSurvivalAt(curve, day) {
      if (!curve?.length) return null;
      let last = curve[0];
      for (const pt of curve) {
        if (Number(pt.time) > day) break;
        last = pt;
      }
      return last;
    }

    function scRenderSurvivalChart(p) {
      const host = document.querySelector('#scSurvivalChart');
      const narr = document.querySelector('#scSurvivalNarration');
      const atRiskHost = document.querySelector('#scAtRiskHost');
      const compare = document.querySelector('#scSurvivalCompare')?.value || 'overall';
      if (!host) return;
      const overall = p.survival?.overall || {};
      const curve = overall.curve || [];
      if (!curve.length) {
        host.innerHTML = '<div class="empty" style="display:block">Não há cancelamentos com data válida para calcular a curva.</div>';
        if (narr) narr.textContent = '';
        if (atRiskHost) atRiskHost.innerHTML = '';
        return;
      }
      const series = [{ key: 'overall', label: 'Geral', color: '#f47920', curve }];
      if (compare !== 'overall') {
        const groups = (p.survival?.groups || []).filter((g) => g.field === compare);
        const palette = ['#3b82f6', '#22c55e', '#eab308', '#a855f7', '#ef4444'];
        const picked = groups.filter((g) => (g.n || 0) >= 20 && g.curve?.length).sort((a, b) => (b.n || 0) - (a.n || 0)).slice(0, 5);
        if (picked.length) {
          series.length = 0;
          picked.forEach((g, i) => series.push({ key: String(g.level), label: String(g.level), color: palette[i % palette.length], curve: g.curve }));
        }
      }
      const allTimes = series.flatMap((s) => s.curve.map((c) => Number(c.time) || 0));
      const maxT = Math.max(...allTimes, 1);
      const w = 760, h = 280, padL = 52, padR = 20, padT = 20, padB = 40;
      const xOf = (t) => padL + (t / maxT) * (w - padL - padR);
      const yOf = (s) => padT + (1 - s) * (h - padT - padB);
      let paths = '';
      let censorMarks = '';
      series.forEach((s) => {
        let d = '';
        s.curve.forEach((pt, i) => {
          const x = xOf(Number(pt.time) || 0);
          const y = yOf(Number(pt.survival) || 0);
          if (i === 0) d += 'M ' + xOf(0) + ' ' + yOf(1) + ' L ' + x + ' ' + yOf(1);
          const prev = s.curve[i - 1];
          if (prev) {
            const px = xOf(Number(prev.time) || 0);
            const py = yOf(Number(prev.survival) || 0);
            d += ' L ' + x + ' ' + py + ' L ' + x + ' ' + y;
          } else {
            d += ' L ' + x + ' ' + y;
          }
          if ((pt.censored || 0) > 0) {
            censorMarks += '<line x1="' + x + '" y1="' + (y - 6) + '" x2="' + x + '" y2="' + (y + 6) + '" stroke="' + s.color + '" stroke-width="1.4" opacity="0.75"><title>Censura: cliente sem cancelamento observado até a data de corte</title></line>';
            censorMarks += '<text x="' + x + '" y="' + (y - 8) + '" text-anchor="middle" font-size="9" fill="' + s.color + '" opacity="0.8">+</text>';
          }
        });
        paths += '<path data-series="' + escapeHtml(s.label) + '" d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2.4"/>';
      });
      // hover capture
      const hitPts = (series[0]?.curve || []).map((pt) => {
        const x = xOf(Number(pt.time) || 0);
        return '<circle class="sc-km-hit" cx="' + x + '" cy="' + yOf(Number(pt.survival) || 0) + '" r="10" fill="transparent" data-tip="' +
          escapeHtml((pt.time || 0) + ' dias\\nProbabilidade de permanência: ' + ((Number(pt.survival) || 0) * 100).toFixed(1).replace('.', ',') + '%\\nEm risco: ' + (pt.atRisk ?? '—') + '\\nCancelamentos no ponto: ' + (pt.events ?? 0) + '\\nCensurados: ' + (pt.censored ?? 0)) + '"/>';
      }).join('');
      const legend = series.map((s, i) => '<g transform="translate(' + (padL + i * 120) + ',14)"><rect width="12" height="3" y="5" fill="' + s.color + '"/><text x="16" y="10" font-size="10" fill="#ccc">' + escapeHtml(s.label) + '</text></g>').join('');
      const yTicks = [0, 0.25, 0.5, 0.75, 1].map((v) => {
        const y = yOf(v);
        return '<line x1="' + padL + '" y1="' + y + '" x2="' + (w - padR) + '" y2="' + y + '" stroke="#333"/><text x="' + (padL - 8) + '" y="' + (y + 3) + '" text-anchor="end" font-size="10" fill="#888">' + Math.round(v * 100) + '%</text>';
      }).join('');
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" role="img" aria-label="Curva Kaplan-Meier">' +
        '<rect width="' + w + '" height="' + h + '" fill="#141414"/>' + yTicks +
        '<line x1="' + padL + '" y1="' + (h - padB) + '" x2="' + (w - padR) + '" y2="' + (h - padB) + '" stroke="#555"/>' +
        '<line x1="' + padL + '" y1="' + padT + '" x2="' + padL + '" y2="' + (h - padB) + '" stroke="#555"/>' +
        paths + censorMarks + hitPts + legend +
        '<text x="' + (w / 2) + '" y="' + (h - 10) + '" text-anchor="middle" font-size="11" fill="#aaa">Dias desde a contratação</text>' +
        '<text x="14" y="' + (h / 2) + '" transform="rotate(-90 14 ' + (h / 2) + ')" text-anchor="middle" font-size="11" fill="#aaa">Probabilidade de permanência</text></svg>';
      host.querySelectorAll('.sc-km-hit').forEach((c) => {
        c.addEventListener('mousemove', (evt) => scShowTip((c.getAttribute('data-tip') || '').replace(/\\n/g, '<br/>'), evt));
        c.addEventListener('mouseleave', scHideTip);
      });

      const marks = [0, 90, 180, 365, 730].filter((d) => d <= maxT + 1);
      if (atRiskHost) {
        const row = marks.map((d) => {
          const pt = scSurvivalAt(curve, d);
          return '<td>' + (pt?.atRisk ?? '—') + '</td>';
        }).join('');
        atRiskHost.innerHTML = '<table><thead><tr><th>Tempo</th>' + marks.map((d) => '<th>' + d + '</th>').join('') + '</tr></thead><tbody><tr><th>Em risco</th>' + row + '</tr></tbody></table>';
      }
      const p90 = scSurvivalAt(curve, 90);
      const p180 = scSurvivalAt(curve, 180);
      const p365 = scSurvivalAt(curve, 365);
      const fmtP = (pt) => pt?.survival != null ? (pt.survival * 100).toFixed(1).replace('.', ',') + '%' : '—';
      if (narr) {
        let text = 'Probabilidade estimada de permanência: 3 meses ' + fmtP(p90) + ' · 6 meses ' + fmtP(p180) + ' · 12 meses ' + fmtP(p365) + '. ';
        if (overall.medianSurvival != null) text += 'A mediana de sobrevivência foi atingida em ' + overall.medianSurvival + ' dias. ';
        else text += 'A probabilidade estimada de permanência não caiu abaixo de 50% no período observado. ';
        text += 'n início=' + (overall.nStart ?? '—') + ' · eventos=' + (overall.events ?? '—') + ' · censurados=' + (overall.censored ?? '—') + '. Marcas verticais indicam censura.';
        narr.textContent = text;
      }
    }

    function scRenderCohort(p) {
      const cohort = p.cohort;
      const host = document.querySelector('#scCohortHost');
      const note = document.querySelector('#scCohortNote');
      const tableHost = document.querySelector('#scCohortTableHost');
      if (!host) return;
      if (!cohort?.cohorts?.length || !cohort?.ages?.length) {
        host.innerHTML = '<div class="empty" style="display:block">Coorte indisponível neste recorte.</div>';
        if (note) note.textContent = '';
        return;
      }
      const cohorts = cohort.cohorts;
      const ages = cohort.ages;
      const cellMap = new Map((cohort.cells || []).map((c) => [c.cohortKey + '||' + c.age, c]));
      const avgMap = new Map((cohort.averages || []).map((a) => [a.age, a]));
      const cellW = 46, cellH = 28, labelW = 54, labelH = 70;
      const w = labelW + cohorts.length * cellW + 8;
      const h = labelH + ages.length * cellH + 8;
      let cells = '';
      ages.forEach((age, i) => {
        cohorts.forEach((c, j) => {
          const cell = cellMap.get(c.key + '||' + age);
          const x = labelW + j * cellW;
          const y = labelH + i * cellH;
          const observable = cell && cell.observable !== false && cell.retainedPct != null;
          const colors = observable ? scRetentionColor(cell.retainedPct) : { fill: '#3a3a3a', text: '#bbb' };
          const txt = observable ? Number(cell.retainedPct).toFixed(0) + '%' : '—';
          const tip = observable
            ? ('Coorte: ' + (c.label || c.key) + '<br/>Mês de vida: ' + age + '<br/>Clientes iniciais: ' + (c.nStart ?? '—') + '<br/>Retidos: ' + (cell.retainedN ?? '—') + '<br/>Retenção: ' + Number(cell.retainedPct).toFixed(1).replace('.', ',') + '%<br/>Cancel. acum.: ' + (cell.cancelledCum ?? '—'))
            : ('Coorte: ' + (c.label || c.key) + '<br/>Mês ' + age + ': período ainda não observável');
          cells += '<g class="sc-cohort-cell" data-tip="' + escapeHtml(tip) + '"><rect x="' + x + '" y="' + y + '" width="' + (cellW - 2) + '" height="' + (cellH - 2) + '" rx="2" fill="' + colors.fill + '"/>' +
            '<text x="' + (x + cellW / 2 - 1) + '" y="' + (y + cellH / 2 + 4) + '" text-anchor="middle" font-size="9" fill="' + colors.text + '">' + txt + '</text></g>';
        });
      });
      const colLabs = cohorts.map((c, j) => '<text transform="translate(' + (labelW + j * cellW + cellW / 2) + ',' + (labelH - 8) + ') rotate(-55)" text-anchor="start" font-size="9" fill="#bbb">' + escapeHtml(c.label || c.key) + '</text>').join('');
      const rowLabs = ages.map((age, i) => '<text x="' + (labelW - 6) + '" y="' + (labelH + i * cellH + cellH / 2 + 3) + '" text-anchor="end" font-size="10" fill="#bbb">M' + age + '</text>').join('');
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + Math.min(w, 900) + '" height="' + Math.min(h, 520) + '" role="img" aria-label="Heatmap de coorte">' +
        '<rect width="' + w + '" height="' + h + '" fill="#141414"/>' + colLabs + rowLabs + cells + '</svg>';
      host.querySelectorAll('.sc-cohort-cell').forEach((g) => {
        g.addEventListener('mousemove', (evt) => scShowTip(g.getAttribute('data-tip') || '', evt));
        g.addEventListener('mouseleave', scHideTip);
      });
      const deltas = (cohort.averages || []).filter((a) => a.deltaPp != null).sort((a, b) => a.deltaPp - b.deltaPp);
      if (note) {
        const a3 = avgMap.get(3)?.meanRetentionPct;
        const a6 = avgMap.get(6)?.meanRetentionPct;
        const a12 = avgMap.get(12)?.meanRetentionPct;
        const drop = deltas[0];
        note.textContent = 'Coortes: ' + cohorts.length + ' · Retenção média 3/6/12 meses: ' +
          (a3 != null ? Number(a3).toFixed(1) + '%' : '—') + ' / ' +
          (a6 != null ? Number(a6).toFixed(1) + '%' : '—') + ' / ' +
          (a12 != null ? Number(a12).toFixed(1) + '%' : '—') +
          (drop ? ('. Maior queda média entre o mês ' + (drop.age - 1) + ' e o mês ' + drop.age + ' (' + Number(drop.deltaPp).toFixed(1) + ' p.p.).') : '.') +
          ' Coortes recentes podem não ter tempo suficiente para 12 meses.';
      }
      if (tableHost) {
        tableHost.innerHTML = '<table><thead><tr><th>Idade</th>' + cohorts.map((c) => '<th>' + escapeHtml(c.label || c.key) + '</th>').join('') + '</tr></thead><tbody>' +
          ages.map((age) => '<tr><td>Mês ' + age + '</td>' + cohorts.map((c) => {
            const cell = cellMap.get(c.key + '||' + age);
            if (!cell || cell.observable === false || cell.retainedPct == null) return '<td>—</td>';
            return '<td>' + Number(cell.retainedPct).toFixed(1) + '%</td>';
          }).join('') + '</tr>').join('') + '</tbody></table>';
      }
    }

    function scRenderDiffChart(p) {
      const host = document.querySelector('#scDiffChart');
      const narr = document.querySelector('#scDiffNarration');
      if (!host) return;
      const unit = document.querySelector('#scDiffUnit')?.value || 'time';
      const unitRe = {
        time: /dia|perman|intervalo|tenure|stay|since|until/i,
        meetings: /reuni|meeting|no-?show|remarc/i,
        money: /renda|reserva|aporte|patrim|líquid|liquid|valor|income/i,
        nps: /nps|nota/i,
        mech: /mecan|implement/i
      }[unit] || /./;
      const rows = (p.activeVsCancelled || []).filter((d) => {
        const medA = d.medianActive ?? d.activeMedian;
        const medC = d.medianCancelled ?? d.cancelledMedian;
        return medA != null && medC != null && unitRe.test((d.id || '') + ' ' + (d.label || ''));
      }).slice(0, 10);
      if (!rows.length) {
        host.innerHTML = '<div class="empty" style="display:block">Sem variáveis neste grupo de unidade para o gráfico.</div>';
        if (narr) narr.textContent = '';
        return;
      }
      const h = Math.max(220, rows.length * 34 + 40);
      const w = 720, padL = 160, padR = 20, padT = 16, padB = 20;
      const vals = rows.flatMap((d) => [Number(d.medianActive ?? d.activeMedian), Number(d.medianCancelled ?? d.cancelledMedian)]);
      const maxV = Math.max(...vals.map((v) => Math.abs(v)), 1);
      const xOf = (v) => padL + (Math.abs(v) / maxV) * (w - padL - padR) * 0.45;
      let bars = '';
      rows.forEach((d, i) => {
        const y = padT + i * 34;
        const a = Number(d.medianActive ?? d.activeMedian);
        const c = Number(d.medianCancelled ?? d.cancelledMedian);
        bars += '<text x="' + (padL - 8) + '" y="' + (y + 14) + '" text-anchor="end" font-size="11" fill="#ccc">' + escapeHtml((d.label || d.id || '').slice(0, 22)) + '</text>' +
          '<rect x="' + padL + '" y="' + y + '" width="' + xOf(a) + '" height="10" fill="#3b82f6" rx="2"/>' +
          '<rect x="' + padL + '" y="' + (y + 12) + '" width="' + xOf(c) + '" height="10" fill="#f47920" rx="2"/>';
      });
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#141414"/>' + bars +
        '<g transform="translate(' + padL + ',' + (h - 8) + ')"><rect width="12" height="8" fill="#3b82f6"/><text x="16" y="8" font-size="10" fill="#aaa">Ativos</text><rect x="70" width="12" height="8" fill="#f47920"/><text x="86" y="8" font-size="10" fill="#aaa">Cancelados</text></g></svg>';
      if (narr) {
        const top = rows[0];
        narr.textContent = top ? ('Exemplo no grupo: ' + (top.label || top.id) + ' — mediana ativos ' + scFormatValue(top.id, top.label, top.medianActive ?? top.activeMedian) + ' vs cancelados ' + scFormatValue(top.id, top.label, top.medianCancelled ?? top.cancelledMedian) + '.') : '';
      }
    }

    function scRenderAucChart(p) {
      const host = document.querySelector('#scAucChart');
      const narr = document.querySelector('#scAucNarration');
      if (!host) return;
      const rows = (p.univariatePredictivePower || p.predictivePower || [])
        .filter((a) => Number.isFinite(Number(a.aucAdjusted ?? a.aucInverted ?? a.auc)))
        .sort((a, b) => Number(b.aucAdjusted ?? b.aucInverted ?? b.auc) - Number(a.aucAdjusted ?? a.aucInverted ?? a.auc))
        .slice(0, 12);
      if (!rows.length) {
        host.innerHTML = '<div class="empty" style="display:block">Sem AUC calculável neste recorte.</div>';
        return;
      }
      const w = 720, rowH = 28, padL = 170, padR = 40, padT = 24, padB = 24;
      const h = padT + rows.length * rowH + padB;
      const xOf = (auc) => padL + ((auc - 0.5) / 0.5) * (w - padL - padR);
      const refs = [0.5, 0.6, 0.7, 1.0].map((v) => {
        const x = xOf(v);
        return '<line x1="' + x + '" y1="' + padT + '" x2="' + x + '" y2="' + (h - padB) + '" stroke="#333" stroke-dasharray="3 3"/><text x="' + x + '" y="' + (padT - 6) + '" text-anchor="middle" font-size="9" fill="#888">' + v.toFixed(2).replace('.', ',') + '</text>';
      }).join('');
      const bars = rows.map((r, i) => {
        const auc = Number(r.aucAdjusted ?? r.aucInverted ?? r.auc);
        const y = padT + i * rowH;
        const x0 = xOf(0.5);
        const x1 = xOf(Math.min(1, Math.max(0.5, auc)));
        return '<text x="' + (padL - 8) + '" y="' + (y + 14) + '" text-anchor="end" font-size="11" fill="#ccc">' + escapeHtml((r.label || r.id || '').slice(0, 24)) + '</text>' +
          '<rect x="' + x0 + '" y="' + (y + 4) + '" width="' + Math.max(2, x1 - x0) + '" height="14" fill="#f47920" rx="2"/>' +
          '<text x="' + (x1 + 6) + '" y="' + (y + 15) + '" font-size="10" fill="#ddd">' + auc.toFixed(3).replace('.', ',') + '</text>';
      }).join('');
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#141414"/>' + refs + bars + '</svg>';
      if (narr) narr.textContent = 'Maior AUC ajustada: ' + (rows[0].label || rows[0].id) + ' (' + Number(rows[0].aucAdjusted ?? rows[0].auc).toFixed(3).replace('.', ',') + '). Linhas: 0,50 sem discriminação · 0,60 sinal fraco · 0,70 sinal moderado.';
    }

    function scRenderNpsGroupsChart(p) {
      const host = document.querySelector('#scNpsGroupsChart');
      const narr = document.querySelector('#scNpsGroupsNarration');
      if (!host) return;
      const groups = p.npsGroups || [];
      if (!groups.length) {
        host.innerHTML = '<div class="empty" style="display:block">Sem grupos NPS no recorte.</div>';
        return;
      }
      const metrics = [
        { key: 'cancelledPct', label: '% cancelado', color: '#ef4444' },
        { key: 'renewedPct', label: '% renovado', color: '#22c55e' }
      ];
      const w = 720, h = 220, padL = 50, padR = 20, padT = 30, padB = 40;
      const gW = (w - padL - padR) / groups.length;
      let bars = '';
      groups.forEach((g, gi) => {
        metrics.forEach((m, mi) => {
          const v = Number(g[m.key] || 0);
          const bw = gW / (metrics.length + 1);
          const x = padL + gi * gW + (mi + 0.5) * bw;
          const bh = (v / 100) * (h - padT - padB);
          const y = h - padB - bh;
          bars += '<rect x="' + x + '" y="' + y + '" width="' + (bw * 0.8) + '" height="' + Math.max(1, bh) + '" fill="' + m.color + '" rx="2"/>';
        });
        bars += '<text x="' + (padL + gi * gW + gW / 2) + '" y="' + (h - 12) + '" text-anchor="middle" font-size="11" fill="#ccc">' + escapeHtml(g.label || g.class || '') + '</text>';
      });
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#141414"/>' + bars +
        '<rect x="' + padL + '" y="8" width="10" height="10" fill="#ef4444"/><text x="' + (padL + 14) + '" y="17" font-size="10" fill="#aaa">% cancelado</text>' +
        '<rect x="' + (padL + 110) + '" y="8" width="10" height="10" fill="#22c55e"/><text x="' + (padL + 124) + '" y="17" font-size="10" fill="#aaa">% renovado</text></svg>';
      const det = groups.find((g) => /detrat/i.test(g.label || g.class || '')) || groups[groups.length - 1];
      const pro = groups.find((g) => /promo/i.test(g.label || g.class || '')) || groups[0];
      if (narr && det && pro && (det.n || 0) >= 5 && (pro.n || 0) >= 5) {
        narr.textContent = (Number(det.cancelledPct || 0) > Number(pro.cancelledPct || 0))
          ? 'Detratores apresentam maior proporção de cancelamento neste recorte (' + Number(det.cancelledPct).toFixed(1).replace('.', ',') + '% vs ' + Number(pro.cancelledPct || 0).toFixed(1).replace('.', ',') + '%).'
          : 'Diferença de cancelamento entre classes NPS é limitada neste recorte; interpretar com cobertura NPS em mente.';
      } else if (narr) narr.textContent = 'Amostra NPS por grupo abaixo do mínimo em alguns casos — cautela na comparação.';
    }

`;

// Keep original `function scRenderRiskRules(p) {` from endIdx (do not duplicate the header).
html = html.slice(0, startIdx) + NEW_JS + html.slice(endIdx);

// Hook renders at end of renderStatisticalCrosses (functions existed but were never called)
{
  const hook = `      if (typeof restoreStaticPortalAlert === 'function') {
        restoreStaticPortalAlert('#scInterpretAlert', 'statistical-crosses-interpret');
      }
    }

    async function loadStatisticalCrosses() {`;
  const hookNew = `      if (typeof restoreStaticPortalAlert === 'function') {
        restoreStaticPortalAlert('#scInterpretAlert', 'statistical-crosses-interpret');
      }
      scRenderDiscoveries(p);
      scRenderMatrixVars(p);
      scRenderCorrelationMatrix(p);
      scRenderDiffChart(p);
      scRenderAucChart(p);
      scRenderNpsGroupsChart(p);
      scRenderSurvivalChart(p);
      scRenderCohort(p);
      scRenderRiskRules(p);
      const onlyActive = scFilters.status?.value === 'active';
      const onlyCancelled = scFilters.status?.value === 'cancelled';
      if (onlyActive || onlyCancelled) {
        const diffEmpty = document.querySelector('#scDiffEmpty');
        if (diffEmpty) {
          diffEmpty.style.display = 'block';
          diffEmpty.textContent = 'O bloco Ativos vs cancelados precisa dos dois grupos. Ajuste o filtro de status para "Ativos e cancelados" ou "Todos".';
        }
      }
    }

    async function loadStatisticalCrosses() {`;
  if (!html.includes(hook)) throw new Error("render hook anchor missing");
  if (!html.includes("scRenderDiffChart(p);")) {
    html = html.replace(hook, hookNew);
  }
}

// Event listeners (export/matrix/compare) — avoid substring collision with function names
{
  const listenMarker = `    document.querySelector('#scRefresh')?.addEventListener('click', loadStatisticalCrosses);`;
  const listenNew = `    document.querySelector('#scRefresh')?.addEventListener('click', loadStatisticalCrosses);
    document.querySelector('#scExportReport')?.addEventListener('click', scExportReport);
    document.querySelector('#scDiscoveriesToggle')?.addEventListener('click', () => {
      scState.showAllDiscoveries = !scState.showAllDiscoveries;
      if (scState.payload) scRenderDiscoveries(scState.payload);
    });
    document.querySelector('#scCorrMethod')?.addEventListener('change', () => loadStatisticalCrosses());
    document.querySelector('#scCohortGranularity')?.addEventListener('change', () => loadStatisticalCrosses());
    document.querySelector('#scMatrixRecommended')?.addEventListener('click', () => {
      scState.matrixVarIds = [...SC_MATRIX_RECOMMENDED];
      loadStatisticalCrosses();
    });
    document.querySelector('#scMatrixClear')?.addEventListener('click', () => {
      scState.matrixVarIds = [];
      loadStatisticalCrosses();
    });
    document.querySelector('#scMatrixDrawerClose')?.addEventListener('click', () => {
      const d = document.querySelector('#scMatrixDrawer');
      if (d) d.hidden = true;
    });
    document.querySelector('#scSurvivalCompare')?.addEventListener('change', () => { if (scState.payload) scRenderSurvivalChart(scState.payload); });
    document.querySelector('#scDiffUnit')?.addEventListener('change', () => { if (scState.payload) scRenderDiffChart(scState.payload); });`;
  if (!html.includes("scSurvivalCompare')?.addEventListener")) {
    if (!html.includes(listenMarker)) throw new Error("listen marker missing");
    html = html.replace(listenMarker, listenNew);
  }
}

// Method tooltip
{
  const oldLab = `<label>Método<select id="scCorrMethod"><option value="spearman" selected>Spearman</option><option value="pearson">Pearson</option></select></label>`;
  const newLab = `<label title="Spearman mede relações monotônicas e é mais robusto a valores extremos. Pearson mede relações lineares.">Método<select id="scCorrMethod" title="Spearman mede relações monotônicas e é mais robusto a valores extremos. Pearson mede relações lineares."><option value="spearman" selected>Spearman</option><option value="pearson">Pearson</option></select></label>`;
  if (html.includes(oldLab)) html = html.replace(oldLab, newLab);
}

// Renewal diff: chart + collapsed table
{
  const renStart = `          <div class="section-head"><div><h2>10. Renovados vs não renovados</h2><p class="sc-section-note" style="margin:0">Ciclo &gt; 1 vs ciclo = 1 · ciclos nulos/≤0 excluídos. Mesma regra do dashboard Renovações.</p></div><span class="export-host" id="scRenewalDiffExportHost"></span></div>
          <section class="table-panel">`;
  const renStartNew = `          <div class="section-head"><div><h2>10. Renovados vs não renovados</h2><p class="sc-section-note" style="margin:0">Ciclo &gt; 1 vs ciclo = 1 · ciclos nulos/≤0 excluídos. Mesma regra do dashboard Renovações.</p></div><span class="export-host" id="scRenewalDiffExportHost"></span></div>
          <div id="scRenewalDiffChart" class="sc-chart-host"></div>
          <p class="note-muted" id="scRenewalDiffNarration"></p>
          <details class="sc-data-details"><summary>Ver dados</summary>
          <section class="table-panel" style="margin:0;border:0;padding:0;background:transparent">`;
  if (html.includes(renStart) && !html.includes("scRenewalDiffChart")) {
    html = html.replace(renStart, renStartNew);
    const renEnd = `<div class="empty" id="scRenewalDiffEmpty" hidden>Sem base de ciclo válida no recorte.</div>
          </section>

          <div class="section-head"><div><h2>11. Associação com permanência`;
    const renEndNew = `<div class="empty" id="scRenewalDiffEmpty" hidden>Sem base de ciclo válida no recorte.</div>
          </section>
          </details>

          <div class="section-head"><div><h2>11. Associação com permanência`;
    if (html.includes(renEnd)) html = html.replace(renEnd, renEndNew);
  }
}

// Add renewal chart renderer call + function before scRenderRiskRules
if (!html.includes("function scRenderRenewalDiffChart")) {
  const insertBefore = "    function scRenderRiskRules(p) {";
  const renewalFn = `    function scRenderRenewalDiffChart(p) {
      const host = document.querySelector('#scRenewalDiffChart');
      const narr = document.querySelector('#scRenewalDiffNarration');
      if (!host) return;
      const rows = (p.renewedVsNotRenewed || p.renewalDifferences || []).filter((d) => {
        const a = d.medianRenewed ?? d.median1;
        const b = d.medianNotRenewed ?? d.median0 ?? d.medianNonRenewed;
        return a != null && b != null;
      }).slice(0, 10);
      if (!rows.length) {
        host.innerHTML = '<div class="empty" style="display:block">Sem diferenças de renovação para o gráfico.</div>';
        if (narr) narr.textContent = '';
        return;
      }
      const h = Math.max(220, rows.length * 34 + 40);
      const w = 720, padL = 160, padR = 20, padT = 16, padB = 20;
      const vals = rows.flatMap((d) => [Number(d.medianRenewed ?? d.median1), Number(d.medianNotRenewed ?? d.median0)]);
      const maxV = Math.max(...vals.map((v) => Math.abs(v)), 1);
      const xOf = (v) => padL + (Math.abs(v) / maxV) * (w - padL - padR) * 0.45;
      let bars = '';
      rows.forEach((d, i) => {
        const y = padT + i * 34;
        const a = Number(d.medianRenewed ?? d.median1);
        const b = Number(d.medianNotRenewed ?? d.median0);
        bars += '<text x="' + (padL - 8) + '" y="' + (y + 14) + '" text-anchor="end" font-size="11" fill="#ccc">' + escapeHtml((d.label || d.id || '').slice(0, 22)) + '</text>' +
          '<rect x="' + padL + '" y="' + y + '" width="' + xOf(a) + '" height="10" fill="#22c55e" rx="2"/>' +
          '<rect x="' + padL + '" y="' + (y + 12) + '" width="' + xOf(b) + '" height="10" fill="#94a3b8" rx="2"/>';
      });
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#141414"/>' + bars +
        '<g transform="translate(' + padL + ',' + (h - 8) + ')"><rect width="12" height="8" fill="#22c55e"/><text x="16" y="8" font-size="10" fill="#aaa">Renovados</text><rect x="90" width="12" height="8" fill="#94a3b8"/><text x="106" y="8" font-size="10" fill="#aaa">Não renovados</text></g></svg>';
      if (narr) narr.textContent = 'Comparação descritiva de medianas. Associação não implica causalidade.';
    }

`;
  html = html.replace(insertBefore, renewalFn + insertBefore);
  html = html.replace("scRenderNpsGroupsChart(p);\n      scRenderSurvivalChart(p);", "scRenderNpsGroupsChart(p);\n      scRenderRenewalDiffChart(p);\n      scRenderSurvivalChart(p);");
}

writeFileSync(path, html);
console.log("Visual fixes applied");
