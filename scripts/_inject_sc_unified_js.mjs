/**
 * Injeta renderers unificados (descobertas, matriz, coorte, KM chart, relatório) no index.html.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const path = resolve(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
let html = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const MARKER = "    function scPctDiff(a, b) {\n      if (a == null || b == null || !Number.isFinite(a) || !Number.isFinite(b) || a === 0) return null;\n      return ((b - a) / Math.abs(a)) * 100;\n    }";

if (!html.includes(MARKER)) throw new Error("scPctDiff marker missing");
if (html.includes("function scRenderDiscoveries(")) {
  console.log("JS already injected");
  process.exit(0);
}

const JS = `
    const SC_MATRIX_RECOMMENDED = ['stayDays','meetingCount','daysSinceLastMeeting','noShowCount','npsScore','monthlyIncome','liquidityReserve','mechanismCount','currentCycle','renewalCount'];
    scState.showAllDiscoveries = false;
    scState.matrixVarIds = [...SC_MATRIX_RECOMMENDED];

    function scHeatColor(v, mode) {
      if (v == null || !Number.isFinite(Number(v))) return 'rgba(80,80,80,.55)';
      const x = Math.max(-1, Math.min(1, Number(v)));
      if (mode === 'retention') {
        const t = Math.max(0, Math.min(1, x));
        const r = Math.round(220 - t * 160);
        const g = Math.round(80 + t * 120);
        const b = Math.round(60 + t * 40);
        return \`rgb(\${r},\${g},\${b})\`;
      }
      if (x >= 0) {
        const t = x;
        return \`rgba(244,121,32,\${0.15 + t * 0.75})\`;
      }
      const t = -x;
      return \`rgba(59,130,246,\${0.15 + t * 0.75})\`;
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
      host.innerHTML = rows.map((d) => \`<article class="sc-discovery-card"><strong>\${escapeHtml(d.title || d.id || 'Descoberta')}</strong><p>\${escapeHtml(d.text || '')}</p></article>\`).join('');
    }

    function scRenderMatrixVars(p) {
      const vars = p.correlationMatrix?.variables || [];
      const host = document.querySelector('#scMatrixVarsHost');
      if (!host) return;
      if (!vars.length) { host.innerHTML = ''; return; }
      const selected = new Set(scState.matrixVarIds || []);
      host.innerHTML = vars.map((v) => {
        const id = v.id;
        const checked = selected.has(id) || (!scState.matrixVarIds?.length && SC_MATRIX_RECOMMENDED.includes(id));
        return \`<label><input type="checkbox" data-sc-matrix-var="\${escapeHtml(id)}" \${checked ? 'checked' : ''}/> \${escapeHtml(v.label || id)}</label>\`;
      }).join('');
      host.querySelectorAll('input[data-sc-matrix-var]').forEach((inp) => {
        inp.addEventListener('change', () => {
          scState.matrixVarIds = [...host.querySelectorAll('input[data-sc-matrix-var]:checked')].map((el) => el.dataset.scMatrixVar).slice(0, 15);
          loadStatisticalCrosses();
        });
      });
    }

    function scOpenMatrixCell(cell) {
      const drawer = document.querySelector('#scMatrixDrawer');
      const body = document.querySelector('#scMatrixDrawerBody');
      if (!drawer || !body || !cell) return;
      const val = cell.value != null ? Number(cell.value).toFixed(3).replace('.', ',') : '—';
      body.innerHTML = \`
        <h3 style="margin-top:0">\${escapeHtml(cell.labelA || cell.idA)} × \${escapeHtml(cell.labelB || cell.idB)}</h3>
        <p><strong>Correlação:</strong> \${val} (\${escapeHtml(cell.method || '—')})</p>
        <p><strong>Força:</strong> \${escapeHtml(cell.strength || '—')} · <strong>Direção:</strong> \${escapeHtml(cell.direction || '—')}</p>
        <p><strong>Amostra:</strong> \${cell.n ?? '—'} · <strong>Cobertura:</strong> \${cell.coveragePercent != null ? epFmtPct(cell.coveragePercent) : '—'}</p>
        <p class="note-muted">Associação observada entre as duas variáveis na população filtrada. Não implica causalidade. Pares incompletos foram excluídos do cálculo.</p>
        \${cell.status && cell.status !== 'available' ? \`<p class="note-muted">Status: \${escapeHtml(scStatusLabel(cell.status, cell.reason) || cell.status)}</p>\` : ''}
      \`;
      drawer.hidden = false;
    }

    function scRenderCorrelationMatrix(p) {
      const m = p.correlationMatrix;
      const host = document.querySelector('#scMatrixHost');
      if (!host) return;
      if (!m?.variables?.length) {
        host.innerHTML = '<div class="empty" style="display:block">Matriz indisponível neste recorte.</div>';
        return;
      }
      const vars = m.variables;
      const byKey = new Map((m.cells || []).map((c) => [\`\${c.idA}||\${c.idB}\`, c]));
      const head = \`<tr><th class="sc-matrix-corner"></th>\${vars.map((v) => \`<th title="\${escapeHtml(v.label)}">\${escapeHtml((v.shortLabel || v.label || v.id).slice(0, 10))}</th>\`).join('')}</tr>\`;
      const body = vars.map((row) => {
        const cells = vars.map((col) => {
          const cell = byKey.get(\`\${row.id}||\${col.id}\`) || byKey.get(\`\${col.id}||\${row.id}\`);
          const v = cell?.value;
          const txt = v == null ? '—' : Number(v).toFixed(2).replace('.', ',');
          const tip = cell
            ? \`\${cell.labelA} × \${cell.labelB}: \${txt} · n=\${cell.n ?? '—'} · cobertura=\${cell.coveragePercent ?? '—'}% · \${cell.method || ''}\`
            : '';
          return \`<td style="background:\${scHeatColor(v)}" title="\${escapeHtml(tip)}" data-ida="\${escapeHtml(row.id)}" data-idb="\${escapeHtml(col.id)}">\${txt}</td>\`;
        }).join('');
        return \`<tr><th class="sc-matrix-rowhead" title="\${escapeHtml(row.label)}">\${escapeHtml(row.label || row.id)}</th>\${cells}</tr>\`;
      }).join('');
      host.innerHTML = \`<table class="sc-matrix-table"><thead>\${head}</thead><tbody>\${body}</tbody></table>\`;
      host.querySelectorAll('td[data-ida]').forEach((td) => {
        td.addEventListener('click', () => {
          const cell = byKey.get(\`\${td.dataset.ida}||\${td.dataset.idb}\`) || byKey.get(\`\${td.dataset.idb}||\${td.dataset.ida}\`);
          scOpenMatrixCell(cell);
        });
      });
    }

    function scRenderSurvivalChart(p) {
      const curve = p.survival?.overall?.curve || [];
      const host = document.querySelector('#scSurvivalChart');
      const narr = document.querySelector('#scSurvivalNarration');
      const surv = p.survival?.overall || {};
      if (narr) {
        if (surv.medianSurvival != null) {
          narr.textContent = \`A mediana de sobrevivência estimada é \${surv.medianSurvival} dias. Clientes não cancelados até a data atual são tratados como censurados.\`;
        } else if (curve.length) {
          const last = curve[curve.length - 1];
          const pct = last?.survival != null ? (last.survival * 100).toFixed(1).replace('.', ',') : '—';
          narr.textContent = \`A probabilidade de permanência não caiu abaixo de 50% no período observado (última estimativa: \${pct}% em \${last?.time ?? '—'} dias). Clientes não cancelados até a data atual são tratados como censurados.\`;
        } else {
          narr.textContent = '';
        }
      }
      if (!host) return;
      if (!curve.length) {
        host.innerHTML = '<div class="empty" style="display:block">Curva indisponível.</div>';
        return;
      }
      const w = 720, h = 220, pad = 36;
      const maxT = Math.max(...curve.map((c) => Number(c.time) || 0), 1);
      const pts = curve.map((c) => {
        const x = pad + (Number(c.time) / maxT) * (w - pad * 2);
        const y = pad + (1 - (Number(c.survival) || 0)) * (h - pad * 2);
        return \`\${x},\${y}\`;
      }).join(' ');
      // step path
      let d = '';
      curve.forEach((c, i) => {
        const x = pad + (Number(c.time) / maxT) * (w - pad * 2);
        const y = pad + (1 - (Number(c.survival) || 0)) * (h - pad * 2);
        if (i === 0) d += \`M \${x} \${y}\`;
        else {
          const prev = curve[i - 1];
          const px = pad + (Number(prev.time) / maxT) * (w - pad * 2);
          const py = pad + (1 - (Number(prev.survival) || 0)) * (h - pad * 2);
          d += \` L \${x} \${py} L \${x} \${y}\`;
        }
      });
      host.innerHTML = \`<svg viewBox="0 0 \${w} \${h}" role="img" aria-label="Curva de sobrevivência Kaplan-Meier">
        <line x1="\${pad}" y1="\${h-pad}" x2="\${w-pad}" y2="\${h-pad}" stroke="#555"/>
        <line x1="\${pad}" y1="\${pad}" x2="\${pad}" y2="\${h-pad}" stroke="#555"/>
        <path d="\${d}" fill="none" stroke="#f47920" stroke-width="2.5"/>
        <text x="\${pad}" y="16" fill="#aaa" font-size="11">P(permanência)</text>
        <text x="\${w-pad}" y="\${h-8}" fill="#aaa" font-size="11" text-anchor="end">dias</text>
        <text x="\${pad}" y="\${h-8}" fill="#888" font-size="10">0</text>
        <text x="\${w-pad}" y="\${h-8}" fill="#888" font-size="10" text-anchor="end">\${maxT}</text>
      </svg>\`;
    }

    function scRenderCohort(p) {
      const cohort = p.cohort;
      const host = document.querySelector('#scCohortHost');
      const note = document.querySelector('#scCohortNote');
      if (!host) return;
      if (!cohort?.cohorts?.length || !cohort?.ages?.length) {
        host.innerHTML = '<div class="empty" style="display:block">Coorte indisponível neste recorte.</div>';
        if (note) note.textContent = '';
        return;
      }
      const cellMap = new Map((cohort.cells || []).map((c) => [\`\${c.cohortKey}||\${c.age}\`, c]));
      const avgMap = new Map((cohort.averages || []).map((a) => [a.age, a]));
      const ages = cohort.ages;
      const head = \`<tr><th class="sc-cohort-rowhead">Idade</th>\${cohort.cohorts.map((c) => \`<th title="n=\${c.nStart}">\${escapeHtml(c.label || c.key)}</th>\`).join('')}<th>Média</th><th>Variação mensal</th></tr>\`;
      const body = ages.map((age) => {
        const cells = cohort.cohorts.map((c) => {
          const cell = cellMap.get(\`\${c.key}||\${age}\`);
          if (!cell || cell.observable === false || cell.retainedPct == null) {
            return '<td style="background:rgba(80,80,80,.35)" title="Não observável">—</td>';
          }
          const pct = Number(cell.retainedPct);
          const tip = \`\${c.label}: idade \${age} · retenção \${pct.toFixed(1)}% · restantes \${cell.retainedN ?? '—'} · cancel. acum. \${cell.cancelledCum ?? '—'}\`;
          return \`<td style="background:\${scHeatColor(pct / 100, 'retention')}" title="\${escapeHtml(tip)}">\${pct.toFixed(0)}%</td>\`;
        }).join('');
        const avg = avgMap.get(age);
        const avgTxt = avg?.meanRetentionPct != null ? \`\${Number(avg.meanRetentionPct).toFixed(1)}%\` : '—';
        const delta = avg?.deltaPp;
        const deltaTxt = delta == null ? '—' : \`\${delta > 0 ? '+' : ''}\${Number(delta).toFixed(1)} p.p.\`;
        return \`<tr><td class="sc-cohort-rowhead">Mês \${age}</td>\${cells}<td>\${avgTxt}</td><td>\${deltaTxt}</td></tr>\`;
      }).join('');
      host.innerHTML = \`<table class="sc-cohort-table"><thead>\${head}</thead><tbody>\${body}</tbody></table>\`;
      if (note) {
        const a3 = avgMap.get(3)?.meanRetentionPct;
        const a6 = avgMap.get(6)?.meanRetentionPct;
        const a12 = avgMap.get(12)?.meanRetentionPct;
        note.textContent = \`Coortes: \${cohort.cohorts.length} · Retenção média aos 3/6/12 meses: \${a3 != null ? Number(a3).toFixed(1) + '%' : '—'} / \${a6 != null ? Number(a6).toFixed(1) + '%' : '—'} / \${a12 != null ? Number(a12).toFixed(1) + '%' : '—'}. Variação mensal não é impacto causal.\`;
      }
    }

    function scRenderRiskRules(p) {
      if (typeof exBuildRiskRules !== 'function') return;
      const rules = exBuildRiskRules(p.clients || []);
      setOrHtml('#scRiskRuleRows', rules.map((rule) => \`<tr><td><strong>\${escapeHtml(rule.label)}</strong></td><td class="num">\${fmt.format(rule.clients)}</td><td class="num">\${fmt.format(rule.cancelled)}</td><td class="num">\${Number(rule.ratePct).toFixed(1).replace('.', ',')}%</td><td class="num"><strong>\${scNum(rule.lift, 2)}x</strong></td><td class="exploration-note">\${escapeHtml(rule.caveat || 'Associação descritiva.')}</td></tr>\`).join(''));
      const empty = document.querySelector('#scRiskRulesEmpty');
      if (empty) empty.style.display = rules.length ? 'none' : 'block';
    }

    function scExportReport() {
      const p = scState.payload;
      if (!p) { alert('Carregue as análises antes de exportar.'); return; }
      const s = p.summary || {};
      const filters = p.filters || p.metadata?.filtersApplied || {};
      const discoveries = (p.discoveries || []).map((d) => \`<li><strong>\${escapeHtml(d.title || '')}</strong> — \${escapeHtml(d.text || '')}</li>\`).join('');
      const limitations = (p.report?.limitations || [
        'Associação não implica causalidade.',
        'Amostras pequenas e cobertura baixa afetam a estabilidade.',
        'Renovação usa ciclo atual > 1.',
        'NPS usa a resposta válida mais recente.',
        'Clientes não cancelados são censurados na sobrevivência.'
      ]).map((l) => \`<li>\${escapeHtml(typeof l === 'string' ? l : (l.text || l.message || JSON.stringify(l)))}</li>\`).join('');
      const narratives = (p.report?.generatedNarratives || p.discoveries || []).slice(0, 12).map((n) => \`<p>\${escapeHtml(n.text || n.title || '')}</p>\`).join('');
      const day = (s.cutoffDate || new Date().toISOString().slice(0, 10));
      const w = window.open('', '_blank');
      if (!w) { alert('Permita pop-ups para exportar o relatório.'); return; }
      w.document.write(\`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"/><title>Relatório Análises Estatísticas</title>
        <style>body{font-family:Segoe UI,Arial,sans-serif;color:#111;max-width:900px;margin:24px auto;padding:0 16px;line-height:1.45}h1,h2{page-break-after:avoid}section{page-break-inside:avoid;margin:18px 0}.muted{color:#555;font-size:13px}table{border-collapse:collapse;width:100%;font-size:12px}th,td{border:1px solid #ddd;padding:6px;text-align:left}@media print{.no-print{display:none}}</style></head><body>
        <button class="no-print" onclick="window.print()">Imprimir / salvar PDF</button>
        <h1>Relatório — Análises Estatísticas</h1>
        <p class="muted">Gerado em \${new Date().toLocaleString('pt-BR')} · Fonte: BASE QV · Timezone: America/Sao_Paulo</p>
        <section><h2>Período observado</h2><p>\${escapeHtml(s.observationPeriod?.from || '—')} → \${escapeHtml(s.observationPeriod?.to || s.cutoffDate || '—')}</p></section>
        <section><h2>Filtros aplicados</h2><pre class="muted">\${escapeHtml(JSON.stringify(filters, null, 2))}</pre></section>
        <section><h2>Resumo da população</h2>
          <ul>
            <li>Clientes analisados: \${s.analyzedClients ?? '—'}</li>
            <li>Ativos: \${s.activeClients ?? '—'}</li>
            <li>Cancelamentos efetivados: \${s.confirmedCancellations ?? '—'}</li>
            <li>Renovados: \${s.renewedClients ?? '—'}</li>
            <li>NPS válidas: \${s.validNpsResponses ?? '—'}</li>
            <li>Cobertura média: \${s.averageCoverage ?? '—'}%</li>
          </ul>
        </section>
        <section><h2>Principais descobertas</h2><ol>\${discoveries || '<li>Sem descobertas publicáveis.</li>'}</ol></section>
        <section><h2>Narrativas automáticas</h2>\${narratives || '<p class="muted">Sem narrativas adicionais.</p>'}</section>
        <section><h2>Sobrevivência</h2><p>n início=\${p.survival?.overall?.nStart ?? '—'} · eventos=\${p.survival?.overall?.events ?? '—'} · censurados=\${p.survival?.overall?.censored ?? '—'} · mediana=\${p.survival?.overall?.medianSurvival ?? 'não atingida'}</p></section>
        <section><h2>Coorte</h2><p>\${(p.cohort?.cohorts || []).length} coortes · granularidade \${escapeHtml(p.cohort?.granularity || 'month')}</p></section>
        <section><h2>Limitações</h2><ul>\${limitations}</ul></section>
        <section><h2>Metodologia resumida</h2><ul>
          <li>Cancelamento: regra consolidada do portal.</li>
          <li>Renovação: currentCycle &gt; 1.</li>
          <li>NPS: última resposta válida 0–10 por cliente.</li>
          <li>Matriz: Spearman (padrão) ou Pearson.</li>
          <li>Sobrevivência: Kaplan–Meier com censura na data atual.</li>
        </ul></section>
        <section><h2>Glossário</h2><ul>
          <li>Correlação: direção e força da relação.</li>
          <li>Mediana: valor central do grupo.</li>
          <li>Cobertura: percentual com informação válida.</li>
          <li>AUC: capacidade individual de separar grupos.</li>
          <li>Sobrevivência: probabilidade estimada de permanência.</li>
          <li>Coorte: retenção de grupos contratados no mesmo período.</li>
        </ul></section>
        <p class="muted">Arquivo sugerido: relatorio-analises-estatisticas-\${day}.pdf</p>
        </body></html>\`);
      w.document.close();
      setTimeout(() => { try { w.print(); } catch (_) {} }, 400);
    }
`;

html = html.replace(MARKER, MARKER + "\n" + JS);

// Hook into end of renderStatisticalCrosses — before closing of function after restoreStaticPortalAlert
const hook = `      if (typeof restoreStaticPortalAlert === 'function') {
        restoreStaticPortalAlert('#scInterpretAlert', 'statistical-crosses-interpret');
      }
    }`;

const hookNew = `      if (typeof restoreStaticPortalAlert === 'function') {
        restoreStaticPortalAlert('#scInterpretAlert', 'statistical-crosses-interpret');
      }
      scRenderDiscoveries(p);
      scRenderMatrixVars(p);
      scRenderCorrelationMatrix(p);
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
    }`;

if (!html.includes(hook)) throw new Error("render hook missing");
if (!html.includes("scRenderDiscoveries(p)")) {
  html = html.replace(hook, hookNew);
}

// Extend loadStatisticalCrosses params
const paramsChunk = `        if (scFilters.cancelTo?.value) params.set('cancelTo', scFilters.cancelTo.value);
        const response = await apiFetch(\`\${endpoint}?\${params}\`, {`;

const paramsNew = `        if (scFilters.cancelTo?.value) params.set('cancelTo', scFilters.cancelTo.value);
        const corrMethod = document.querySelector('#scCorrMethod')?.value || 'spearman';
        const cohortGran = document.querySelector('#scCohortGranularity')?.value || 'month';
        params.set('correlationMethod', corrMethod);
        params.set('cohortGranularity', cohortGran);
        if (scState.matrixVarIds?.length) params.set('matrixVars', scState.matrixVarIds.join(','));
        const response = await apiFetch(\`\${endpoint}?\${params}\`, {`;

if (html.includes(paramsChunk) && !html.includes("params.set('correlationMethod'")) {
  html = html.replace(paramsChunk, paramsNew);
}

// Event listeners after scRefresh
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
    });`;

if (html.includes(listenMarker) && !html.includes("scExportReport")) {
  html = html.replace(listenMarker, listenNew);
}

// Redirect exploration loader to SC
html = html.replace(
  /if \(btn\.dataset\.nav === 'exploration' && !explorationState\.payload\) loadExploration\(\);/,
  `if (btn.dataset.nav === 'exploration') { document.querySelector('[data-nav=\"statistical-crosses\"]')?.click(); return; }`,
);

writeFileSync(path, html);
console.log("Injected unified JS OK");
