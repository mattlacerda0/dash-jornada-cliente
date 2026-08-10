import fs from "fs";

const path = new URL("../index.html", import.meta.url);
let s = fs.readFileSync(path, "utf8");
const n0 = s.length;
let changes = 0;
function rep(a, b, label) {
  if (!s.includes(a)) {
    console.warn("MISS:", label);
    return;
  }
  s = s.split(a).join(b);
  changes += 1;
  console.log("OK:", label);
}

rep(
  `<button type="button" class="btn-export" aria-haspopup="true" aria-expanded="false">Exportar ▾</button>
            <div class="export-menu" hidden>
              <button type="button" data-format="csv">Exportar CSV</button>
              <button type="button" data-format="xlsx">Exportar Excel (.xlsx)</button>`,
  `<button type="button" class="btn-export" aria-haspopup="true" aria-expanded="false">Exportar</button>
            <div class="export-menu" hidden>
              <button type="button" data-format="xlsx">Excel</button>
              <button type="button" data-format="csv">CSV</button>`,
  "export-menu-labels",
);

rep(
  `function mountMissingTableExports(root = document) {
      root.querySelectorAll?.('table:not([data-export-covered])').forEach((table) => {
        const panel = table.closest('.table-panel,.chart-card,.indicator-matrix');
        const existingHost = panel?.querySelector('.export-host');
        if (existingHost) {
          table.dataset.exportCovered = '1';
          return;
        }`,
  `function mountMissingTableExports(root = document) {
      root.querySelectorAll?.('table:not([data-export-covered])').forEach((table) => {
        if (table.closest('#view-statistical-crosses')) {
          table.dataset.exportCovered = '1';
          return;
        }
        const panel = table.closest('.table-panel,.chart-card,.indicator-matrix');
        const existingHost = panel?.querySelector('.export-host') || table.closest('.view')?.querySelector('.export-host');
        if (existingHost) {
          table.dataset.exportCovered = '1';
          return;
        }`,
  "skip-sc-auto-export",
);

rep(
  "Cada coluna reúne clientes que começaram no mesmo mês (a partir de jan/2026). Linhas = retenção após 1, 2, 3… meses. Cancelados sem data válida ficam fora. Meses futuros ficam vazios.",
  "Esta análise acompanha grupos de clientes contratados a partir de janeiro de 2025. Cada coluna representa um mês de contratação e cada linha mostra o percentual da coorte que continuou sem cancelamento ao longo dos meses seguintes. Cancelados sem data válida ficam fora. Meses futuros ficam vazios (—).",
  "cohort-section-note",
);

rep(
  "Os dados vêm da data de contratação do cliente e da primeira data válida de cancelamento efetivado, seguindo a prioridade: churn efetivado, distrato assinado e data de churn do cliente.",
  "A data de cancelamento utiliza, nessa ordem, churn efetivado, distrato assinado e data de churn do cliente.",
  "cohort-howto-cancel-date",
);

rep(
  "Permanência em dias: cancelados com data = cancelamento − contratação; demais = hoje − contratação (America/Sao_Paulo). Spearman.",
  "Permanência analítica em dias: cancelados com data = cancelamento − contratação; demais = hoje − contratação (America/Sao_Paulo). Clientes com ciclo ≥ 2 e permanência base &lt; 365 dias recebem +365 no indicador. Spearman.",
  "tenure-section-note",
);

rep(
  "Cancelados com data válida: permanência = data de cancelamento − contratação. Demais: hoje (America/Sao_Paulo) − contratação. Exclui contratação futura, permanência negativa e cancelados sem data. Spearman. Correlações |ρ| ≥ 0,95 são auditadas (possível variável derivada).",
  "Cancelados com data válida: permanência base = data de cancelamento − contratação. Demais: hoje (America/Sao_Paulo) − contratação. Se ciclo ≥ 2 e base &lt; 365, o indicador analítico soma +365 uma única vez. Exclui contratação futura, permanência negativa e cancelados sem data. A curva de sobrevivência e o cohort usam duração cronológica real (sem +365). Spearman. Correlações |ρ| ≥ 0,95 são auditadas (possível variável derivada).",
  "tenure-methodology",
);

