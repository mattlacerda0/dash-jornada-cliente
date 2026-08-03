/**
 * Patch index.html — replace Cruzamentos Estatísticos JS block.
 * No git.
 */
import fs from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const path = resolve(root, "index.html");
let html = fs.readFileSync(path, "utf8");

const startMark = "    /* -------- Cruzamentos Estatísticos -------- */";
const endMark = "    /* -------- Quality (existing behavior + descriptions) -------- */";

const start = html.indexOf(startMark);
const end = html.indexOf(endMark, start);
if (start < 0 || end < 0) {
  console.error("markers not found", { start, end });
  process.exit(1);
}

const NEW = String.raw`    /* -------- Cruzamentos Estatísticos -------- */
    const scState = { payload: null, loading: false, requestId: 0 };
    const scFilters = {
      hireFrom: document.querySelector('#scHireFrom'),
      hireTo: document.querySelector('#scHireTo'),
      cancelFrom: document.querySelector('#scCancelFrom'),
      cancelTo: document.querySelector('#scCancelTo'),
      status: document.querySelector('#scStatusFilter'),
      segment: document.querySelector('#scSegment'),
      engineer: document.querySelector('#scEngineer'),
      hasMeeting: document.querySelector('#scHasMeeting'),
      hasNps: document.querySelector('#scHasNps'),
      npsClass: document.querySelector('#scNpsClass'),
      renewed: document.querySelector('#scRenewed'),
      hasFinancial: document.querySelector('#scHasFinancial'),
      hasMechanism: document.querySelector('#scHasMechanism'),
      minCoverage: document.querySelector('#scMinCoverage'),
      minSample: document.querySelector('#scMinSample')
    };

    function fillScFilters() {
      const opts = scState.payload?.filterOptions || {};
      const fill = (sel, values, allLabel) => {
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = \`<option value="all">\${allLabel}</option>\` + (values || []).map((v) => \`<option value="\${escapeHtml(v)}">\${escapeHtml(v)}</option>\`).join('');
        sel.value = (values || []).includes(cur) ? cur : 'all';
      };
      fill(scFilters.segment, opts.segments, 'Todos');
      fill(scFilters.engineer, opts.engineers, 'Todos');
    }

    function scFmtAssoc(v) {
      if (v == null || !Number.isFinite(Number(v))) return null;
      return Number(v).toFixed(3).replace('.', ',');
    }
    function scStatusLabel(status, reason) {
      if (!status || status === 'available') return '';
      const map = {
        small_sample: 'Amostra pequena',
        low_coverage: 'Baixa cobertura',
        constant: 'Variável constante',
        insufficient_groups: 'Grupos insuficientes',
        invalid: 'Inválido',
        leakage: 'Risco de leakage',
        error: 'Erro de cálculo'
      };
      return map[status] || reason || status;
    }
    function scAssocBarItems(rows) {
      return (rows || [])
        .filter((a) => a.association != null || a.associationAbs != null || a.absMeasure != null || a.rho != null)
        .slice(0, 14)
        .map((a) => {
          const raw = a.association ?? a.rho ?? a.absMeasure ?? a.associationAbs ?? 0;
          const mag = Math.abs(Number(a.associationAbs ?? a.absMeasure ?? a.abs ?? raw ?? 0));
          const cov = a.coveragePercent ?? a.coverage ?? (a.missingPercent != null ? (100 - a.missingPercent) : null);
          const signed = Number.isFinite(Number(raw)) ? Number(raw) : mag;
          const dir = signed > 0 ? 'positiva' : signed < 0 ? 'negativa' : 'neutra';
          return {
            label: a.label || a.id,
            count: Math.max(1, Math.round(mag * 1000)),
            display: \`Associação: \${scFmtAssoc(signed)} · cobertura: \${cov != null ? epFmtPct(cov) : '—'}\`,
            titleExtra: \`\${dir}\${a.strength ? ' · ' + a.strength : ''}\${a.status && a.status !== 'available' ? ' · ' + scStatusLabel(a.status, a.reason) : ''}\`
          };
        });
    }
    function scAssocBars(items) {
      if (!items.length) return '<div class="empty" style="display:block">Nenhuma associação calculável neste recorte (verifique cobertura/amostra).</div>';
      const max = Math.max(...items.map((i) => i.count), 1);
      return items.map((i) => \`
        <div class="hbar" title="\${escapeHtml(i.label)}: \${escapeHtml(i.display)}\${i.titleExtra ? ' · ' + escapeHtml(i.titleExtra) : ''}">
          <div class="hbar-label" title="\${escapeHtml(i.label)}">\${escapeHtml(i.label)}</div>
          <div class="hbar-track"><span style="width:\${(i.count / max) * 100}%"></span></div>
          <div class="hbar-val">\${escapeHtml(i.display)}</div>
        </div>\`).join('');
    }
    function scPassMin(row, minCov, minSample) {
      const cov = row.coveragePercent ?? row.coverage ?? (row.missingPercent != null ? (100 - row.missingPercent) : 100);
      const nA = row.nActive ?? row.activeN ?? row.nRenewed ?? row.n0 ?? 0;
      const nC = row.nCancelled ?? row.cancelledN ?? row.nNotRenewed ?? row.n1 ?? 0;
      const n = row.n ?? row.sample ?? row.sampleSize ?? (nA + nC);
      if (row.status === 'constant' || row.status === 'invalid' || row.status === 'leakage') return false;
      if (cov != null && Number.isFinite(cov) && cov < minCov) return false;
      if (nA > 0 || nC > 0) {
        if (nA < minSample || nC < minSample) return false;
      } else if (n < minSample * 2) return false;
      return true;
    }
    function scNum(v, digits = 1) {
      if (v == null || !Number.isFinite(Number(v))) return '—';
      return Number(v).toLocaleString('pt-BR', { maximumFractionDigits: digits });
    }
    function scPctDiff(a, b) {
      if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;
      return ((b - a) / Math.abs(a)) * 100;
    }

    function renderStatisticalCrosses() {
      if (!scState.payload) return;
      const p = scState.payload;
      const s = p.summary || {};
      const pop = p.population || p.metadata?.population || {};
      const minCov = Number(scFilters.minCoverage?.value ?? 30);
      const minSample = Number(scFilters.minSample?.value ?? 5);
      const tip = (text, label) => (typeof portalMetricTip === 'function' ? portalMetricTip(text, label) : '');

      setOrHtml('#scKpis', \`
        <article class="metric kpi-primary"><div class="metric-label">Clientes analisados \${tip('Uma linha por cliente no recorte filtrado. Fonte: BASE QV consolidada.', 'Analisados')}</div><div class="metric-value">\${fmt.format(s.analyzedClients ?? pop.total ?? 0)}</div><div class="metric-note">População consolidada</div></article>
        <article class="metric"><div class="metric-label">Clientes ativos \${tip('Status analítico Ativo e sem cancelamento efetivado.', 'Ativos')}</div><div class="metric-value">\${fmt.format(s.activeClients ?? pop.active ?? 0)}</div></article>
        <article class="metric kpi-primary"><div class="metric-label">Cancelamentos efetivados \${tip('Regra oficial: churn_efetivado_at OU distrato_assinado_at OU distrato Assinado OU clients.data_churn.', 'Cancelados')}</div><div class="metric-value">\${fmt.format(s.confirmedCancellations ?? pop.cancelled ?? 0)}</div><div class="metric-note">Com data: \${fmt.format(s.cancelledWithDate ?? pop.cancelledWithDate ?? 0)} · sem data: \${fmt.format(s.cancelledWithoutDate ?? pop.cancelledWithoutDate ?? 0)}</div></article>
        <article class="metric"><div class="metric-label">Clientes renovados \${tip('currentCycle > 1 (clients.ciclo). Não é taxa contratual formal.', 'Renovados')}</div><div class="metric-value">\${fmt.format(s.renewedClients ?? 0)}</div><div class="metric-note">Ciclo 1: \${fmt.format(s.cycle1Clients ?? 0)}</div></article>
        <article class="metric"><div class="metric-label">Respostas NPS válidas \${tip('Última resposta 0–10 por cliente; preditivo exclui NPS pós-cancelamento.', 'NPS')}</div><div class="metric-value">\${fmt.format(s.validNpsResponses ?? s.npsResponses ?? 0)}</div><div class="metric-note">Índice preditivo: \${s.npsIndex ?? s.nps ?? '—'}</div></article>
        <article class="metric"><div class="metric-label">Variáveis avaliadas \${tip('Quantidade de variáveis com tentativa de cálculo neste recorte.', 'Variáveis')}</div><div class="metric-value">\${fmt.format(s.evaluatedVariables ?? 0)}</div></article>
        <article class="metric"><div class="metric-label">Cobertura média \${tip('Média das coberturas das variáveis avaliadas.', 'Cobertura')}</div><div class="metric-value">\${s.averageCoverage == null ? '—' : epFmtPct(s.averageCoverage)}</div></article>
        <article class="metric"><div class="metric-label">Período observado \${tip('Menor data de contratação no recorte até a data de geração do payload.', 'Período')}</div><div class="metric-value" style="font-size:15px">\${s.observationPeriod?.from ? dateBR(s.observationPeriod.from) : '—'} → \${s.observationPeriod?.to ? dateBR(s.observationPeriod.to) : '—'}</div></article>\`);

      const exclPop = (pop.frozen || 0) + (pop.unknown || 0) + (pop.excluded || 0);
      setOrHtml('#scPopNote', \`Comparação Ativos vs cancelados: \${fmt.format(pop.activeUsedInComparison ?? pop.active ?? 0)} ativos × \${fmt.format(pop.cancelledUsedInComparison ?? pop.cancelled ?? 0)} cancelados efetivados. Congelados/outros fora da comparação: \${fmt.format(exclPop)}.\`);

      const diffs = (p.activeVsCancelled || p.groupDifferences || p.comparisons || []).filter((d) => d.type === 'numeric' || d.type == null);
      const visibleDiffs = diffs.filter((d) => scPassMin(d, minCov, minSample) || (d.medianActive != null && d.medianCancelled != null));
      setOrHtml('#scDiffRows', visibleDiffs.map((d) => {
        const medA = d.medianActive ?? d.medianNonCancelled ?? d.activeMedian ?? d.median0;
        const medC = d.medianCancelled ?? d.cancelledMedian ?? d.median1;
        const diff = d.diff ?? d.diffAbs ?? d.differenceAbs ?? (medA != null && medC != null ? medC - medA : null);
        const pctD = d.diffPercent ?? scPctDiff(medA, medC);
        const assoc = d.association != null ? Number(d.association) : null;
        const assocText = assoc == null
          ? (scStatusLabel(d.status, d.reason) || 'Não calculável')
          : \`\${scFmtAssoc(assoc)} (\${d.strength || d.associationStrength || '—'})\`;
        const nA = d.nActive ?? d.activeN ?? 0;
        const nC = d.nCancelled ?? d.cancelledN ?? 0;
        const cov = d.coveragePercent ?? d.coverage;
        const badge = d.sampleSmall || nC < 20 || nA < 20 ? ' · Amostra pequena' : '';
        return \`<tr>
          <td>\${escapeHtml(d.label || d.id || '—')}</td>
          <td class="num">\${scNum(medA)}</td>
          <td class="num">\${scNum(medC)}</td>
          <td class="num">\${scNum(diff)}</td>
          <td class="num">\${pctD == null ? '—' : scNum(pctD) + '%'}</td>
          <td>\${escapeHtml(assocText)}</td>
          <td class="num">\${nA || '—'}</td>
          <td class="num">\${nC || '—'}</td>
          <td class="num">\${cov != null ? epFmtPct(cov) : '—'}</td>
          <td>\${escapeHtml((d.note || d.reason || 'Diferença observada') + badge)}</td>
        </tr>\`;
      }).join(''));
      const diffEmpty = document.querySelector('#scDiffEmpty');
      if (diffEmpty) {
        diffEmpty.style.display = visibleDiffs.length ? 'none' : 'block';
        if (!visibleDiffs.length) diffEmpty.textContent = \`Sem variáveis com amostra descritiva suficiente (mín. \${minSample}/grupo, cobertura ≥ \${minCov}%).\`;
      }

      const churn = p.churnAssociations || {};
      const numeric = churn.numeric || p.numericAssociations || (p.associations || []).filter((a) => a.type === 'numeric');
      const categorical = churn.categorical || p.categoricalAssociations || (p.associations || []).filter((a) => a.type === 'categorical');
      setOrHtml('#scChartNumeric', scAssocBars(scAssocBarItems(numeric.filter((a) => scPassMin(a, minCov, minSample) || a.association != null))));
      setOrHtml('#scChartCategorical', scAssocBars(scAssocBarItems(categorical.filter((a) => scPassMin(a, minCov, minSample) || a.association != null))));

      const auc = p.univariatePredictivePower || p.univariateAuc || p.predictivePower || [];
      setOrHtml('#scAucRows', auc.map((a) => {
        const orig = a.aucOriginal ?? a.auc;
        const adj = a.aucAdjusted ?? a.aucInverted ?? (orig != null ? Math.max(orig, 1 - orig) : null);
        const status = scStatusLabel(a.status, a.reason) || (a.auc == null && adj == null ? 'Indisponível' : 'OK');
        return \`<tr>
          <td>\${escapeHtml(a.label || a.id || '—')}</td>
          <td class="num">\${orig == null ? '—' : scNum(orig, 3)}</td>
          <td class="num">\${adj == null ? '—' : scNum(adj, 3)}</td>
          <td>\${escapeHtml(a.direction || a.aucDirection || '—')}</td>
          <td class="num">\${a.n ?? a.sample ?? '—'}</td>
          <td class="num">\${(a.coveragePercent ?? a.coverage) != null ? epFmtPct(a.coveragePercent ?? a.coverage) : '—'}</td>
          <td>\${escapeHtml(status)}</td>
          <td>\${escapeHtml(a.warning || a.note || a.reason || '—')}</td>
        </tr>\`;
      }).join(''));
      const aucEmpty = document.querySelector('#scAucEmpty');
      if (aucEmpty) aucEmpty.hidden = auc.length > 0;

      const npsCorr = p.npsCorrelations || [];
      setOrHtml('#scNpsCorrHost', npsCorr.length
        ? \`<div class="table-wrap"><table><thead><tr><th>Variável</th><th>Medida</th><th class="num">Associação</th><th class="num">Amostra</th><th class="num">Cobertura</th><th>Status</th><th>Observação</th></tr></thead><tbody>\${npsCorr.map((r) => \`<tr>
            <td>\${escapeHtml(r.label || r.id || '—')}</td>
            <td>\${escapeHtml(r.measure || r.method || 'Spearman/ponto-bisserial')}</td>
            <td class="num">\${scFmtAssoc(r.association ?? r.rho) ?? '—'}</td>
            <td class="num">\${r.n ?? r.sample ?? '—'}</td>
            <td class="num">\${(r.coveragePercent ?? r.coverage) != null ? epFmtPct(r.coveragePercent ?? r.coverage) : '—'}</td>
            <td>\${escapeHtml(scStatusLabel(r.status, r.reason) || 'OK')}</td>
            <td>\${escapeHtml(r.note || r.reason || '—')}</td>
          </tr>\`).join('')}</tbody></table></div>\`
        : '<p class="note-muted">Sem correlações NPS calculáveis neste recorte.</p>');

      const npsGroups = p.npsGroups || [];
      setOrHtml('#scNpsGroupRows', npsGroups.map((g) => {
        const totalNps = npsGroups.reduce((a, x) => a + (x.n || 0), 0) || 1;
        return \`<tr>
          <td>\${escapeHtml(g.label || g.class || '—')}\${g.sampleSmall || (g.n || 0) < 5 ? ' <span class="badge sample-small">Amostra pequena</span>' : ''}</td>
          <td class="num">\${fmt.format(g.n || 0)}</td>
          <td class="num">\${epFmtPct(((g.n || 0) / totalNps) * 100)}</td>
          <td class="num">\${fmt.format(g.cancelled || 0)}</td>
          <td class="num">\${g.cancelledPct != null ? epFmtPct(g.cancelledPct) : '—'}</td>
          <td class="num">\${scNum(g.medianStayDays ?? g.meanStayDays)}</td>
          <td class="num">\${scNum(g.medianMeetings ?? g.meanMeetings)}</td>
          <td class="num">\${scNum(g.medianNoShows)}</td>
          <td class="num">\${fmt.format(g.renewed || 0)}</td>
          <td class="num">\${g.renewedPct != null ? epFmtPct(g.renewedPct) : '—'}</td>
          <td class="num">\${scNum(g.medianCycle)}</td>
          <td class="num">\${scNum(g.medianIncome)}</td>
        </tr>\`;
      }).join(''));
      const npsGEmpty = document.querySelector('#scNpsGroupEmpty');
      if (npsGEmpty) npsGEmpty.hidden = npsGroups.length > 0;

      const ren = p.renewalAssociations || {};
      setOrHtml('#scChartRenewalNum', scAssocBars(scAssocBarItems(ren.numeric || [])));
      setOrHtml('#scChartRenewalCat', scAssocBars(scAssocBarItems(ren.categorical || [])));

      const renDiff = p.renewedVsNotRenewed || [];
      setOrHtml('#scRenewalDiffRows', renDiff.map((d) => {
        const medR = d.medianRenewed ?? d.median1;
        const medN = d.medianNotRenewed ?? d.median0;
        const diff = d.diff ?? (medR != null && medN != null ? medR - medN : null);
        const assoc = d.association != null ? scFmtAssoc(d.association) : (scStatusLabel(d.status, d.reason) || '—');
        return \`<tr>
          <td>\${escapeHtml(d.label || d.id || '—')}</td>
          <td class="num">\${scNum(medR)}</td>
          <td class="num">\${scNum(medN)}</td>
          <td class="num">\${scNum(diff)}</td>
          <td>\${escapeHtml(String(assoc))}</td>
          <td class="num">\${d.n ?? ((d.nRenewed || 0) + (d.nNotRenewed || 0)) || '—'}</td>
          <td class="num">\${(d.coveragePercent ?? d.coverage) != null ? epFmtPct(d.coveragePercent ?? d.coverage) : '—'}</td>
          <td>\${escapeHtml(d.note || d.reason || '—')}</td>
        </tr>\`;
      }).join(''));
      const renEmpty = document.querySelector('#scRenewalDiffEmpty');
      if (renEmpty) renEmpty.hidden = renDiff.length > 0;

      const tenureCorr = p.tenureCorrelations || [];
      setOrHtml('#scChartTenure', scAssocBars(scAssocBarItems(tenureCorr.map((t) => ({
        ...t,
        association: t.rho ?? t.association,
        associationAbs: Math.abs(t.rho ?? t.association ?? 0)
      })))));
      const buckets = p.tenureBuckets || [];
      setOrHtml('#scChartTenureBuckets', buckets.length
        ? \`<div class="table-wrap"><table><thead><tr><th>Faixa</th><th class="num">Clientes</th><th class="num">Cancelados</th><th class="num">Renovados</th><th class="num">NPS médio</th><th class="num">% com reunião</th></tr></thead><tbody>\${buckets.map((b) => \`<tr>
            <td>\${escapeHtml(b.label || b.band || '—')}</td>
            <td class="num">\${fmt.format(b.n || b.clients || 0)}</td>
            <td class="num">\${fmt.format(b.cancelled || 0)}</td>
            <td class="num">\${fmt.format(b.renewed || 0)}</td>
            <td class="num">\${scNum(b.meanNps ?? b.npsMean)}</td>
            <td class="num">\${(b.hasMeetingPct ?? b.meetingPct) != null ? epFmtPct(b.hasMeetingPct ?? b.meetingPct) : '—'}</td>
          </tr>\`).join('')}</tbody></table></div>\`
        : '<p class="note-muted">Sem faixas de permanência no recorte.</p>');

      const surv = p.survival?.overall || {};
      const curve = surv.curve || [];
      if (!curve.length) {
        setOrHtml('#scSurvivalHost', '<div class="empty" style="display:block">Curva indisponível (sem eventos/censuras elegíveis).</div>');
      } else {
        setOrHtml('#scSurvivalHost', \`
          <p class="note-muted">n início=\${surv.nStart ?? '—'} · eventos=\${surv.events ?? '—'} · censurados=\${surv.censored ?? '—'} · mediana de sobrevivência=\${surv.medianSurvival ?? 'não atingida'} · cancelados sem data excluídos da curva.</p>
          <div class="table-wrap"><table><thead><tr><th>Tempo (dias)</th><th class="num">Prob. permanência</th><th class="num">Em risco</th><th class="num">Eventos</th><th class="num">Censurados</th></tr></thead><tbody>\${
            curve.filter((_, i) => i % Math.max(1, Math.floor(curve.length / 16)) === 0 || i === curve.length - 1).map((pt) => \`<tr title="Tempo \${pt.time}d · P(permanência)=\${pt.survival != null ? (pt.survival * 100).toFixed(1) : '—'}%">
              <td>\${pt.time}</td>
              <td class="num">\${pt.survival != null ? (Math.round(pt.survival * 1000) / 10) + '%' : '—'}</td>
              <td class="num">\${pt.atRisk ?? '—'}</td>
              <td class="num">\${pt.events ?? '—'}</td>
              <td class="num">\${pt.censored ?? '—'}</td>
            </tr>\`).join('')
          }</tbody></table></div>\`);
      }
      const groups = (p.survival?.groups || []).slice(0, 5);
      const lr = p.survival?.logRank;
      setOrHtml('#scSurvivalGroupsHost', groups.length
        ? \`<h4 style="margin:8px 0;font-size:13px">Curvas estratificadas (até 5 grupos)</h4>
          <div class="table-wrap"><table><thead><tr><th>Campo</th><th>Grupo</th><th class="num">n</th><th class="num">Eventos</th><th class="num">Censurados</th><th class="num">Mediana</th></tr></thead><tbody>\${groups.map((g) => \`<tr>
            <td>\${escapeHtml(g.field || '—')}</td>
            <td>\${escapeHtml(String(g.level ?? '—'))}\${(g.n || 0) < 20 ? ' · amostra pequena' : ''}</td>
            <td class="num">\${g.n ?? '—'}</td>
            <td class="num">\${g.events ?? '—'}</td>
            <td class="num">\${g.censored ?? '—'}</td>
            <td class="num">\${g.medianSurvival ?? 'não atingida'}</td>
          </tr>\`).join('')}</tbody></table></div>
          \${lr ? \`<p class="note-muted">Log-rank (\${escapeHtml(lr.groupA || '')} vs \${escapeHtml(lr.groupB || '')}): χ²=\${lr.chi2 ?? '—'} · p=\${lr.pValue ?? '—'} · \${escapeHtml(lr.note || 'Comparação exploratória.')}</p>\` : ''}\`
        : '');

      const excluded = p.excludedVariables || [];
      setOrHtml('#scExcludedHost', excluded.length
        ? \`<div class="table-wrap"><table><thead><tr><th>Variável</th><th>Motivo</th><th>Detalhe</th></tr></thead><tbody>\${excluded.map((e) => \`<tr>
            <td>\${escapeHtml(e.label || e.id || '—')}</td>
            <td>\${escapeHtml(e.status || e.reasonCode || 'excluída')}</td>
            <td>\${escapeHtml(e.reason || e.note || '—')}</td>
          </tr>\`).join('')}</tbody></table></div>\`
        : '<p class="note-muted">Nenhuma variável excluída além das regras metodológicas padrão.</p>');

      const scAvailRows = p.metricAvailability || [];
      const scAvailHost = document.querySelector('#scMetricAvailabilityHost');
      if (scAvailHost) scAvailHost.innerHTML = scAvailRows.length && typeof metricAvailabilityTableHtml === 'function'
        ? metricAvailabilityTableHtml(scAvailRows)
        : \`<pre style="white-space:pre-wrap;font-size:12px">\${escapeHtml(JSON.stringify(p.metadata || {}, null, 2))}</pre>\`;

      if (typeof showSourceWarningsAlert === 'function') {
        showSourceWarningsAlert('#scSourceAlert', 'statistical-crosses-quality-warning', 'Qualidade dos cruzamentos', p.qualityWarnings || p.warnings || [], {
          note: 'Cancelamento efetivado pela regra consolidada do portal.'
        });
      }
      if (typeof restoreStaticPortalAlert === 'function') {
        restoreStaticPortalAlert('#scInterpretAlert', 'statistical-crosses-interpret');
      }
    }

    async function loadStatisticalCrosses() {
      if (!isPortalAuthenticated()) return;
      if (scState.loading) return;
      scState.loading = true;
      const requestId = ++scState.requestId;
      const endpoint = '/api/statistical-crosses';
      const refresh = document.querySelector('#scRefresh');
      const status = document.querySelector('#scStatus');
      if (refresh) { refresh.disabled = true; refresh.textContent = 'Atualizando…'; }
      if (status) { status.textContent = '● Atualizando dados'; status.style.color = 'var(--color-warning)'; }
      try {
        const params = new URLSearchParams({ t: String(Date.now()) });
        const put = (key, el, skipAll = true) => {
          if (!el?.value) return;
          if (skipAll && el.value === 'all') return;
          params.set(key, el.value);
        };
        put('status', scFilters.status, false);
        put('segment', scFilters.segment);
        put('engineer', scFilters.engineer);
        put('hasMeeting', scFilters.hasMeeting);
        put('hasNps', scFilters.hasNps);
        put('npsClass', scFilters.npsClass);
        put('renewed', scFilters.renewed);
        put('hasFinancial', scFilters.hasFinancial);
        put('hasMechanism', scFilters.hasMechanism);
        if (scFilters.minSample?.value) params.set('minSample', scFilters.minSample.value);
        if (scFilters.minCoverage?.value) params.set('minCoverage', scFilters.minCoverage.value);
        if (scFilters.hireFrom?.value) params.set('hireFrom', scFilters.hireFrom.value);
        if (scFilters.hireTo?.value) params.set('hireTo', scFilters.hireTo.value);
        if (scFilters.cancelFrom?.value) params.set('cancelFrom', scFilters.cancelFrom.value);
        if (scFilters.cancelTo?.value) params.set('cancelTo', scFilters.cancelTo.value);
        const response = await apiFetch(\`\${endpoint}?\${params}\`, { cache: 'no-store' });
        const responseText = await response.text();
        let payload = {};
        try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = {}; }
        if (requestId !== scState.requestId) return;
        if (!response.ok) {
          console.error('[Statistical Crosses API]', { endpoint, status: response.status, body: responseText.slice(0, 800) });
          throw Object.assign(new Error(friendlyApiError(response.status, payload)), { status: response.status, payload });
        }
        scState.payload = payload;
        fillScFilters();
        renderStatisticalCrosses();
        if (status) { status.textContent = '● Base conectada'; status.style.color = 'var(--color-success)'; }
        const updated = document.querySelector('#scUpdated');
        if (updated) updated.textContent = payload.generatedAt ? \`Atualizado em \${new Date(payload.generatedAt).toLocaleString('pt-BR')}\` : 'Dados carregados';
      } catch (error) {
        if (requestId !== scState.requestId) return;
        if (error?.code === 'AUTH_REQUIRED' || error?.message === 'AUTH_REQUIRED') return;
        console.error('[Statistical Crosses API]', error);
        if (status) { status.textContent = '● Falha na atualização'; status.style.color = 'var(--color-danger)'; }
        const updated = document.querySelector('#scUpdated');
        if (updated) updated.textContent = error.message || friendlyApiError(0, null, true);
      } finally {
        if (requestId === scState.requestId) {
          scState.loading = false;
          if (refresh) { refresh.disabled = false; refresh.textContent = 'Atualizar'; }
        }
      }
    }

    scFilters.minCoverage?.addEventListener('input', () => renderStatisticalCrosses());
    scFilters.minSample?.addEventListener('input', () => renderStatisticalCrosses());
    document.querySelector('#scClear')?.addEventListener('click', () => {
      Object.keys(scFilters).forEach((k) => {
        const el = scFilters[k];
        if (!el) return;
        if (k === 'status') el.value = 'active_cancelled';
        else if (k === 'minCoverage') el.value = '30';
        else if (k === 'minSample') el.value = '5';
        else if (el.type === 'date' || el.type === 'number') el.value = el.type === 'number' ? el.value : '';
        else el.value = 'all';
      });
      if (scFilters.hireFrom) scFilters.hireFrom.value = '';
      if (scFilters.hireTo) scFilters.hireTo.value = '';
      if (scFilters.cancelFrom) scFilters.cancelFrom.value = '';
      if (scFilters.cancelTo) scFilters.cancelTo.value = '';
      loadStatisticalCrosses();
    });
    document.querySelector('#scRefresh')?.addEventListener('click', loadStatisticalCrosses);
    ['status', 'segment', 'engineer', 'hasMeeting', 'hasNps', 'npsClass', 'renewed', 'hasFinancial', 'hasMechanism', 'hireFrom', 'hireTo', 'cancelFrom', 'cancelTo'].forEach((k) => {
      scFilters[k]?.addEventListener('change', () => loadStatisticalCrosses());
    });
`;

html = html.slice(0, start) + NEW + "\n\n" + html.slice(end);
fs.writeFileSync(path, html);
console.log("patched SC UI JS", NEW.length);
