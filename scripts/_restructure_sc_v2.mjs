/**
 * Reestrutura a página Análises Estatísticas:
 * - seções por eixo (cancelamento/NPS/renovação/permanência)
 * - seletor compacto de variáveis
 * - heatmaps por eixo + zoom/fullscreen
 * - descobertas exploratórias (ranking, combinações, HS, preditivo)
 * Sem Git. Sem alteração de banco.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const path = resolve(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
let html = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function mustReplace(oldStr, newStr, label) {
  if (!html.includes(oldStr)) throw new Error(`Missing block: ${label}`);
  html = html.replace(oldStr, newStr);
}

// ---------- CSS ----------
{
  const anchor = `#view-statistical-crosses details.sc-data-details > summary{cursor:pointer;font-weight:600;font-size:13px;list-style:revert}`;
  const extra = `${anchor}
    #view-statistical-crosses .sc-axis-block{margin:0 0 28px;padding:0 0 8px;border-bottom:1px solid rgba(255,255,255,.06)}
    #view-statistical-crosses .sc-ms-wrap{position:relative;z-index:6;max-width:420px;margin:0 0 12px}
    #view-statistical-crosses .sc-ms-wrap.is-open{z-index:40}
    #view-statistical-crosses .sc-ms-trigger{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;padding:8px 12px;border:1px solid var(--color-border);border-radius:8px;background:#1a1a1a;color:var(--color-text);cursor:pointer;font-size:13px}
    #view-statistical-crosses .sc-ms-trigger:hover{border-color:rgba(244,121,32,.55)}
    #view-statistical-crosses .sc-ms-chips{font-size:12px;color:var(--color-text-muted);margin:6px 0 10px;min-height:18px}
    #view-statistical-crosses .sc-ms-panel{position:absolute;left:0;right:0;top:calc(100% + 6px);max-height:380px;overflow:auto;padding:12px;border:1px solid var(--color-border);border-radius:10px;background:#161616;box-shadow:0 12px 32px rgba(0,0,0,.45)}
    #view-statistical-crosses .sc-ms-panel[hidden]{display:none!important}
    #view-statistical-crosses .sc-ms-panel input[type="search"]{width:100%;margin:0 0 8px;padding:8px;border-radius:6px;border:1px solid var(--color-border);background:#111;color:var(--color-text)}
    #view-statistical-crosses .sc-ms-actions{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 10px}
    #view-statistical-crosses .sc-ms-actions button,#view-statistical-crosses .sc-zoom-bar button{padding:5px 10px;border:1px solid var(--color-border);border-radius:6px;background:#222;color:var(--color-text);font-size:12px;cursor:pointer}
    #view-statistical-crosses .sc-ms-group{margin:0 0 10px}
    #view-statistical-crosses .sc-ms-group strong{display:flex;justify-content:space-between;align-items:center;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted);margin:0 0 4px}
    #view-statistical-crosses .sc-ms-option{display:flex;gap:8px;align-items:center;padding:4px 6px;border-radius:6px;font-size:12px;cursor:pointer}
    #view-statistical-crosses .sc-ms-option:hover{background:rgba(244,121,32,.08)}
    #view-statistical-crosses .sc-ms-warn{color:#f59e0b;font-size:12px;margin:6px 0}
    #view-statistical-crosses .sc-zoom-bar{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px;align-items:center}
    #view-statistical-crosses .sc-zoom-stage{overflow:auto;max-width:100%;border:1px solid var(--color-border);border-radius:8px;background:#141414;min-height:180px;touch-action:pan-x pan-y}
    #view-statistical-crosses .sc-zoom-inner{transform-origin:0 0;display:inline-block;min-width:100%}
    #view-statistical-crosses .sc-fs-modal{position:fixed;inset:0;z-index:120;background:rgba(0,0,0,.82);display:flex;flex-direction:column;padding:16px;box-sizing:border-box}
    #view-statistical-crosses .sc-fs-modal[hidden]{display:none!important}
    #view-statistical-crosses .sc-fs-modal .sc-fs-toolbar{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 10px;align-items:center}
    #view-statistical-crosses .sc-fs-modal .sc-fs-body{flex:1;min-height:0;overflow:auto;background:#111;border-radius:10px;padding:12px;border:1px solid var(--color-border)}
    #view-statistical-crosses .sc-health-grid{display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));margin:0 0 12px}
    #view-statistical-crosses .sc-health-card{padding:12px 14px;border:1px solid var(--color-border);border-radius:8px;background:rgba(255,255,255,.03)}
    #view-statistical-crosses .sc-health-card strong{display:block;margin-bottom:4px}
    #view-statistical-crosses .sc-health-card p{margin:4px 0;font-size:12px;color:var(--color-text-muted);line-height:1.4}
    #view-statistical-crosses .sc-toc{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
    #view-statistical-crosses .sc-toc a{font-size:12px;color:var(--color-text-muted);text-decoration:none;padding:4px 8px;border:1px solid var(--color-border);border-radius:999px}
    #view-statistical-crosses .sc-toc a:hover{color:var(--color-text);border-color:rgba(244,121,32,.5)}`;
  if (html.includes(anchor) && !html.includes(".sc-ms-wrap{")) {
    html = html.replace(anchor, extra);
  }
}

// ---------- Replace main content block (resumo → antes de qualidade) ----------
const startMark = `          <div class="section-head"><div><h2>1. Resumo da população</h2>`;
const endMark = `          <div class="section-head"><div><h2>15. Qualidade, cobertura e limitações</h2>`;
const startIdx = html.indexOf(startMark);
const endIdx = html.indexOf(endMark);
if (startIdx < 0 || endIdx < 0) throw new Error("section markers not found");

const NEW_SECTIONS = `          <nav class="sc-toc" aria-label="Índice da página">
            <a href="#scSecResumo">Resumo</a>
            <a href="#scSecDiscoveries">Descobertas</a>
            <a href="#scSecCancel">Cancelamento</a>
            <a href="#scSecNps">NPS</a>
            <a href="#scSecRenewal">Renovação</a>
            <a href="#scSecTenure">Permanência</a>
            <a href="#scSecExplore">Exploratórias</a>
            <a href="#scSecGroups">Grupos</a>
            <a href="#scSecPredict">Preditivo</a>
            <a href="#scSecRules">Combinações</a>
            <a href="#scSecHealth">Health Score</a>
            <a href="#scSecSurvival">Sobrevivência</a>
            <a href="#scSecCohort">Cohort</a>
            <a href="#scSecGeneralMatrix">Matriz geral</a>
          </nav>

          <div class="section-head" id="scSecResumo"><div><h2>1. Resumo da base analítica</h2><p>Uma linha por cliente · regras oficiais de cancelamento, ciclo e NPS.</p></div></div>
          <section class="summary kpis-sc-primary" id="scKpis"></section>
          <p class="note-muted" id="scPopNote"></p>

          <div class="section-head" id="scSecDiscoveries"><div><h2>2. Principais descobertas</h2><p class="sc-section-note" style="margin:0">Textos determinísticos (sem IA generativa). Só entram achados com cobertura/amostra suficientes.</p></div>
            <button class="btn" id="scDiscoveriesToggle" type="button">Ver todas as descobertas</button>
          </div>
          <div id="scDiscoveriesHost" class="sc-discoveries"></div>

          <!-- CANCELAMENTO -->
          <div class="sc-axis-block" id="scSecCancel">
            <div class="section-head"><div><h2>3. Cancelamento — correlações e associações</h2>
              <p class="sc-section-note" style="margin:0">Mostra quais variáveis possuem maior relação observada com cancelamento. Valores maiores representam associações mais fortes, não causalidade.</p></div>
              <span class="export-host" id="scDiffExportHost"></span></div>
            <h3 style="font-size:14px;margin:12px 0 6px">Matriz de associação com cancelamento</h3>
            <div class="sc-zoom-bar" data-sc-zoom-for="scCancelMatrixStage">
              <button type="button" data-sc-zoom="in">Zoom +</button>
              <button type="button" data-sc-zoom="out">Zoom −</button>
              <button type="button" data-sc-zoom="fit">Ajustar</button>
              <button type="button" data-sc-zoom="reset">Resetar</button>
              <button type="button" data-sc-zoom="fs">Tela cheia</button>
              <button type="button" data-sc-zoom="export">Exportar PNG</button>
            </div>
            <div class="sc-matrix-layout">
              <div id="scCancelMatrixStage" class="sc-zoom-stage"><div class="sc-zoom-inner" id="scCancelMatrixHost"></div></div>
              <div id="scCancelMatrixLegend" class="sc-matrix-legend"></div>
            </div>
            <p class="note-muted" id="scCancelMatrixNarration"></p>
            <details class="sc-data-details"><summary>Ver dados da matriz de cancelamento</summary><div id="scCancelMatrixTable" class="table-wrap"></div></details>

            <h3 style="font-size:14px;margin:16px 0 6px">Diferença entre ativos e cancelados</h3>
            <label style="display:inline-block;margin:0 0 8px;font-size:12px">Unidade do gráfico
              <select id="scDiffUnit"><option value="time">Tempo / dias</option><option value="meetings">Reuniões</option><option value="money">Financeiro</option><option value="nps">NPS</option><option value="mech">Mecanismos</option></select>
            </label>
            <div id="scDiffChart" class="sc-chart-host"></div>
            <p class="note-muted" id="scDiffNarration"></p>
            <details class="sc-data-details"><summary>Ver dados de cancelamento (diferenças)</summary>
              <section class="table-panel" style="margin:0;border:0;padding:0;background:transparent">
                <div class="table-wrap"><table class="sc-diff-table"><thead><tr>
                  <th>Indicador</th><th class="num">Mediana ativos</th><th class="num">Mediana cancelados</th><th class="num">Diferença</th><th class="num">Dif. %</th><th>Associação</th><th>Força</th><th class="num">n ativos</th><th class="num">n cancel.</th><th class="num">Cobertura</th><th>Leitura</th>
                </tr></thead><tbody id="scDiffRows"></tbody></table></div>
                <div class="empty" id="scDiffEmpty">Não há dados suficientes para este recorte.</div>
              </section>
            </details>

            <h3 style="font-size:14px;margin:16px 0 6px">Poder preditivo individual (AUC)</h3>
            <div id="scAucChart" class="sc-chart-host"></div>
            <p class="note-muted" id="scAucNarration"></p>
            <section class="stat-association-grid sc-charts" style="margin-top:12px">
              <article class="chart-card"><h3>Associações numéricas</h3><div id="scChartNumeric"></div></article>
              <article class="chart-card"><h3>Associações categóricas</h3><div id="scChartCategorical"></div></article>
            </section>
            <details class="sc-data-details"><summary>Ver dados de AUC</summary>
              <section class="table-panel" style="margin:0;border:0;padding:0;background:transparent">
                <div class="table-wrap"><table><thead><tr><th>Variável</th><th class="num">AUC original</th><th class="num">AUC ajustada</th><th>Direção</th><th class="num">Amostra</th><th class="num">Cobertura</th><th>Status</th><th>Observação</th></tr></thead><tbody id="scAucRows"></tbody></table></div>
                <div class="empty" id="scAucEmpty" hidden>Não há variáveis elegíveis para AUC neste recorte.</div>
              </section>
            </details>
            <div id="scCancelRankHost" class="sc-chart-host" style="margin-top:12px"></div>
            <details class="sc-data-details"><summary>Ver ranking completo — cancelamento</summary><div id="scCancelRankTable" class="table-wrap"></div></details>
          </div>

          <!-- NPS -->
          <div class="sc-axis-block" id="scSecNps">
            <div class="section-head"><div><h2>4. NPS — matriz de correlação</h2>
              <p class="sc-section-note" style="margin:0">Mostra como cada indicador varia junto com a nota NPS (Spearman). Associação observada, não causalidade.</p></div>
              <span class="export-host" id="scNpsCorrExportHost"></span></div>
            <div class="sc-zoom-bar" data-sc-zoom-for="scNpsMatrixStage">
              <button type="button" data-sc-zoom="in">Zoom +</button>
              <button type="button" data-sc-zoom="out">Zoom −</button>
              <button type="button" data-sc-zoom="fit">Ajustar</button>
              <button type="button" data-sc-zoom="reset">Resetar</button>
              <button type="button" data-sc-zoom="fs">Tela cheia</button>
              <button type="button" data-sc-zoom="export">Exportar PNG</button>
            </div>
            <div class="sc-matrix-layout">
              <div id="scNpsMatrixStage" class="sc-zoom-stage"><div class="sc-zoom-inner" id="scNpsMatrixHost"></div></div>
              <div id="scNpsMatrixLegend" class="sc-matrix-legend"></div>
            </div>
            <p class="note-muted" id="scNpsMatrixNarration"></p>
            <details class="sc-data-details"><summary>Ver dados de NPS (correlações)</summary><div id="scNpsCorrHost"></div></details>
            <h3 style="font-size:14px;margin:16px 0 6px">Promotores, Neutros e Detratores</h3>
            <div id="scNpsGroupsChart" class="sc-chart-host"></div>
            <p class="note-muted" id="scNpsGroupsNarration"></p>
            <details class="sc-data-details"><summary>Ver dados de NPS por classe</summary>
              <section class="table-panel" style="margin:0;border:0;padding:0;background:transparent">
                <div class="table-wrap"><table><thead><tr>
                  <th>Grupo</th><th class="num">Clientes</th><th class="num">%</th><th class="num">Cancelados</th><th class="num">% cancelado</th><th class="num">Permanência</th><th class="num">Reuniões</th><th class="num">No-shows</th><th class="num">Renovados</th><th class="num">% renovado</th><th class="num">Ciclo</th><th class="num">Renda</th>
                </tr></thead><tbody id="scNpsGroupRows"></tbody></table></div>
                <div class="empty" id="scNpsGroupEmpty" hidden>Sem respostas NPS válidas no recorte.</div>
              </section>
            </details>
            <div id="scNpsRankHost" class="sc-chart-host" style="margin-top:12px"></div>
          </div>

          <!-- RENOVAÇÃO -->
          <div class="sc-axis-block" id="scSecRenewal">
            <div class="section-head"><div><h2>5. Renovação — matriz de associação</h2>
              <p class="sc-section-note" style="margin:0">Alvo: ciclo atual &gt; 1. currentCycle e renewalCount não entram como explicativas.</p></div>
              <span class="export-host" id="scRenewalDiffExportHost"></span></div>
            <div class="sc-zoom-bar" data-sc-zoom-for="scRenewalMatrixStage">
              <button type="button" data-sc-zoom="in">Zoom +</button>
              <button type="button" data-sc-zoom="out">Zoom −</button>
              <button type="button" data-sc-zoom="fit">Ajustar</button>
              <button type="button" data-sc-zoom="reset">Resetar</button>
              <button type="button" data-sc-zoom="fs">Tela cheia</button>
              <button type="button" data-sc-zoom="export">Exportar PNG</button>
            </div>
            <div class="sc-matrix-layout">
              <div id="scRenewalMatrixStage" class="sc-zoom-stage"><div class="sc-zoom-inner" id="scRenewalMatrixHost"></div></div>
              <div id="scRenewalMatrixLegend" class="sc-matrix-legend"></div>
            </div>
            <p class="note-muted" id="scRenewalMatrixNarration"></p>
            <section class="stat-association-grid sc-charts" style="margin-top:12px">
              <article class="chart-card"><h3>Associações numéricas</h3><div id="scChartRenewalNum"></div></article>
              <article class="chart-card"><h3>Associações categóricas</h3><div id="scChartRenewalCat"></div></article>
            </section>
            <h3 style="font-size:14px;margin:16px 0 6px">Renovados vs não renovados</h3>
            <div id="scRenewalDiffChart" class="sc-chart-host"></div>
            <p class="note-muted" id="scRenewalDiffNarration"></p>
            <details class="sc-data-details"><summary>Ver dados de renovação</summary>
              <section class="table-panel" style="margin:0;border:0;padding:0;background:transparent">
                <div class="table-wrap"><table><thead><tr><th>Variável</th><th class="num">Mediana renovados</th><th class="num">Mediana não renovados</th><th class="num">Diferença</th><th>Associação</th><th class="num">Amostra</th><th class="num">Cobertura</th><th>Observação</th></tr></thead><tbody id="scRenewalDiffRows"></tbody></table></div>
                <div class="empty" id="scRenewalDiffEmpty" hidden>Sem base de ciclo válida no recorte.</div>
              </section>
            </details>
            <div id="scRenewalRankHost" class="sc-chart-host" style="margin-top:12px"></div>
          </div>

          <!-- PERMANÊNCIA -->
          <div class="sc-axis-block" id="scSecTenure">
            <div class="section-head"><div><h2>6. Permanência — matriz de correlação</h2>
              <p class="sc-section-note" style="margin:0">Correlações descritivas com permanência em dias. Não confundir com Kaplan–Meier.</p></div></div>
            <div class="sc-zoom-bar" data-sc-zoom-for="scTenureMatrixStage">
              <button type="button" data-sc-zoom="in">Zoom +</button>
              <button type="button" data-sc-zoom="out">Zoom −</button>
              <button type="button" data-sc-zoom="fit">Ajustar</button>
              <button type="button" data-sc-zoom="reset">Resetar</button>
              <button type="button" data-sc-zoom="fs">Tela cheia</button>
              <button type="button" data-sc-zoom="export">Exportar PNG</button>
            </div>
            <div class="sc-matrix-layout">
              <div id="scTenureMatrixStage" class="sc-zoom-stage"><div class="sc-zoom-inner" id="scTenureMatrixHost"></div></div>
              <div id="scTenureMatrixLegend" class="sc-matrix-legend"></div>
            </div>
            <p class="note-muted" id="scTenureMatrixNarration"></p>
            <section class="charts sc-charts">
              <article class="chart-card sc-span-all"><h3>Correlações com permanência (Spearman)</h3><div id="scChartTenure"></div></article>
              <article class="chart-card sc-span-all"><h3>Clientes por faixa de permanência</h3><div id="scChartTenureBuckets"></div></article>
            </section>
          </div>

          <!-- EXPLORATÓRIAS -->
          <div class="section-head" id="scSecExplore"><div><h2>7. Descobertas exploratórias</h2>
            <p class="sc-section-note" style="margin:0">Rankings por eixo, combinações e candidatos a Health Score — evidência estatística, sem causalidade.</p></div></div>

          <div class="section-head" id="scSecGroups"><div><h2>8. Matriz comparativa dos grupos</h2>
            <p class="sc-section-note" style="margin:0">Diferença padronizada em relação à referência global. Unidades distintas — use a padronização para comparar.</p></div></div>
          <div class="sc-zoom-bar" data-sc-zoom-for="scGroupMatrixStage">
            <button type="button" data-sc-zoom="in">Zoom +</button>
            <button type="button" data-sc-zoom="out">Zoom −</button>
            <button type="button" data-sc-zoom="fit">Ajustar</button>
            <button type="button" data-sc-zoom="reset">Resetar</button>
            <button type="button" data-sc-zoom="fs">Tela cheia</button>
            <button type="button" data-sc-zoom="export">Exportar PNG</button>
          </div>
          <div id="scGroupMatrixStage" class="sc-zoom-stage"><div class="sc-zoom-inner" id="scGroupMatrixHost"></div></div>
          <p class="note-muted" id="scGroupMatrixNarration"></p>
          <details class="sc-data-details"><summary>Ver dados da matriz de grupos</summary><div id="scGroupMatrixTable" class="table-wrap"></div></details>

          <div class="section-head" id="scSecPredict"><div><h2>9. Ranking preditivo de cancelamento</h2>
            <p class="sc-section-note" style="margin:0">Mostra quais variáveis mais contribuíram para separar cancelados e não cancelados no modelo de validação. Importância ≠ causalidade.</p></div></div>
          <div id="scPredictMeta" class="note-muted"></div>
          <div id="scPredictChart" class="sc-chart-host"></div>
          <details class="sc-data-details"><summary>Ver ranking completo (Top 20)</summary><div id="scPredictTable" class="table-wrap"></div></details>

          <div class="section-head" id="scSecRules"><div><h2>10. Combinações de fatores</h2>
            <p class="sc-section-note" style="margin:0">Mostra grupos de condições associados a taxas diferentes de cancelamento. Também inclui perfil de alta performance (Promotor ∩ Renovado).</p></div>
            <span class="export-host" id="scRulesExportHost"></span></div>
          <div id="scHighPerfHost" class="sc-chart-host"></div>
          <p class="note-muted" id="scHighPerfNarration"></p>
          <details class="sc-data-details" open><summary>Ver regras de risco (amostra mínima)</summary>
            <section class="table-panel" style="margin:0;border:0;padding:0;background:transparent">
              <div class="table-wrap"><table><thead><tr><th>Combinação</th><th class="num">Clientes</th><th class="num">Cancelados</th><th class="num">Taxa</th><th class="num">Lift</th><th>Ressalva</th></tr></thead><tbody id="scRiskRuleRows"></tbody></table></div>
              <div class="empty" id="scRiskRulesEmpty">Nenhuma combinação com suporte suficiente.</div>
            </section>
          </details>

          <div class="section-head" id="scSecHealth"><div><h2>11. Health Score MVP — candidatos</h2>
            <p class="sc-section-note" style="margin:0">Apresenta candidatos iniciais para um indicador operacional, escolhidos pela força, cobertura e disponibilidade do dado.</p></div></div>
          <div id="scHealthHost" class="sc-health-grid"></div>
          <p class="note-muted" id="scHealthNarration"></p>

          <!-- SOBREVIVÊNCIA -->
          <div class="section-head" id="scSecSurvival"><div><h2>12. Curva de sobrevivência</h2>
            <p class="sc-section-note" style="margin:0">Kaplan–Meier: cancelamento com data = evento; demais = censurados até hoje (America/Sao_Paulo).</p></div></div>
          <label style="display:inline-block;margin:0 0 8px;font-size:12px">Comparar por
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
          <details class="sc-data-details"><summary>Ver grupos estratificados (tabela)</summary><div id="scSurvivalGroupsHost" style="margin-top:12px"></div></details>

          <!-- COHORT -->
          <div class="section-head" id="scSecCohort"><div><h2>13. Análise de cohort</h2>
            <p class="sc-section-note" style="margin:0">Cada coluna é uma coorte de contratação. Meses futuros ficam vazios (não observáveis), não 0%.</p></div>
            <span class="export-host" id="scCohortExportHost"></span></div>
          <section class="filters financial" aria-label="Controles da coorte" style="margin-bottom:10px">
            <label>Granularidade<select id="scCohortGranularity"><option value="month" selected>Mensal</option><option value="quarter">Trimestral</option></select></label>
            <label>Texto da célula<select id="scCohortCellMode"><option value="pct" selected>Percentual</option><option value="n">Quantidade</option></select></label>
            <label>Tamanho mínimo da coorte<input id="scCohortMinN" type="number" min="1" value="5" style="width:72px"/></label>
          </section>
          <div class="sc-zoom-bar" data-sc-zoom-for="scCohortStage">
            <button type="button" data-sc-zoom="in">Aumentar zoom</button>
            <button type="button" data-sc-zoom="out">Diminuir zoom</button>
            <button type="button" data-sc-zoom="fit">Ajustar à largura</button>
            <button type="button" data-sc-zoom="reset">Resetar</button>
            <button type="button" data-sc-zoom="fs" id="scCohortExpand">Ampliar cohort</button>
            <button type="button" data-sc-zoom="export">Exportar PNG</button>
          </div>
          <div id="scCohortStage" class="sc-zoom-stage sc-cohort-wrap" style="min-height:320px"><div class="sc-zoom-inner" id="scCohortHost"></div></div>
          <p class="note-muted" id="scCohortNote"></p>
          <details class="sc-data-details"><summary>Ver dados do cohort</summary><div id="scCohortTableHost" class="table-wrap"></div></details>

          <!-- MATRIZ GERAL -->
          <div class="section-head" id="scSecGeneralMatrix"><div><h2>14. Matriz geral de relações entre variáveis</h2>
            <p class="sc-section-note" style="margin:0">Complementar às matrizes por eixo. Spearman (padrão) ou Pearson.</p></div></div>
          <section class="filters financial" aria-label="Controles da matriz geral" style="margin-bottom:10px">
            <label title="Spearman mede relações monotônicas e é mais robusto a valores extremos. Pearson mede relações lineares.">Método
              <select id="scCorrMethod" title="Spearman mede relações monotônicas e é mais robusto a valores extremos. Pearson mede relações lineares.">
                <option value="spearman" selected>Spearman</option>
                <option value="pearson">Pearson</option>
              </select>
            </label>
          </section>
          <div class="sc-ms-wrap" id="scMsWrap">
            <button type="button" class="sc-ms-trigger" id="scMsTrigger" aria-haspopup="listbox" aria-expanded="false">
              <span id="scMsSummary">Variáveis selecionadas: 10</span><span aria-hidden="true">▾</span>
            </button>
            <div class="sc-ms-chips" id="scMsChips"></div>
            <div class="sc-ms-panel" id="scMsPanel" hidden>
              <input type="search" id="scMsSearch" placeholder="Buscar variável…" />
              <div class="sc-ms-actions">
                <button type="button" id="scMatrixRecommended">Selecionar recomendadas</button>
                <button type="button" id="scMatrixClear">Limpar</button>
                <button type="button" id="scMsApply">Aplicar</button>
                <button type="button" id="scMsCancel">Cancelar</button>
              </div>
              <div id="scMsWarn" class="sc-ms-warn" hidden>Selecione no máximo 12 variáveis para manter a legibilidade.</div>
              <div id="scMatrixVarsHost"></div>
            </div>
          </div>
          <div class="sc-zoom-bar" data-sc-zoom-for="scMatrixStage">
            <button type="button" data-sc-zoom="in">Zoom +</button>
            <button type="button" data-sc-zoom="out">Zoom −</button>
            <button type="button" data-sc-zoom="fit">Ajustar</button>
            <button type="button" data-sc-zoom="reset">Resetar</button>
            <button type="button" data-sc-zoom="fs">Tela cheia</button>
            <button type="button" data-sc-zoom="export">Exportar PNG</button>
          </div>
          <div class="sc-matrix-layout">
            <div id="scMatrixStage" class="sc-zoom-stage"><div class="sc-zoom-inner" id="scMatrixHost" class="sc-matrix-wrap" aria-label="Heatmap de correlação"></div></div>
            <div id="scMatrixLegend" class="sc-matrix-legend" aria-hidden="true"></div>
          </div>
          <div id="scMatrixInsights" class="sc-matrix-insights"></div>
          <details class="sc-data-details"><summary>Ver dados da matriz geral</summary><div id="scMatrixTableHost" class="table-wrap"></div></details>
          <aside id="scMatrixDrawer" class="sc-matrix-drawer" hidden>
            <button type="button" class="sc-matrix-drawer-close" id="scMatrixDrawerClose" aria-label="Fechar">×</button>
            <div id="scMatrixDrawerBody"></div>
          </aside>

          <div class="section-head"><div><h2>15. Variáveis excluídas</h2><p>Leakage, cobertura, amostra, constante ou inválida.</p></div><span class="export-host" id="scExcludedExportHost"></span></div>
          <div id="scExcludedHost"></div>

          <div id="scFsModal" class="sc-fs-modal" hidden>
            <div class="sc-fs-toolbar">
              <strong id="scFsTitle">Visualização ampliada</strong>
              <button type="button" data-sc-zoom="in" data-sc-fs="1">Zoom +</button>
              <button type="button" data-sc-zoom="out" data-sc-fs="1">Zoom −</button>
              <button type="button" data-sc-zoom="fit" data-sc-fs="1">Ajustar</button>
              <button type="button" data-sc-zoom="export" data-sc-fs="1">Exportar PNG</button>
              <button type="button" id="scFsClose">Fechar (Esc)</button>
            </div>
            <div class="sc-fs-body" id="scFsBody"></div>
          </div>

`;

html = html.slice(0, startIdx) + NEW_SECTIONS + html.slice(endIdx);

// Remove orphaned old duplicate "Como interpretar" is already above filters - OK
// Fix quality section number stays 15 - user wanted 17 - renumber quality to 16/17
html = html.replace(
  `<div class="section-head"><div><h2>15. Qualidade, cobertura e limitações</h2>`,
  `<div class="section-head" id="scSecQuality"><div><h2>16. Qualidade, cobertura e limitações</h2>`,
);
html = html.replace(
  `<summary>16. Detalhamento técnico / disponibilidade</summary>`,
  `<summary>17. Dados técnicos recolhíveis</summary>`,
);

writeFileSync(path, html);
console.log("HTML sections restructured");