if (!s.includes("Para clientes com dois ou mais ciclos cuja permanência calculada seja inferior a 365 dias")) {
  rep(
    "para('Métodos: correlação de Spearman",
    "para('Para clientes com dois ou mais ciclos cuja permanência calculada seja inferior a 365 dias, o indicador analítico de permanência adiciona 365 dias ao valor calculado. Essa regra é aplicada aos indicadores de permanência, mas não modifica datas reais utilizadas em análises temporais como sobrevivência e cohort.');\n        para('Métodos: correlação de Spearman",
    "pdf-tenure-method",
  );
}

if (!s.includes("function scSvgWrapLines")) {
  rep(
    "function scRenderAxisHeatmap(matrix, hostId, legendId, narrId, tableId) {",
    `function scSvgWrapLines(text, maxChars, maxLines) {
      const words = String(text || '').split(/\\s+/).filter(Boolean);
      const lines = [];
      let cur = '';
      for (const w of words) {
        const next = cur ? (cur + ' ' + w) : w;
        if (next.length > maxChars && cur) {
          lines.push(cur);
          cur = w;
          if (lines.length >= maxLines) break;
        } else cur = next;
      }
      if (lines.length < maxLines && cur) lines.push(cur);
      return lines.length ? lines : [String(text || '')];
    }
    function scSvgMultilineLabel(lines, x, y, opts) {
      const anchor = opts?.anchor || 'end';
      const fill = opts?.fill || '#ccc';
      const fontSize = opts?.fontSize || 10;
      const lh = opts?.lineHeight || (fontSize + 2);
      const startY = y - ((lines.length - 1) * lh) / 2;
      return lines.map((ln, i) => '<text x="' + x + '" y="' + (startY + i * lh) + '" text-anchor="' + anchor + '" font-size="' + fontSize + '" fill="' + fill + '"><title>' + escapeHtml(lines.join(' ')) + '</title>' + escapeHtml(ln) + '</text>').join('');
    }
    function scRenderAxisHeatmap(matrix, hostId, legendId, narrId, tableId) {`,
    "label-helpers",
  );
}

rep(
  "const cellW = 88, cellH = 36, labelW = 170, labelH = 70;",
  "const cellW = 92, cellH = 44, labelW = 250, labelH = 86;",
  "axis-heatmap-dims",
);

rep(
  `const rowLabs = rows.map((r, i) => '<text x="' + (labelW - 8) + '" y="' + (labelH + i * cellH + cellH / 2 + 4) + '" text-anchor="end" font-size="11" fill="#ccc">' + escapeHtml((r.label || r.id).slice(0, 26)) + '</text>').join('');`,
  `const rowLabs = rows.map((r, i) => scSvgMultilineLabel(scSvgWrapLines(r.label || r.id, 28, 3), labelW - 8, labelH + i * cellH + cellH / 2 + 3, { fontSize: 10, fill: '#ccc' })).join('');`,
  "axis-heatmap-rowlabs",
);

rep(
  "const w = 760, rowH = 28, padL = 200, padR = 70, padT = 12, padB = 12;",
  "const w = 820, rowH = 34, padL = 260, padR = 70, padT = 12, padB = 12;",
  "rank-bars-dims",
);

rep(
  `return '<text x="' + (padL - 8) + '" y="' + (y + 14) + '" text-anchor="end" font-size="11" fill="#ccc">' + escapeHtml((r.label || r.id || '').slice(0, 28)) + '</text>' +`,
  `return scSvgMultilineLabel(scSvgWrapLines(r.label || r.id || '', 32, 2), padL - 8, y + 14, { fontSize: 10, fill: '#ccc' }) +`,
  "rank-bars-labels",
);

rep(
  `const cellW = 56, cellH = 36, labelW = 160, labelH = 96;
      const w = labelW + m.groups.length * cellW + 8;
      const h = labelH + m.variables.length * cellH + 8;
      const byKey = new Map((m.cells || []).map((c) => [c.varId + '||' + c.groupId, c]));
      const colorOf = (std) => {
        if (std == null || !Number.isFinite(Number(std))) return { fill: '#3a3a3a' };
        const v = Math.max(-1.2, Math.min(1.2, Number(std)));
        const t = (v + 1.2) / 2.4; // 0..1`,
  `const cellW = 64, cellH = 44, labelW = 240, labelH = 110;
      const w = labelW + m.groups.length * cellW + 8;
      const h = labelH + m.variables.length * cellH + 8;
      const byKey = new Map((m.cells || []).map((c) => [c.varId + '||' + c.groupId, c]));
      const colorOf = (std) => {
        if (std == null || !Number.isFinite(Number(std))) return { fill: '#3a3a3a' };
        const v = Math.max(-1.2, Math.min(1.2, Number(std)));
        const t = (v + 1.2) / 2.4; // 0..1`,
  "group-matrix-dims",
);

