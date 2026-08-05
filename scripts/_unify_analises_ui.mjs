/**
 * Unifica menu + seções novas em Cruzamentos → Análises Estatísticas.
 * Não executa Git.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = resolve(root, "index.html");
let html = readFileSync(path, "utf8");

function mustReplace(oldStr, newStr, label) {
  const norm = (s) => s.replace(/\r\n/g, "\n");
  const h = norm(html);
  const o = norm(oldStr);
  if (!h.includes(o)) {
    // try flexible whitespace for single-line anchors
    throw new Error(`Missing block: ${label}`);
  }
  html = h.replace(o, norm(newStr));
}

html = html.replace(/\r\n/g, "\n");

// 1) Menu: one button via regex
{
  const re = /\s*<button type="button" data-nav="statistical-crosses">[\s\S]*?<\/button>\s*<button type="button" data-nav="exploration">[\s\S]*?<\/button>/;
  if (!re.test(html)) throw new Error("Missing menu buttons regex");
  html = html.replace(
    re,
    `\n        <button type="button" data-nav="statistical-crosses"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="7.5" cy="7.5" r="1.5"/><circle cx="16.5" cy="7.5" r="1.5"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/><path d="M3 3v18h18"/><path d="m7.5 16.5 9-9"/><path d="m7.5 7.5 3 3"/><path d="m13.5 13.5 3 3"/></svg></span>Análises Estatísticas</button>`,
  );
}

// 2) Header + export button
mustReplace(
  `              <div class="eyebrow">BASE QV · Cruzamentos Estatísticos</div>
              <h1>Cruzamentos Estatísticos</h1>
              <p>Análises exploratórias e descritivas — associação observada, não causalidade.</p>
            </div>
            <div class="status-actions">
              <div class="status"><b id="scStatus" style="color:var(--color-warning)">● Conectando à base</b><span id="scUpdated">Carregando análises…</span></div>
              <button class="btn" id="scRefresh" type="button">Atualizar</button>
            </div>`,
  `              <div class="eyebrow">BASE QV · Análises Estatísticas</div>
              <h1>Análises Estatísticas</h1>
              <p>Cruzamentos, descobertas, correlações, sobrevivência e coortes — associação observada, não causalidade.</p>
            </div>
            <div class="status-actions">
              <div class="status"><b id="scStatus" style="color:var(--color-warning)">● Conectando à base</b><span id="scUpdated">Carregando análises…</span></div>
              <div class="btn-group" style="display:flex;gap:8px;flex-wrap:wrap">
                <button class="btn" id="scExportReport" type="button" title="Gera relatório HTML/PDF com os filtros atuais">Exportar relatório</button>
                <button class="btn" id="scRefresh" type="button">Atualizar</button>
              </div>
            </div>`,
  "sc header",
);

// 3) Interpret alert text
mustReplace(
  `              <strong>Como interpretar os cruzamentos</strong>
              <p>Os resultados comparam grupos e medem associações observadas na base. Eles não comprovam causalidade. Cobertura baixa, amostra pequena e dados ausentes podem alterar a leitura.</p>
              <p class="note-muted" style="margin:6px 0 0">Mediana: valor central · Associação: intensidade/direção · Cobertura: % com dados válidos · AUC: separação individual · Sobrevivência: permanência ao longo do tempo.</p>`,
  `              <strong>Como interpretar esta página</strong>
              <p>Esta página reúne comparações, correlações, poder discriminativo, permanência e retenção. Os resultados mostram padrões observados na base e não comprovam causalidade.</p>
              <p class="note-muted" style="margin:6px 0 0">Correlação: direção/força · Mediana: valor central · Cobertura: % com dados válidos · AUC: separação individual · Sobrevivência: permanência estimada · Coorte: retenção por mês de contratação.</p>`,
  "interpret alert",
);

// 4) Insert discoveries + matrix after population note
mustReplace(
  `          <section class="summary kpis-sc-primary" id="scKpis"></section>
          <p class="note-muted" id="scPopNote"></p>

          <div class="section-head"><div><h2>2. Ativos vs cancelados</h2>`,
  `          <section class="summary kpis-sc-primary" id="scKpis"></section>
          <p class="note-muted" id="scPopNote"></p>

          <div class="section-head"><div><h2>2. Principais descobertas</h2><p class="sc-section-note" style="margin:0">Textos determinísticos a partir dos resultados (sem IA generativa). Só entram achados com cobertura e amostra suficientes.</p></div>
            <button class="btn" id="scDiscoveriesToggle" type="button">Ver todas as descobertas</button>
          </div>
          <div id="scDiscoveriesHost" class="sc-discoveries"></div>

          <div class="section-head"><div><h2>3. Matriz de correlação <span class="help" tabindex="0" data-tip="Spearman mede relações monotônicas e é menos sensível a valores extremos. Pearson mede relações lineares. Células próximas de 1: variáveis tendem a aumentar juntas; próximas de −1: movimentos opostos; próximas de zero: pouca relação.">?</span></h2>
            <p class="sc-section-note" style="margin:0">Células próximas de 1 indicam que as variáveis tendem a aumentar juntas. Próximas de −1 indicam movimentos opostos. Próximas de zero indicam pouca relação monotônica/linear.</p></div></div>
          <section class="filters financial" aria-label="Controles da matriz" style="margin-bottom:10px">
            <label>Método<select id="scCorrMethod"><option value="spearman" selected>Spearman</option><option value="pearson">Pearson</option></select></label>
            <label>Granularidade da coorte<select id="scCohortGranularity"><option value="month" selected>Mensal</option><option value="quarter">Trimestral</option></select></label>
            <button class="btn" id="scMatrixRecommended" type="button">Selecionar recomendadas</button>
            <button class="btn" id="scMatrixClear" type="button">Limpar seleção</button>
          </section>
          <div id="scMatrixVarsHost" class="sc-matrix-vars"></div>
          <div id="scMatrixHost" class="sc-matrix-wrap"></div>
          <aside id="scMatrixDrawer" class="sc-matrix-drawer" hidden>
            <button type="button" class="sc-matrix-drawer-close" id="scMatrixDrawerClose" aria-label="Fechar">×</button>
            <div id="scMatrixDrawerBody"></div>
          </aside>

          <div class="section-head"><div><h2>4. Ativos vs cancelados</h2>`,
  "discoveries+matrix insert",
);

// Renumber remaining section headers (best-effort)
const renumbers = [
  ["4. Poder discriminativo", "6. Poder discriminativo"],
  ["3. Associação com cancelamento", "5. Associação com cancelamento"],
  ["5. Relações com NPS", "7. Relações com NPS"],
  ["6. Promotores, Neutros e Detratores", "8. Promotores, Neutros e Detratores"],
  ["7. Associação com renovação", "9. Associação com renovação"],
  ["8. Renovados vs não renovados", "10. Renovados vs não renovados"],
  ["9. Associação com permanência", "11. Associação com permanência"],
  ["10. Curva de sobrevivência", "12. Curva de sobrevivência"],
  ["11. Variáveis excluídas", "14. Variáveis excluídas"],
  ["12. Qualidade dos dados", "15. Qualidade, cobertura e limitações"],
  ["13. Detalhamento técnico", "16. Detalhamento técnico"],
];
for (const [a, b] of renumbers) {
  if (html.includes(a)) html = html.replace(a, b);
}

// 5) Insert cohort + risk rules before variáveis excluídas
mustReplace(
  `          <div class="section-head"><div><h2>14. Variáveis excluídas</h2>`,
  `          <div class="section-head"><div><h2>13. Análise de coorte de retenção <span class="help" tabindex="0" data-tip="Cada coluna representa clientes contratados no mesmo período. Cada linha mostra quantos permaneceram após determinado número de meses. Meses futuros ficam vazios (não observáveis), não 0%.">?</span></h2>
            <p class="sc-section-note" style="margin:0">Cada coluna é uma coorte de contratação. Cada linha é a idade em meses. Células futuras ficam vazias.</p></div>
            <span class="export-host" id="scCohortExportHost"></span>
          </div>
          <div id="scCohortHost" class="sc-cohort-wrap"></div>
          <p class="note-muted" id="scCohortNote"></p>

          <div class="section-head"><div><h2>Combinações de sinais (legado das Descobertas)</h2><p class="sc-section-note" style="margin:0">Lift = taxa de cancelamento da combinação ÷ taxa-base. Exploratório; não é modelo operacional.</p></div>
            <span class="export-host" id="scRulesExportHost"></span>
          </div>
          <section class="table-panel">
            <div class="table-wrap"><table><thead><tr><th>Combinação</th><th class="num">Clientes</th><th class="num">Cancelados</th><th class="num">Taxa</th><th class="num">Lift</th><th>Ressalva</th></tr></thead><tbody id="scRiskRuleRows"></tbody></table></div>
            <div class="empty" id="scRiskRulesEmpty">Nenhuma combinação com suporte suficiente.</div>
          </section>

          <div class="section-head"><div><h2>14. Variáveis excluídas</h2>`,
  "cohort+rules insert",
);

// 6) Survival host: add chart container before table host if not present
if (!html.includes('id="scSurvivalChart"')) {
  mustReplace(
    `          <div id="scSurvivalHost"></div>
          <div id="scSurvivalGroupsHost" style="margin-top:12px"></div>`,
    `          <div id="scSurvivalChart" class="sc-survival-chart"></div>
          <p class="note-muted" id="scSurvivalNarration"></p>
          <details class="metric-avail-details"><summary>Ver dados da curva</summary><div id="scSurvivalHost"></div></details>
          <div id="scSurvivalGroupsHost" style="margin-top:12px"></div>`,
    "survival chart",
  );
}

// 7) CSS additions
const cssMarker = `#view-statistical-crosses .sc-reading{color:var(--color-text-muted);font-size:11px;line-height:1.4;max-width:280px}`;
if (!html.includes(".sc-matrix-wrap")) {
  mustReplace(
    cssMarker,
    `${cssMarker}
    #view-statistical-crosses .sc-discoveries{display:grid;gap:10px;margin:0 0 18px}
    #view-statistical-crosses .sc-discovery-card{padding:12px 14px;border:1px solid var(--color-border);border-radius:8px;background:rgba(255,255,255,.03)}
    #view-statistical-crosses .sc-discovery-card strong{display:block;margin-bottom:4px;font-size:13px}
    #view-statistical-crosses .sc-discovery-card p{margin:0;font-size:12px;line-height:1.45;color:var(--color-text-muted)}
    #view-statistical-crosses .sc-matrix-vars{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}
    #view-statistical-crosses .sc-matrix-vars label{display:inline-flex;align-items:center;gap:6px;font-size:11px;padding:4px 8px;border:1px solid var(--color-border);border-radius:999px;background:rgba(255,255,255,.03);cursor:pointer}
    #view-statistical-crosses .sc-matrix-wrap{width:100%;max-width:100%;overflow:auto;min-width:0;border:1px solid var(--color-border);border-radius:8px;background:#141414}
    #view-statistical-crosses .sc-matrix-table{border-collapse:collapse;font-size:10px}
    #view-statistical-crosses .sc-matrix-table th,#view-statistical-crosses .sc-matrix-table td{min-width:42px;height:42px;text-align:center;border:1px solid rgba(255,255,255,.06);padding:2px}
    #view-statistical-crosses .sc-matrix-table th{font-weight:600;color:var(--color-text-muted);background:#1a1a1a;position:sticky;top:0;z-index:1}
    #view-statistical-crosses .sc-matrix-table th.sc-matrix-corner{left:0;z-index:2}
    #view-statistical-crosses .sc-matrix-table th.sc-matrix-rowhead{position:sticky;left:0;text-align:left;padding:0 8px;white-space:nowrap;max-width:140px;overflow:hidden;text-overflow:ellipsis;background:#1a1a1a}
    #view-statistical-crosses .sc-matrix-table td{cursor:pointer;color:#f5f5f5;font-variant-numeric:tabular-nums}
    #view-statistical-crosses .sc-matrix-drawer{position:fixed;top:0;right:0;width:min(420px,100%);height:100%;z-index:80;background:#1a1a1a;border-left:1px solid var(--color-border);padding:20px;overflow:auto;box-shadow:-8px 0 24px rgba(0,0,0,.45)}
    #view-statistical-crosses .sc-matrix-drawer-close{position:absolute;top:10px;right:12px;background:transparent;border:0;color:var(--color-text);font-size:22px;cursor:pointer}
    #view-statistical-crosses .sc-cohort-wrap{width:100%;overflow:auto;min-width:0;border:1px solid var(--color-border);border-radius:8px}
    #view-statistical-crosses .sc-cohort-table{border-collapse:collapse;font-size:11px;min-width:720px}
    #view-statistical-crosses .sc-cohort-table th,#view-statistical-crosses .sc-cohort-table td{min-width:54px;padding:6px 4px;text-align:center;border:1px solid rgba(255,255,255,.06)}
    #view-statistical-crosses .sc-cohort-table th{background:#1a1a1a;position:sticky;top:0;z-index:1;font-size:10px}
    #view-statistical-crosses .sc-cohort-table th.sc-cohort-rowhead,#view-statistical-crosses .sc-cohort-table td.sc-cohort-rowhead{position:sticky;left:0;background:#1a1a1a;text-align:left;padding-left:8px;z-index:2}
    #view-statistical-crosses .sc-survival-chart{width:100%;min-height:240px;border:1px solid var(--color-border);border-radius:8px;background:#141414;padding:12px;box-sizing:border-box}
    #view-statistical-crosses .sc-survival-chart svg{width:100%;height:220px;display:block}
    @media print{
      body{background:#fff!important;color:#111!important}
      .sidebar,.topbar,#assistantLauncher,#assistantPanel,#assistantBackdrop,.filters,.status-actions,.export-host,.portal-alert__close,.btn,.sc-matrix-drawer{display:none!important}
      .layout{display:block!important}
      main{padding:0!important}
      .view{display:none!important}
      #view-statistical-crosses.view.active,#view-statistical-crosses.view{display:block!important}
      .chart-card,.table-panel,.metric{break-inside:avoid;box-shadow:none;border-color:#ddd}
    }`,
    "css",
  );
}

// 8) Hide stub crossings + redirect exploration in hash map
mustReplace(
  `      const map = { ep:'ep', 'performance-ep':'ep', 'statistical-crosses':'statistical-crosses', sc:'statistical-crosses', exploration:'exploration', discoveries:'exploration' };`,
  `      const map = { ep:'ep', 'performance-ep':'ep', 'statistical-crosses':'statistical-crosses', sc:'statistical-crosses', exploration:'statistical-crosses', discoveries:'statistical-crosses', crossings:'statistical-crosses', 'analises-estatisticas':'statistical-crosses', analises:'statistical-crosses' };`,
  "hash map",
);

// Hide old views from nav usage: exploration click already gone; mark exploration view as hidden in CSS
if (!html.includes("#view-exploration{display:none")) {
  html = html.replace(
    "#view-exploration{overflow-x:hidden;min-width:0}",
    "#view-exploration{display:none!important}\n    #view-crossings{display:none!important}\n    #view-exploration{overflow-x:hidden;min-width:0}",
  );
}

writeFileSync(path, html);
console.log("Patched index.html structure OK");
