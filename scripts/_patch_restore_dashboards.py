# -*- coding: utf-8 -*-
"""One-shot patcher: restore EP + Statistical Crosses dashboards into index.html."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
text = INDEX.read_text(encoding="utf-8")
orig = text

CSS = r'''
    /* Performance do EP */
    #view-ep .summary.kpis-ep-primary{grid-template-columns:repeat(6,1fr);margin-bottom:8px}
    #view-ep .metric.kpi-primary{
      border-color:rgba(244,121,32,.45);
      border-top:2px solid var(--color-primary);
      background:linear-gradient(165deg,rgba(244,121,32,.14),var(--color-surface) 58%);
    }
    #view-ep .metric.kpi-primary .metric-label{color:#f0b07a}
    #view-ep .metric.kpi-primary .metric-value{color:#ffc796;font-size:30px}
    #view-ep .charts.ep-charts{grid-template-columns:repeat(2,minmax(0,1fr))}
    #view-ep .chart-card.ep-span-all{grid-column:1/-1}
    #view-ep .ep-sample-tag,#view-ep .badge-sample-small{
      display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;
      font-size:9px;font-weight:700;letter-spacing:.02em;vertical-align:middle;
      color:#5c3d00;background:rgba(246,189,75,.28);border:1px solid rgba(246,189,75,.55);
    }
    #view-ep .ep-portfolio-toggle{display:inline-flex;gap:0;margin:0 0 10px}
    #view-ep .filters.ep label.ep-check{
      display:flex;align-items:center;gap:8px;height:40px;align-self:end;font-weight:600;
    }
    #view-ep .filters.ep label.ep-check input{width:auto;height:auto;margin:0}
    #view-ep .table-wrap{max-height:min(62vh,640px);overflow:auto}
    #view-ep .pharus-section{margin-top:28px}
    #view-ep .pharus-warn{margin:8px 0 0}

    /* Cruzamentos Estatísticos */
    #view-statistical-crosses .summary.kpis-sc-primary{grid-template-columns:repeat(6,1fr);margin-bottom:8px}
    #view-statistical-crosses .metric.kpi-primary{
      border-color:rgba(244,121,32,.45);
      border-top:2px solid var(--color-primary);
      background:linear-gradient(165deg,rgba(244,121,32,.14),var(--color-surface) 58%);
    }
    #view-statistical-crosses .metric.kpi-primary .metric-label{color:#f0b07a}
    #view-statistical-crosses .metric.kpi-primary .metric-value{color:#ffc796;font-size:30px}
    #view-statistical-crosses .badge-sample-small{
      display:inline-block;margin-left:6px;padding:1px 6px;border-radius:999px;
      font-size:9px;font-weight:700;color:#5c3d00;background:rgba(246,189,75,.28);border:1px solid rgba(246,189,75,.55);
    }
    #view-statistical-crosses .table-wrap{max-height:min(58vh,560px);overflow:auto}
    #view-statistical-crosses .sc-section{margin-top:22px}
    #view-statistical-crosses .sc-km-svg{width:100%;height:220px;background:#141414;border-radius:10px;border:1px solid var(--color-border)}
    #view-statistical-crosses .sc-causality-note{
      margin:8px 0 0;padding:10px 12px;border-radius:var(--radius-md);
      border:1px solid rgba(246,189,75,.35);background:rgba(246,189,75,.08);
      font-size:12px;color:var(--color-text-muted);line-height:1.45;
    }
'''

# Insert CSS before the first @media(max-width:1100px) that mentions kpis-cancel — extend media queries too
MEDIA_1100_OLD = "#view-cancellations .summary.kpis-cancel-primary,#view-cancellations .summary.kpis-cancel-retention,#view-cancellations .summary.kpis-cancel-ops{grid-template-columns:repeat(2,1fr)}"
MEDIA_1100_NEW = "#view-cancellations .summary.kpis-cancel-primary,#view-cancellations .summary.kpis-cancel-retention,#view-cancellations .summary.kpis-cancel-ops,#view-ep .summary.kpis-ep-primary,#view-statistical-crosses .summary.kpis-sc-primary{grid-template-columns:repeat(3,1fr)}"
MEDIA_780_OLD = "#view-cancellations .summary.kpis-cancel-primary,#view-cancellations .summary.kpis-cancel-retention,#view-cancellations .summary.kpis-cancel-ops{grid-template-columns:1fr}"
MEDIA_780_NEW = "#view-cancellations .summary.kpis-cancel-primary,#view-cancellations .summary.kpis-cancel-retention,#view-cancellations .summary.kpis-cancel-ops,#view-ep .summary.kpis-ep-primary,#view-statistical-crosses .summary.kpis-sc-primary{grid-template-columns:1fr}"

NAV_OLD = '''        <button type="button" data-nav="cancellations"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5"/><path d="m22 8-5 5"/></svg></span>Cancelamento</button>
        <button type="button" data-nav="quality"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg></span>Qualidade</button>'''

NAV_NEW = '''        <button type="button" data-nav="cancellations"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="m17 8 5 5"/><path d="m22 8-5 5"/></svg></span>Cancelamento</button>
        <button type="button" data-nav="ep"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><circle cx="19" cy="8" r="2.5"/><path d="M19 10.5v2"/><path d="M19 14.5v.01"/><path d="m17.2 9.2-.9-.9"/><path d="m20.8 9.2.9-.9"/><path d="M16.5 11.5H15"/><path d="M23 11.5h-1.5"/></svg></span>Performance do EP</button>
        <button type="button" data-nav="statistical-crosses"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M3 3v18h18"/><circle cx="8" cy="14" r="1.5"/><circle cx="12" cy="9" r="1.5"/><circle cx="17" cy="12" r="1.5"/><circle cx="15" cy="17" r="1.5"/><path d="m8 14 4-5 5 3"/></svg></span>Cruzamentos Estatísticos</button>
        <button type="button" data-nav="quality"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/></svg></span>Qualidade</button>'''

VIEWS_HTML = r'''
      <section class="view" id="view-ep">
        <div class="container">
          <header class="page-header">
            <div>
              <div class="eyebrow">BASE QV · Performance do Engenheiro Patrimonial (+ App Pharus separado)</div>
              <h1>Performance do Engenheiro Patrimonial</h1>
              <p>Carteira, composição e relacionamento por EP atual — reuniões do App Pharus em seção isolada.</p>
            </div>
            <div class="status-actions">
              <div class="status"><b id="epStatus" style="color:var(--color-warning)">● Conectando à base</b><span id="epUpdated">Carregando indicadores…</span></div>
              <button class="btn" id="epRefresh" type="button">Atualizar</button>
            </div>
          </header>

          <aside class="portal-alert portal-alert--info" id="epMethodAlert" data-alert-id="ep-performance-method-warning" role="status" aria-label="Leitura dos indicadores por EP">
            <div class="portal-alert__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </div>
            <div class="portal-alert__content">
              <h3>Leitura dos indicadores por EP</h3>
              <p>Os indicadores são descritivos da carteira atribuída ao EP atualmente registrado no cliente. Não há histórico de troca de responsável — eventos históricos ficam no EP atual.</p>
              <p class="portal-alert__note">Percentual cancelado = composição da carteira (não é taxa temporal). O período de reunião filtra pela data do evento.</p>
            </div>
            <button type="button" class="portal-alert__close" data-dismiss-portal-alert aria-label="Fechar aviso" title="Fechar">×</button>
          </aside>

          <section class="filters financial ep" aria-label="Filtros de performance dos EPs">
            <label>Busca EP<input id="epSearch" placeholder="Nome do Engenheiro Patrimonial" /></label>
            <label>Status do cliente<select id="epStatusFilter">
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="active_or_frozen">Ativos e congelados</option>
              <option value="frozen">Congelados</option>
              <option value="cancelled">Cancelados</option>
              <option value="unknown">Não informados</option>
            </select></label>
            <label>Segmento<select id="epSegment"><option value="all">Todos</option></select></label>
            <label>Contratação — de<input id="epHireFrom" type="date" /></label>
            <label>Contratação — até<input id="epHireTo" type="date" /></label>
            <label>Período reunião<select id="epPeriod">
              <option value="all">Todo o histórico</option>
              <option value="30">Últimos 30 dias</option>
              <option value="90">Últimos 90 dias</option>
              <option value="this_month">Este mês</option>
              <option value="last_month">Mês passado</option>
              <option value="this_year">Este ano</option>
              <option value="last_year">Ano passado</option>
              <option value="custom">Intervalo personalizado</option>
            </select></label>
            <label>Reunião — de<input id="epFrom" type="date" /></label>
            <label>Reunião — até<input id="epTo" type="date" /></label>
            <label>Fonte reuniões<select id="epMeetingSource">
              <option value="base_qv">BASE QV</option>
              <option value="pharus">App Pharus</option>
              <option value="all">Todas</option>
            </select></label>
            <label class="ep-check"><input id="epOnlyPortfolio" type="checkbox" checked /> Somente EPs com carteira</label>
            <label class="ep-check"><input id="epOnlyMeetings" type="checkbox" /> Somente EPs com reuniões</label>
            <button class="btn" id="epClear" type="button">Limpar filtros</button>
          </section>

          <p class="note-muted" id="epPeriodNote">Período aplicado às reuniões · Indicadores atribuídos ao EP atual.</p>

          <section class="summary kpis-ep-primary" id="epKpis"></section>

          <div class="section-head"><div><h2>Comparativo por EP</h2><p>Sem ranking único · ordene pela tabela · amostra sempre visível.</p></div></div>
          <section class="charts ep-charts">
            <article class="chart-card">
              <h3>Carteira por EP</h3>
              <p>Métrica selecionável · amostra visível</p>
              <div class="seg ep-portfolio-toggle" id="epPortfolioMetric" role="group" aria-label="Métrica da carteira">
                <button type="button" data-ep-metric="active" class="active">Ativos</button>
                <button type="button" data-ep-metric="frozen">Congelados</button>
                <button type="button" data-ep-metric="cancelled">Cancelados</button>
              </div>
              <div id="epChartPortfolio"></div>
            </article>
            <article class="chart-card"><h3>Cobertura de reuniões</h3><p>Clientes com ≥1 reunião ÷ carteira</p><div id="epChartCoverage"></div></article>
            <article class="chart-card"><h3>Frequência de reuniões</h3><p>Média por cliente · mediana entre quem tem reunião</p><div id="epChartFrequency"></div></article>
            <article class="chart-card"><h3>Clientes sem reuniões</h3><p>Quantidade absoluta na carteira filtrada</p><div id="epChartNoMeetings"></div></article>
          </section>

          <section class="table-panel">
            <div class="section-head" style="margin:0">
              <div><h2>Performance por Engenheiro Patrimonial</h2><p>Clique em uma linha para abrir o detalhe do EP.</p></div>
              <span class="counter" id="epCounter"></span>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th data-epsort="engineer">EP</th>
                    <th data-epsort="totalClients" class="num">Clientes</th>
                    <th data-epsort="activeClients" class="num">Ativos</th>
                    <th data-epsort="frozenClients" class="num">Congelados</th>
                    <th data-epsort="cancelledClients" class="num">Cancelados</th>
                    <th data-epsort="cancelledShareOfPortfolio" class="num">% cancelado da carteira <span class="help" title="Percentual dos clientes atribuídos ao EP atual com status Cancelado. Eventos históricos vão para o EP atual — não é taxa temporal.">?</span></th>
                    <th data-epsort="meetingCoverage" class="num">Cobertura reuniões</th>
                    <th data-epsort="clientsWithMeeting" class="num">Com reunião</th>
                    <th data-epsort="averageMeetingsPerClient" class="num">Média reun./cliente</th>
                    <th data-epsort="medianMeetingsAmongWithMeetings" class="num">Mediana (c/ reunião)</th>
                    <th data-epsort="medianDaysSinceLastMeeting" class="num">Mediana dias desde última reunião</th>
                    <th data-epsort="totalMeetings" class="num">Total reuniões</th>
                    <th data-epsort="sampleSizeLabel">Amostra</th>
                    <th data-epsort="alerts">Alertas</th>
                  </tr>
                </thead>
                <tbody id="epRows"></tbody>
              </table>
            </div>
            <div class="empty" id="epEmpty">Nenhum EP encontrado para os filtros selecionados.</div>
            <div class="pagination">
              <div id="epPageInfo"></div>
              <div>
                <button class="btn" id="epPrev" type="button">Anterior</button>
                <button class="btn" id="epNext" type="button">Próxima</button>
              </div>
            </div>
          </section>

          <section class="pharus-section" id="epPharusSection" aria-label="Reuniões no App Pharus">
            <div class="section-head">
              <div>
                <h2>Reuniões no App Pharus</h2>
                <p>Fonte separada · não mistura com BASE QV · falha isolada.</p>
              </div>
            </div>
            <div id="epPharusWarn" class="pharus-warn" hidden></div>
            <section class="summary kpis-ep-primary" id="epPharusKpis"></section>
            <section class="charts ep-charts" id="epPharusCharts">
              <article class="chart-card"><h3>Reuniões por EP (Pharus)</h3><p>Instâncias em scheduled_meetings</p><div id="epPharusChartAdvisors"></div></article>
              <article class="chart-card"><h3>Evolução mensal (Pharus)</h3><p>Quando disponível</p><div id="epPharusChartMonths"></div></article>
            </section>
          </section>

          <div id="epQualityWarnHost" style="margin-top:16px">
            <div id="epQualityWarn" data-alert-id="ep-performance-quality-warning" hidden role="status"></div>
          </div>
        </div>
      </section>

      <section class="view" id="view-statistical-crosses">
        <div class="container">
          <header class="page-header">
            <div>
              <div class="eyebrow">BASE QV · Cruzamentos Estatísticos</div>
              <h1>Cruzamentos Estatísticos</h1>
              <p>Associações e diferenças entre ativos e cancelados — sem recalcular testes pesados no navegador.</p>
            </div>
            <div class="status-actions">
              <div class="status"><b id="scStatus" style="color:var(--color-warning)">● Conectando à base</b><span id="scUpdated">Carregando indicadores…</span></div>
              <button class="btn" id="scRefresh" type="button">Atualizar</button>
            </div>
          </header>

          <aside class="portal-alert portal-alert--info" id="scInterpretAlert" data-alert-id="statistical-crosses-interpret" role="status" aria-label="Como interpretar os cruzamentos">
            <div class="portal-alert__icon" aria-hidden="true">
              <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>
            </div>
            <div class="portal-alert__content">
              <h3>Como interpretar os cruzamentos</h3>
              <p>Os resultados medem associação e capacidade discriminativa no recorte filtrado. Associação não implica causalidade. Amostra e cobertura mínimas evitam leituras instáveis.</p>
              <p class="portal-alert__note">Filtros que alteram a população disparam novo cálculo no servidor. Cobertura mínima filtra a exibição das tabelas.</p>
            </div>
            <button type="button" class="portal-alert__close" data-dismiss-portal-alert aria-label="Fechar aviso" title="Fechar">×</button>
          </aside>

          <section class="filters financial" aria-label="Filtros de cruzamentos estatísticos">
            <label>Contratação — de<input id="scHireFrom" type="date" /></label>
            <label>Contratação — até<input id="scHireTo" type="date" /></label>
            <label>Status<select id="scStatusFilter">
              <option value="active_cancelled">Ativos e cancelados</option>
              <option value="all">Todos</option>
              <option value="active">Ativos</option>
              <option value="cancelled">Cancelados</option>
              <option value="frozen">Congelados</option>
            </select></label>
            <label>Segmento<select id="scSegment"><option value="all">Todos</option></select></label>
            <label>Engenheiro Patrimonial<select id="scEngineer"><option value="all">Todos</option></select></label>
            <label>Possui reunião<select id="scHasMeeting">
              <option value="all">Todos</option>
              <option value="yes">Sim</option>
              <option value="no">Não</option>
            </select></label>
            <label>Diagnóstico financeiro<select id="scHasFinancial">
              <option value="all">Todos</option>
              <option value="yes">Sim</option>
              <option value="no">Não</option>
            </select></label>
            <label>Atualização financeira recente<select id="scRecentFinancial">
              <option value="all">Todos</option>
              <option value="yes">Com diagnóstico</option>
              <option value="no">Sem diagnóstico</option>
            </select></label>
            <label>Cobertura mínima (%)<input id="scMinCoverage" type="number" min="0" max="100" step="1" value="30" /></label>
            <label>Amostra mínima<input id="scMinSample" type="number" min="5" max="500" step="1" value="30" /></label>
            <button class="btn" id="scClear" type="button">Limpar filtros</button>
            <button class="btn primary" id="scApply" type="button">Aplicar</button>
          </section>

          <section class="summary kpis-sc-primary" id="scKpis"></section>

          <section class="table-panel sc-section">
            <div class="section-head" style="margin:0">
              <div><h2>Diferenças entre grupos</h2><p>Ativos vs cancelados · medianas, diferenças, cobertura e associação.</p></div>
              <span class="counter" id="scDiffCounter"></span>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Variável</th>
                    <th class="num">Mediana ativos</th>
                    <th class="num">Mediana cancelados</th>
                    <th class="num">Diferença</th>
                    <th class="num">Dif. %</th>
                    <th class="num">N ativos</th>
                    <th class="num">N cancel.</th>
                    <th class="num">Cobertura</th>
                    <th>Associação</th>
                    <th>Força</th>
                  </tr>
                </thead>
                <tbody id="scDiffRows"></tbody>
              </table>
            </div>
            <div class="empty" id="scDiffEmpty">Não há dados suficientes para este recorte.</div>
          </section>

          <section class="table-panel sc-section">
            <div class="section-head" style="margin:0">
              <div><h2>Poder preditivo univariado (AUC)</h2><p>Logística univariada · valores vindos do servidor.</p></div>
            </div>
            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Variável</th>
                    <th class="num">AUC</th>
                    <th>Direção</th>
                    <th class="num">Amostra</th>
                    <th class="num">Ausência %</th>
                    <th>Alertas</th>
                  </tr>
                </thead>
                <tbody id="scAucRows"></tbody>
              </table>
            </div>
            <div class="empty" id="scAucEmpty">Não há dados suficientes para este recorte.</div>
          </section>

          <section class="table-panel sc-section">
            <div class="section-head" style="margin:0">
              <div><h2>Ranking de associações</h2><p>Numéricas e categóricas separadas.</p></div>
            </div>
            <div class="section-head" style="margin:12px 0 0"><div><h3>Numéricas</h3></div></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Variável</th><th class="num">|Assoc.|</th><th>Medida</th><th>Força</th><th class="num">Amostra</th></tr></thead>
                <tbody id="scAssocNumRows"></tbody>
              </table>
            </div>
            <div class="empty" id="scAssocNumEmpty">Não há dados suficientes para este recorte.</div>
            <div class="section-head" style="margin:16px 0 0"><div><h3>Categóricas</h3></div></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Variável</th><th class="num">|Assoc.|</th><th>Medida</th><th>Força</th><th class="num">Amostra</th></tr></thead>
                <tbody id="scAssocCatRows"></tbody>
              </table>
            </div>
            <div class="empty" id="scAssocCatEmpty">Não há dados suficientes para este recorte.</div>
          </section>

          <section class="table-panel sc-section">
            <div class="section-head" style="margin:0"><div><h2>Análise por segmento</h2><p>Comparações relacionadas a segmento.</p></div></div>
            <div id="scSegmentHost"></div>
            <div class="empty" id="scSegmentEmpty">Não há dados suficientes para este recorte.</div>
          </section>

          <section class="table-panel sc-section">
            <div class="section-head" style="margin:0"><div><h2>Análise de reuniões</h2><p>Variáveis de reunião × cancelamento.</p></div></div>
            <div id="scMeetingHost"></div>
            <p class="sc-causality-note">Associação entre reuniões e cancelamento não prova causalidade: clientes em risco podem ter mais ou menos contato por outros motivos.</p>
            <div class="empty" id="scMeetingEmpty">Não há dados suficientes para este recorte.</div>
          </section>

          <section class="table-panel sc-section">
            <div class="section-head" style="margin:0"><div><h2>Atualização financeira</h2><p>Diagnóstico, renda, liquidez e aportes.</p></div></div>
            <div id="scFinancialHost"></div>
            <div class="empty" id="scFinancialEmpty">Não há dados suficientes para este recorte.</div>
          </section>

          <section class="table-panel sc-section">
            <div class="section-head" style="margin:0">
              <div><h2>Sobrevivência (Kaplan–Meier)</h2><p>Evento = cancelamento · ativos/congelados censurados.</p></div>
            </div>
            <div id="scSurvivalSummary" class="note-muted" style="margin-bottom:10px"></div>
            <div id="scKmChart"></div>
            <div class="table-wrap" style="margin-top:12px">
              <table>
                <thead><tr><th class="num">Tempo (dias)</th><th class="num">Sobrevivência</th><th class="num">Em risco</th><th class="num">Eventos</th><th class="num">Censurados</th></tr></thead>
                <tbody id="scKmRows"></tbody>
              </table>
            </div>
            <div class="empty" id="scKmEmpty">Não há dados suficientes para este recorte.</div>
          </section>

          <section class="table-panel sc-section">
            <div class="section-head" style="margin:0"><div><h2>Variáveis excluídas</h2><p>Fora do AUC ou com motivo de exclusão.</p></div></div>
            <div class="table-wrap">
              <table>
                <thead><tr><th>Variável</th><th>Motivo</th></tr></thead>
                <tbody id="scExcludedRows"></tbody>
              </table>
            </div>
            <div class="empty" id="scExcludedEmpty">Nenhuma variável excluída neste recorte.</div>
          </section>

          <div id="scQualityWarnHost" style="margin-top:16px">
            <div id="scQualityWarn" data-alert-id="statistical-crosses-quality-warning" hidden role="status"></div>
          </div>
        </div>
      </section>

'''

# Find insertion point: before view-quality, after cancellations closes
MARKER_QUALITY = '      <section class="view" id="view-quality">'
if MARKER_QUALITY not in text:
    raise SystemExit("view-quality marker not found")
if 'id="view-ep"' in text:
    raise SystemExit("view-ep already present — abort")

# CSS: insert before support kpis or after cancellations kpi-primary block
CSS_ANCHOR = "    #view-cancellations .metric.kpi-primary .metric-value{color:#ffc796;font-size:34px}"
if CSS_ANCHOR not in text:
    raise SystemExit("CSS anchor not found")
text = text.replace(CSS_ANCHOR, CSS_ANCHOR + "\n" + CSS, 1)

if MEDIA_1100_OLD not in text:
    raise SystemExit("media 1100 anchor not found")
text = text.replace(MEDIA_1100_OLD, MEDIA_1100_NEW)

if MEDIA_780_OLD not in text:
    raise SystemExit("media 780 anchor not found")
text = text.replace(MEDIA_780_OLD, MEDIA_780_NEW)

if NAV_OLD not in text:
    raise SystemExit("nav anchor not found")
text = text.replace(NAV_OLD, NAV_NEW, 1)

text = text.replace(MARKER_QUALITY, VIEWS_HTML + MARKER_QUALITY, 1)

# ---- Navigation wiring ----
VIEWS_OLD = """    const views = {
      general: document.querySelector('#view-general'),
      journey: document.querySelector('#view-journey'),
      plan: document.querySelector('#view-plan'),
      meetings: document.querySelector('#view-meetings'),
      mechanisms: document.querySelector('#view-mechanisms'),
      financial: document.querySelector('#view-financial'),
      platform: document.querySelector('#view-platform'),
      support: document.querySelector('#view-support'),
      cancellations: document.querySelector('#view-cancellations'),
      quality: document.querySelector('#view-quality')
    };"""

VIEWS_NEW = """    const views = {
      general: document.querySelector('#view-general'),
      journey: document.querySelector('#view-journey'),
      plan: document.querySelector('#view-plan'),
      meetings: document.querySelector('#view-meetings'),
      mechanisms: document.querySelector('#view-mechanisms'),
      financial: document.querySelector('#view-financial'),
      platform: document.querySelector('#view-platform'),
      support: document.querySelector('#view-support'),
      cancellations: document.querySelector('#view-cancellations'),
      ep: document.querySelector('#view-ep'),
      'statistical-crosses': document.querySelector('#view-statistical-crosses'),
      quality: document.querySelector('#view-quality')
    };"""

if VIEWS_OLD not in text:
    raise SystemExit("views object not found")
text = text.replace(VIEWS_OLD, VIEWS_NEW, 1)

PAGEMAP_OLD = """      const pageMap = {
        general: 'general',
        journey: 'journey',
        plan: 'patrimonial_plan',
        meetings: 'meetings',
        mechanisms: 'mechanisms',
        financial: 'financial_updates',
        platform: 'platform_usage',
        support: 'support',
        cancellations: 'cancellations',
        quality: 'quality',
      };
      window.__portalCurrentPageCanonical = pageMap[btn.dataset.nav] || btn.dataset.nav || 'general';
      if (btn.dataset.nav === 'general' && !generalState.payload) loadGeneral();
      if (btn.dataset.nav === 'journey' && !onboardingState.payload) loadOnboarding();
      if (btn.dataset.nav === 'plan' && !planState.payload) loadPlan();
      if (btn.dataset.nav === 'meetings' && !meetingsState.payload) loadMeetings();
      if (btn.dataset.nav === 'mechanisms' && !mechanismsState.payload) loadMechanisms();
      if (btn.dataset.nav === 'financial' && !financialState.payload) loadFinancial();
      if (btn.dataset.nav === 'platform' && !platformState.payload) loadPlatform();
      if (btn.dataset.nav === 'support' && !supportState.payload) loadSupport();
      if (btn.dataset.nav === 'cancellations' && !cancellationsState.payload) loadCancellations();
      if (btn.dataset.nav === 'quality' && !qualityData.length) loadQuality();
      remountPortalAlertsForPage(btn.dataset.nav);"""

PAGEMAP_NEW = """      const pageMap = {
        general: 'general',
        journey: 'journey',
        plan: 'patrimonial_plan',
        meetings: 'meetings',
        mechanisms: 'mechanisms',
        financial: 'financial_updates',
        platform: 'platform_usage',
        support: 'support',
        cancellations: 'cancellations',
        ep: 'ep_performance',
        'statistical-crosses': 'statistical_crosses',
        quality: 'quality',
      };
      window.__portalCurrentPageCanonical = pageMap[btn.dataset.nav] || btn.dataset.nav || 'general';
      if (btn.dataset.nav === 'ep' || btn.dataset.nav === 'statistical-crosses') {
        try { history.replaceState(null, '', '#' + btn.dataset.nav); } catch (_) {}
      }
      if (btn.dataset.nav === 'general' && !generalState.payload) loadGeneral();
      if (btn.dataset.nav === 'journey' && !onboardingState.payload) loadOnboarding();
      if (btn.dataset.nav === 'plan' && !planState.payload) loadPlan();
      if (btn.dataset.nav === 'meetings' && !meetingsState.payload) loadMeetings();
      if (btn.dataset.nav === 'mechanisms' && !mechanismsState.payload) loadMechanisms();
      if (btn.dataset.nav === 'financial' && !financialState.payload) loadFinancial();
      if (btn.dataset.nav === 'platform' && !platformState.payload) loadPlatform();
      if (btn.dataset.nav === 'support' && !supportState.payload) loadSupport();
      if (btn.dataset.nav === 'cancellations' && !cancellationsState.payload) loadCancellations();
      if (btn.dataset.nav === 'ep' && !epState.payload) loadEpPerformance();
      if (btn.dataset.nav === 'statistical-crosses' && !scState.payload) loadStatisticalCrosses();
      if (btn.dataset.nav === 'quality' && !qualityData.length) loadQuality();
      remountPortalAlertsForPage(btn.dataset.nav);"""

if PAGEMAP_OLD not in text:
    raise SystemExit("pageMap block not found")
text = text.replace(PAGEMAP_OLD, PAGEMAP_NEW, 1)

CANON_OLD = """    window.__portalCurrentPageCanonical = ({
      general: 'general', journey: 'journey', plan: 'patrimonial_plan', meetings: 'meetings',
      mechanisms: 'mechanisms', financial: 'financial_updates', platform: 'platform_usage',
      support: 'support', cancellations: 'cancellations', quality: 'quality',
    })[window.__portalCurrentPage] || window.__portalCurrentPage;"""

CANON_NEW = """    window.__portalCurrentPageCanonical = ({
      general: 'general', journey: 'journey', plan: 'patrimonial_plan', meetings: 'meetings',
      mechanisms: 'mechanisms', financial: 'financial_updates', platform: 'platform_usage',
      support: 'support', cancellations: 'cancellations', ep: 'ep_performance',
      'statistical-crosses': 'statistical_crosses', quality: 'quality',
    })[window.__portalCurrentPage] || window.__portalCurrentPage;"""

if CANON_OLD not in text:
    raise SystemExit("canonical map not found")
text = text.replace(CANON_OLD, CANON_NEW, 1)

# remount alerts
REMOUNT_OLD = """      if (nav === 'cancellations' && typeof cancellationsState !== 'undefined' && cancellationsState.payload) {
        restoreStaticPortalAlert('#cProcessExplainer', 'cancellations-process-explainer');
        showSourceWarningsAlert(
          '#cSourceAlert',
          'cancellations-data-quality-warning',
          'Atenção à cobertura dos dados de cancelamento',
          [
            ...(cancellationsState.payload.warnings || []),
            ...(cancellationsState.payload.quality?.warnings || [])
          ],
          {
            message: 'Alguns indicadores dependem de datas e preenchimento do processo. Registros sem informação suficiente não são tratados como zero.',
            note: 'Os KPIs disponíveis continuam sendo exibidos com a cobertura real de cada métrica.'
          }
        );
      }
    }"""

REMOUNT_NEW = """      if (nav === 'cancellations' && typeof cancellationsState !== 'undefined' && cancellationsState.payload) {
        restoreStaticPortalAlert('#cProcessExplainer', 'cancellations-process-explainer');
        showSourceWarningsAlert(
          '#cSourceAlert',
          'cancellations-data-quality-warning',
          'Atenção à cobertura dos dados de cancelamento',
          [
            ...(cancellationsState.payload.warnings || []),
            ...(cancellationsState.payload.quality?.warnings || [])
          ],
          {
            message: 'Alguns indicadores dependem de datas e preenchimento do processo. Registros sem informação suficiente não são tratados como zero.',
            note: 'Os KPIs disponíveis continuam sendo exibidos com a cobertura real de cada métrica.'
          }
        );
      }
      if (nav === 'ep') {
        restoreStaticPortalAlert('#epMethodAlert', 'ep-performance-method-warning');
        if (typeof epState !== 'undefined' && epState.payload) {
          showSourceWarningsAlert(
            '#epQualityWarn',
            'ep-performance-quality-warning',
            'Alertas de qualidade — Performance do EP',
            epState.payload.qualityWarnings || epState.payload.warnings || [],
            {
              message: 'Há alertas na consolidação por EP. Os indicadores disponíveis continuam sendo exibidos.',
              note: 'A seção App Pharus falha de forma isolada e não apaga a BASE QV.'
            }
          );
        }
      }
      if (nav === 'statistical-crosses') {
        restoreStaticPortalAlert('#scInterpretAlert', 'statistical-crosses-interpret');
        if (typeof scState !== 'undefined' && scState.payload) {
          showSourceWarningsAlert(
            '#scQualityWarn',
            'statistical-crosses-quality-warning',
            'Alertas de qualidade — Cruzamentos',
            scState.payload.qualityWarnings || scState.payload.warnings || [],
            {
              message: 'Há alertas metodológicos ou de amostra neste recorte. Os resultados disponíveis continuam sendo exibidos.',
              note: 'Associação ≠ causalidade.'
            }
          );
        }
      }
    }"""

if REMOUNT_OLD not in text:
    raise SystemExit("remount block not found")
text = text.replace(REMOUNT_OLD, REMOUNT_NEW, 1)

# Insert JS before startPortalApp
JS_MARKER = "    let portalStarted = false;"
JS_PATH = Path(__file__).resolve().parent / "_patch_restore_dashboards_js.js"
js = JS_PATH.read_text(encoding="utf-8")
if JS_MARKER not in text:
    raise SystemExit("portalStarted marker not found")
text = text.replace(JS_MARKER, js + "\n" + JS_MARKER, 1)

# startPortalApp hash + refresh + reset
REFRESH_OLD = """        if (views.cancellations?.classList.contains('active')) loadCancellations();
        if (views.quality?.classList.contains('active')) loadQuality();
      }, 5 * 60 * 1000);"""
REFRESH_NEW = """        if (views.cancellations?.classList.contains('active')) loadCancellations();
        if (views.ep?.classList.contains('active')) loadEpPerformance();
        if (views['statistical-crosses']?.classList.contains('active')) loadStatisticalCrosses();
        if (views.quality?.classList.contains('active')) loadQuality();
      }, 5 * 60 * 1000);"""
if REFRESH_OLD not in text:
    raise SystemExit("refresh interval not found")
text = text.replace(REFRESH_OLD, REFRESH_NEW, 1)

START_OLD = """      portalStarted = true;
      initStaticPortalAlerts();
      loadGeneral();
      setTimeout(() => { if (typeof showAssistantHintOnce === 'function') showAssistantHintOnce(); }, 2000);"""
START_NEW = """      portalStarted = true;
      initStaticPortalAlerts();
      loadGeneral();
      const hashNav = String(location.hash || '').replace(/^#/, '');
      if (hashNav === 'ep' || hashNav === 'statistical-crosses') {
        const hashBtn = document.querySelector(`[data-nav="${hashNav}"]`);
        if (hashBtn) setTimeout(() => hashBtn.click(), 0);
      }
      setTimeout(() => { if (typeof showAssistantHintOnce === 'function') showAssistantHintOnce(); }, 2000);"""
if START_OLD not in text:
    raise SystemExit("startPortalApp body not found")
text = text.replace(START_OLD, START_NEW, 1)

RESET_OLD = """      if (typeof cancellationsState !== 'undefined') cancellationsState.payload = null;
      if (typeof resetAssistant === 'function') resetAssistant();"""
RESET_NEW = """      if (typeof cancellationsState !== 'undefined') cancellationsState.payload = null;
      if (typeof epState !== 'undefined') epState.payload = null;
      if (typeof scState !== 'undefined') scState.payload = null;
      if (typeof resetAssistant === 'function') resetAssistant();"""
if RESET_OLD not in text:
    raise SystemExit("resetPortalApp not found")
text = text.replace(RESET_OLD, RESET_NEW, 1)

# filters media queries for ep
FILT_1100 = ".filters,.filters.general,.filters.meetings,.filters.mechanisms,.filters.financial{grid-template-columns:1fr 1fr}"
FILT_1100_N = ".filters,.filters.general,.filters.meetings,.filters.mechanisms,.filters.financial,#view-ep .filters.ep{grid-template-columns:1fr 1fr}"
text = text.replace(FILT_1100, FILT_1100_N, 1)

if text == orig:
    raise SystemExit("no changes applied")

INDEX.write_text(text, encoding="utf-8", newline="\n")
print("patched", INDEX)
print("delta bytes", len(text) - len(orig))
print("has view-ep", 'id="view-ep"' in text)
print("has view-sc", 'id="view-statistical-crosses"' in text)
print("has loadEp", "function loadEpPerformance" in text)
print("has loadSc", "function loadStatisticalCrosses" in text)
'''