rep(
  `const rowLabs = m.variables.map((v, i) => '<text x="' + (labelW - 6) + '" y="' + (labelH + i * cellH + cellH / 2 + 3) + '" text-anchor="end" font-size="10" fill="#ccc">' + escapeHtml(v.label) + '</text>').join('');
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="Matriz comparativa de grupos">`,
  `const rowLabs = m.variables.map((v, i) => scSvgMultilineLabel(scSvgWrapLines(v.label, 28, 3), labelW - 6, labelH + i * cellH + cellH / 2 + 3, { fontSize: 10, fill: '#ccc' })).join('');
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="Matriz comparativa de grupos">`,
  "group-matrix-rowlabs",
);

rep(
  `const cellSize = Math.max(48, Math.min(56, Math.floor(560 / Math.max(n, 1))));
      const labelW = 120;
      const labelH = 110;`,
  `const cellSize = Math.max(48, Math.min(56, Math.floor(560 / Math.max(n, 1))));
      const labelW = 210;
      const labelH = 150;`,
  "corr-matrix-dims",
);

rep(
  `return '<text transform="translate(' + x + ',' + y + ') rotate(-55)" text-anchor="start" font-size="10" fill="#bbb">' + escapeHtml((v.label || v.id).slice(0, 18)) + '</text>';`,
  `return '<text transform="translate(' + x + ',' + y + ') rotate(-55)" text-anchor="start" font-size="9" fill="#bbb"><title>' + escapeHtml(v.label || v.id) + '</title>' + escapeHtml(v.label || v.id) + '</text>';`,
  "corr-matrix-collabs",
);

rep(
  `return '<text x="' + (labelW - 8) + '" y="' + y + '" text-anchor="end" font-size="10" fill="#bbb">' + escapeHtml((v.label || v.id).slice(0, 16)) + '</text>';`,
  `return scSvgMultilineLabel(scSvgWrapLines(v.label || v.id, 22, 3), labelW - 8, y, { fontSize: 9, fill: '#bbb' });`,
  "corr-matrix-rowlabs",
);

rep(
  `const rowLabs = m.variables.map((v, i) => '<text x="' + (labelW - 6) + '" y="' + (labelH + i * cellH + cellH / 2 + 3) + '" text-anchor="end" font-size="10" fill="#ccc">' + escapeHtml(v.label) + '</text>').join('');
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + Math.min(w, 960) + '" height="' + Math.min(h, 640) + '">`,
  `const rowLabs = m.variables.map((v, i) => scSvgMultilineLabel(scSvgWrapLines(v.label, 28, 3), labelW - 6, labelH + i * cellH + cellH / 2 + 3, { fontSize: 10, fill: '#ccc' })).join('');
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + Math.min(w, 960) + '" height="' + Math.min(h, 640) + '">`,
  "nps-comp-rowlabs",
);

rep(
  `clone.style.minHeight = 'min(68vh, 720px)';
      clone.style.width = '100%';
      body.appendChild(clone);`,
  `clone.style.minHeight = 'min(68vh, 720px)';
      clone.style.width = '100%';
      clone.dataset.scFsClone = '1';
      const fsSvg = clone.querySelector('svg');
      if (fsSvg) {
        const vb = (fsSvg.getAttribute('viewBox') || '').split(/\\s+/).map(Number);
        if (vb.length === 4 && Number.isFinite(vb[2])) {
          fsSvg.setAttribute('width', Math.min(vb[2] * 1.2, Math.max(960, body.clientWidth - 48)));
          fsSvg.style.maxWidth = '100%';
        }
      }
      body.appendChild(clone);`,
  "fs-enlarge-svg",
);

rep(
  "const cohortPeriod = document.querySelector('#scCohortPeriod')?.value || 'since_2026_01';",
  "const cohortPeriod = document.querySelector('#scCohortPeriod')?.value || 'since_2025_01';",
  "cohort-default-filter",
);

rep(
  `scSetCoverage(cohortSample, {
          valid: nClients,
          eligible: nClients + excluded,
          coverage: nClients + excluded > 0 ? (nClients / (nClients + excluded)) * 100 : null,
          missing: excluded,
          extra: (cohort.hireFrom ? ('desde ' + cohort.hireFrom + ' · ') : '') +
            'cancelados sem data: ' + fmt.format(meta.skippedCancelledNoDate || 0) +
            ' · duplicatas: ' + fmt.format(meta.skippedDuplicate || 0) +
            ' · cancel. antes da contratação: ' + fmt.format(meta.skippedCancelBeforeHire || 0)
        });`,
  `const covPct = nClients + excluded > 0 ? ((nClients / (nClients + excluded)) * 100) : null;
        cohortSample.innerHTML = '<span class="sc-cov-tip" title="A cobertura mostra quantos clientes possuem datas válidas suficientes para entrar nesta análise.">Clientes elegíveis para cohort: <strong>' +
          fmt.format(nClients) + '</strong> · Clientes excluídos por ausência/inconsistência de datas: <strong>' +
          fmt.format(excluded) + '</strong> · Cobertura: <strong>' +
          (covPct == null ? '—' : covPct.toFixed(1).replace('.', ',') + '%') + '</strong></span>' +
          '<span class="note-muted"> · ' + (cohort.hireFrom ? ('desde ' + cohort.hireFrom + ' · ') : '') +
          'cancelados sem data: ' + fmt.format(meta.skippedCancelledNoDate || 0) +
          ' · duplicatas: ' + fmt.format(meta.skippedDuplicate || 0) +
          ' · cancel. antes da contratação: ' + fmt.format(meta.skippedCancelBeforeHire || 0) + '</span>';`,
  "cohort-coverage-copy",
);

// Add missing SC export hosts near key tables (predict, group, cancel matrix, survival)
rep(
  `<div class="section-head" id="scSecGroups"><div><h2>7. Matriz comparativa dos grupos</h2>
            <p class="sc-section-note" style="margin:0">Cada cor compara o grupo com a referência geral da população filtrada. Laranja representa valores acima da referência, azul abaixo e cinza valores semelhantes.</p></div></div>`,
  `<div class="section-head" id="scSecGroups"><div><h2>7. Matriz comparativa dos grupos</h2>
            <p class="sc-section-note" style="margin:0">Cada cor compara o grupo com a referência geral da população filtrada. Laranja representa valores acima da referência, azul abaixo e cinza valores semelhantes.</p></div>
            <span class="export-host" id="scGroupExportHost"></span></div>`,
  "group-export-host",
);

rep(
  `<div class="section-head" id="scSecPredict"><div><h2>8. Ranking preditivo de cancelamento</h2>
            <p class="sc-section-note" style="margin:0">Mostra quais variáveis mais contribuíram para separar cancelados e não cancelados no modelo de validação. Importância ≠ causalidade.</p></div></div>`,
  `<div class="section-head" id="scSecPredict"><div><h2>8. Ranking preditivo de cancelamento</h2>
            <p class="sc-section-note" style="margin:0">Mostra quais variáveis mais contribuíram para separar cancelados e não cancelados no modelo de validação. Importância ≠ causalidade.</p></div>
            <span class="export-host" id="scPredictExportHost"></span></div>`,
  "predict-export-host",
);

rep(
  `<div class="section-head" id="scSecSurvival"><div><h2>10. Curva de sobrevivência</h2>
            <p class="sc-section-note" style="margin:0">Estima a chance de o cliente continuar na carteira ao longo do tempo. Cancelamento com data = saída; clientes ainda ativos no fim do período continuam na análise sem serem tratados como cancelados.</p></div></div>`,
  `<div class="section-head" id="scSecSurvival"><div><h2>10. Curva de sobrevivência</h2>
            <p class="sc-section-note" style="margin:0">Estima a chance de o cliente continuar na carteira ao longo do tempo. Cancelamento com data = saída; clientes ainda ativos no fim do período continuam na análise sem serem tratados como cancelados.</p></div>
            <span class="export-host" id="scSurvivalExportHost"></span></div>`,
  "survival-export-host",
);

rep(
  `['#scDiffExportHost', getScDiffExportPayload],
        ['#scAucExportHost', getScAucExportPayload],
        ['#scNpsCorrExportHost', getScNpsGroupsExportPayload],
        ['#scNpsGroupsExportHost', getScNpsGroupsExportPayload],
        ['#scRenewalDiffExportHost', getScRenewalDiffExportPayload],
        ['#scRulesExportHost', getExplorationRulesExportPayload],
        ['#scCohortExportHost', getScCohortExportPayload],`,
  `['#scDiffExportHost', getScDiffExportPayload],
        ['#scAucExportHost', getScAucExportPayload],
        ['#scNpsCorrExportHost', getScNpsCorrExportPayload],
        ['#scNpsGroupsExportHost', getScNpsGroupsExportPayload],
        ['#scRenewalDiffExportHost', getScRenewalDiffExportPayload],
        ['#scGroupExportHost', getScGroupExportPayload],
        ['#scPredictExportHost', getScPredictExportPayload],
        ['#scRulesExportHost', getExplorationRulesExportPayload],
        ['#scSurvivalExportHost', getScSurvivalExportPayload],
        ['#scCohortExportHost', getScCohortExportPayload],`,
  "mount-extra-sc-exports",
);

if (!s.includes("function getScNpsCorrExportPayload")) {
  rep(
    "function getScNpsGroupsExportPayload() {",
    `function getScNpsCorrExportPayload() {
      const rows = scState.payload?.axisMatrices?.nps?.rows || scState.payload?.npsCorrelations || [];
      return {
        filename: PortalTableExport.exportFilename('cruzamentos-nps-correlacoes'),
        sheetName: 'NPS correlacoes',
        columns: [
          { key: 'label', label: 'Indicador', value: (r) => r.label || r.id || '—' },
          { key: 'association', label: 'Spearman', value: (r) => r.association ?? r.spearman ?? r.rho ?? '—' },
          { key: 'stdDiff', label: 'Diferença padronizada', value: (r) => r.stdDiff ?? '—' },
          { key: 'n', label: 'Amostra', value: (r) => r.n ?? '—' },
          { key: 'coverage', label: 'Cobertura', value: (r) => r.coveragePercent ?? r.coverage ?? '—' }
        ],
        rows
      };
    }
    function getScGroupExportPayload() {
      const m = scState.payload?.groupComparative || scState.payload?.exploratory?.groupComparative;
      const rows = (m?.cells || []).map((c) => ({
        indicator: c.labelRow || c.varId,
        group: c.labelCol || c.groupId,
        value: c.value,
        reference: c.reference,
        standardized: c.standardized,
        coverage: c.coveragePercent,
        n: c.n
      }));
      return {
        filename: PortalTableExport.exportFilename('cruzamentos-matriz-grupos'),
        sheetName: 'Matriz grupos',
        columns: [
          { key: 'indicator', label: 'Indicador' },
          { key: 'group', label: 'Grupo' },
          { key: 'value', label: 'Valor do grupo' },
          { key: 'reference', label: 'Referência geral' },
          { key: 'standardized', label: 'Diferença padronizada' },
          { key: 'coverage', label: 'Cobertura' },
          { key: 'n', label: 'Amostra' }
        ],
        rows
      };
    }
    function getScPredictExportPayload() {
      const rows = scState.payload?.predictiveModel?.ranking || scState.payload?.exploratory?.predictiveModel?.ranking || [];
      return {
        filename: PortalTableExport.exportFilename('cruzamentos-ranking-preditivo'),
        sheetName: 'Ranking preditivo',
        columns: [
          { key: 'label', label: 'Variável', value: (r) => r.label || r.id || '—' },
          { key: 'importance', label: 'Importância', value: (r) => r.importance ?? r.coef ?? '—' },
          { key: 'direction', label: 'Direção', value: (r) => r.direction || '—' },
          { key: 'note', label: 'Observação', value: (r) => r.note || r.reason || '—' }
        ],
        rows
      };
    }
    function getScSurvivalExportPayload() {
      const curve = scState.payload?.survival?.overall?.curve || scState.payload?.survival?.curve || [];
      return {
        filename: PortalTableExport.exportFilename('cruzamentos-sobrevivencia'),
        sheetName: 'Sobrevivencia',
        columns: [
          { key: 'time', label: 'Tempo (dias)', value: (r) => r.time ?? r.t ?? '—' },
          { key: 'survival', label: 'Prob. permanência', value: (r) => r.survival ?? r.s ?? '—' },
          { key: 'atRisk', label: 'Em risco', value: (r) => r.atRisk ?? r.nAtRisk ?? '—' },
          { key: 'events', label: 'Eventos', value: (r) => r.events ?? r.d ?? '—' },
          { key: 'censored', label: 'Censurados', value: (r) => r.censored ?? r.c ?? '—' }
        ],
        rows: curve
      };
    }
    function getScNpsGroupsExportPayload() {`,
    "sc-export-payloads",
  );
}

fs.writeFileSync(path, s);
console.log("done changes=", changes, "bytes", n0, "->", s.length);
