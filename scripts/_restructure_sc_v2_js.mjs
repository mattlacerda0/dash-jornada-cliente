/**
 * JS para matrizes por eixo, seletor compacto, zoom, exploratórias.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const path = resolve(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
let html = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const INJECT_MARK = "    function scRenderDiscoveries(p) {";
if (!html.includes(INJECT_MARK)) throw new Error("inject mark missing");
if (html.includes("function scRenderAxisHeatmap(")) {
  console.log("JS already injected");
  process.exit(0);
}

const JS = `
    const SC_VAR_GROUPS = [
      { id: 'finance', label: 'Financeiro', ids: ['monthlyIncome','liquidityReserve','lastContribution','paidPropertiesValue'] },
      { id: 'meetings', label: 'Reuniões', ids: ['meetingCount','daysToFirstMeeting','daysSinceLastMeeting','averageIntervalDays','noShowCount','rescheduleCount','attendanceRate'] },
      { id: 'nps', label: 'NPS', ids: ['npsScore'] },
      { id: 'mech', label: 'Mecanismos', ids: ['mechanismCount','implementedMechanismCount','implementationPercent'] },
      { id: 'renewal', label: 'Renovação', ids: ['currentCycle','renewalCount'] },
      { id: 'tenure', label: 'Permanência', ids: ['stayDays'] },
      { id: 'finupd', label: 'Atualização financeira', ids: ['daysSinceFinancialUpdate','financialUpdateCount'] }
    ];
    const SC_VAR_LABELS = Object.fromEntries(SC_MATRIX_ALL.map((v) => [v.id, v.label]));
    scState.zoom = scState.zoom || {};
    scState.msDraft = null;
    scState.fsStageId = null;

    function scEnsureZoom(stageId) {
      if (!scState.zoom[stageId]) scState.zoom[stageId] = { scale: 1 };
      return scState.zoom[stageId];
    }
    function scApplyZoom(stageId) {
      const stage = document.getElementById(stageId);
      const inner = stage?.querySelector?.('.sc-zoom-inner') || stage;
      if (!inner) return;
      const z = scEnsureZoom(stageId);
      inner.style.transform = 'scale(' + z.scale + ')';
    }
    function scExportStagePng(stageId) {
      const stage = document.getElementById(stageId);
      const svg = stage?.querySelector?.('svg');
      if (!svg) { alert('Nenhum gráfico para exportar neste card.'); return; }
      const xml = new XMLSerializer().serializeToString(svg);
      const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = (stageId || 'analises') + '.svg';
      a.click();
      URL.revokeObjectURL(url);
    }
    function scOpenFullscreen(stageId, title) {
      const modal = document.getElementById('scFsModal');
      const body = document.getElementById('scFsBody');
      const ttl = document.getElementById('scFsTitle');
      const stage = document.getElementById(stageId);
      if (!modal || !body || !stage) return;
      scState.fsStageId = stageId;
      if (ttl) ttl.textContent = title || 'Visualização ampliada';
      body.innerHTML = '';
      const clone = stage.cloneNode(true);
      clone.id = stageId + '__fs';
      clone.style.minHeight = '70vh';
      body.appendChild(clone);
      scEnsureZoom(clone.id).scale = scEnsureZoom(stageId).scale || 1;
      scApplyZoom(clone.id);
      modal.hidden = false;
    }
    function scCloseFullscreen() {
      const modal = document.getElementById('scFsModal');
      if (modal) modal.hidden = true;
      scState.fsStageId = null;
    }
    function scBindZoomBars() {
      document.querySelectorAll('#view-statistical-crosses .sc-zoom-bar').forEach((bar) => {
        if (bar.dataset.bound) return;
        bar.dataset.bound = '1';
        bar.addEventListener('click', (evt) => {
          const btn = evt.target.closest('[data-sc-zoom]');
          if (!btn) return;
          const action = btn.getAttribute('data-sc-zoom');
          const stageId = bar.getAttribute('data-sc-zoom-for');
          const targetId = (btn.getAttribute('data-sc-fs') && scState.fsStageId) ? (scState.fsStageId + '__fs') : stageId;
          const z = scEnsureZoom(targetId === stageId + '__fs' ? targetId : stageId);
          if (action === 'in') z.scale = Math.min(3, (z.scale || 1) * 1.2);
          if (action === 'out') z.scale = Math.max(0.4, (z.scale || 1) / 1.2);
          if (action === 'reset') z.scale = 1;
          if (action === 'fit') z.scale = 1;
          if (action === 'fs') { scOpenFullscreen(stageId, bar.closest('.sc-axis-block, .section-head')?.querySelector('h2')?.textContent || 'Cohort'); return; }
          if (action === 'export') { scExportStagePng(stageId); return; }
          scApplyZoom(targetId === stageId + '__fs' ? targetId : stageId);
          if (targetId.endsWith('__fs')) scApplyZoom(targetId);
          else scApplyZoom(stageId);
        });
      });
      document.getElementById('scFsClose')?.addEventListener('click', scCloseFullscreen);
      document.addEventListener('keydown', (e) => { if (e.key === 'Escape') scCloseFullscreen(); });
      const fsToolbar = document.querySelector('#scFsModal .sc-fs-toolbar');
      if (fsToolbar && !fsToolbar.dataset.bound) {
        fsToolbar.dataset.bound = '1';
        fsToolbar.addEventListener('click', (evt) => {
          const btn = evt.target.closest('[data-sc-zoom]');
          if (!btn || !scState.fsStageId) return;
          const action = btn.getAttribute('data-sc-zoom');
          const id = scState.fsStageId + '__fs';
          const z = scEnsureZoom(id);
          if (action === 'in') z.scale = Math.min(3, (z.scale || 1) * 1.2);
          if (action === 'out') z.scale = Math.max(0.4, (z.scale || 1) / 1.2);
          if (action === 'fit' || action === 'reset') z.scale = 1;
          if (action === 'export') { scExportStagePng(scState.fsStageId); return; }
          scApplyZoom(id);
        });
      }
    }

    function scSeqColor(t) {
      const x = Math.max(0, Math.min(1, Number(t) || 0));
      const r = Math.round(40 + (1 - x) * 160);
      const g = Math.round(60 + x * 100);
      const b = Math.round(90 + x * 130);
      const fill = 'rgb(' + r + ',' + g + ',' + b + ')';
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      return { fill, text: lum > 140 ? '#111' : '#f5f5f5' };
    }

    function scRenderAxisHeatmap(matrix, hostId, legendId, narrId, tableId) {
      const host = document.getElementById(hostId);
      const legend = legendId ? document.getElementById(legendId) : null;
      const narr = narrId ? document.getElementById(narrId) : null;
      const table = tableId ? document.getElementById(tableId) : null;
      if (!host) return;
      if (!matrix?.rows?.length) {
        host.innerHTML = '<div class="empty" style="display:block">Não há variáveis suficientes para esta matriz neste recorte.</div>';
        if (narr) narr.textContent = '';
        return;
      }
      const rows = matrix.rows;
      const metrics = matrix.metrics || [];
      const cellW = 88, cellH = 36, labelW = 170, labelH = 70;
      const w = labelW + metrics.length * cellW + 8;
      const h = labelH + rows.length * cellH + 8;
      let cells = '';
      rows.forEach((r, i) => {
        metrics.forEach((m, j) => {
          const raw = r[m.id];
          const x = labelW + j * cellW;
          const y = labelH + i * cellH;
          let colors, txt;
          if (raw == null || !Number.isFinite(Number(raw))) {
            colors = { fill: '#3a3a3a', text: '#bbb' };
            txt = '—';
          } else if (m.sequential || !m.signed) {
            const max = m.scaleMax || 1;
            colors = scSeqColor(Number(raw) / max);
            txt = m.scaleMax === 100 ? Number(raw).toFixed(0) + '%' : Number(raw).toFixed(2).replace('.', ',');
          } else {
            colors = scCorrColor(Number(raw));
            txt = Number(raw).toFixed(2).replace('.', ',');
          }
          const tip = escapeHtml(r.label) + ' · ' + escapeHtml(m.label) + ': ' + txt +
            (r.n != null ? '<br/>n=' + r.n : '') +
            (r.coveragePercent != null ? '<br/>cobertura=' + r.coveragePercent + '%' : '');
          cells += '<g class="sc-axis-cell" data-tip="' + tip + '"><rect x="' + x + '" y="' + y + '" width="' + (cellW - 3) + '" height="' + (cellH - 3) + '" rx="3" fill="' + colors.fill + '"/>' +
            '<text x="' + (x + cellW / 2 - 1) + '" y="' + (y + cellH / 2 + 4) + '" text-anchor="middle" font-size="11" fill="' + colors.text + '">' + txt + '</text></g>';
        });
      });
      const colLabs = metrics.map((m, j) => '<text transform="translate(' + (labelW + j * cellW + cellW / 2) + ',' + (labelH - 10) + ') rotate(-40)" text-anchor="start" font-size="10" fill="#bbb">' + escapeHtml(m.label) + '</text>').join('');
      const rowLabs = rows.map((r, i) => '<text x="' + (labelW - 8) + '" y="' + (labelH + i * cellH + cellH / 2 + 4) + '" text-anchor="end" font-size="11" fill="#ccc">' + escapeHtml((r.label || r.id).slice(0, 26)) + '</text>').join('');
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + w + '" height="' + h + '" role="img" aria-label="' + escapeHtml(matrix.title || 'Matriz') + '">' +
        '<rect width="' + w + '" height="' + h + '" fill="#141414"/>' + colLabs + rowLabs + cells + '</svg>';
      host.querySelectorAll('.sc-axis-cell').forEach((g) => {
        g.addEventListener('mousemove', (evt) => scShowTip(g.getAttribute('data-tip') || '', evt));
        g.addEventListener('mouseleave', scHideTip);
      });
      if (legend) {
        const sequential = metrics.some((m) => m.sequential || !m.signed);
        if (sequential) {
          let stops = '';
          for (let i = 0; i <= 10; i += 1) {
            stops += '<rect x="18" y="' + (20 + i * 12) + '" width="18" height="12" fill="' + scSeqColor(1 - i / 10).fill + '"/>';
          }
          legend.innerHTML = '<svg width="56" height="180"><text x="28" y="14" text-anchor="middle" font-size="9" fill="#aaa">forte</text>' + stops + '<text x="28" y="170" text-anchor="middle" font-size="9" fill="#aaa">fraco</text></svg>';
        } else {
          let stops = '';
          for (let i = 0; i <= 20; i += 1) {
            const v = -1 + i / 10;
            stops += '<rect x="18" y="' + (10 + i * 8) + '" width="18" height="8" fill="' + scCorrColor(v).fill + '"/>';
          }
          legend.innerHTML = '<svg width="56" height="200"><text x="28" y="10" text-anchor="middle" font-size="9" fill="#aaa">+1</text>' + stops + '<text x="28" y="188" text-anchor="middle" font-size="9" fill="#aaa">-1</text></svg>';
        }
      }
      if (narr) {
        const top = rows.find((r) => r.association != null) || rows[0];
        narr.textContent = matrix.note || '';
        if (top?.association != null) {
          narr.textContent += ' Destaque: ' + (top.label || top.id) + ' (' + Number(top.association).toFixed(2).replace('.', ',') + ').';
        }
      }
      if (table) {
        table.innerHTML = '<table><thead><tr><th>Variável</th>' + metrics.map((m) => '<th class="num">' + escapeHtml(m.label) + '</th>').join('') + '<th class="num">n</th></tr></thead><tbody>' +
          rows.map((r) => '<tr><td>' + escapeHtml(r.label || r.id) + '</td>' + metrics.map((m) => {
            const v = r[m.id];
            return '<td class="num">' + (v == null ? '—' : Number(v).toFixed(m.scaleMax === 100 ? 1 : 3).replace('.', ',')) + '</td>';
          }).join('') + '<td class="num">' + (r.n ?? '—') + '</td></tr>').join('') + '</tbody></table>';
      }
    }

    function scRenderRankBars(rows, hostId, valueKey) {
      const host = document.getElementById(hostId);
      if (!host) return;
      const list = (rows || []).filter((r) => Number.isFinite(Number(r[valueKey] ?? r.association ?? r.importance))).slice(0, 12);
      if (!list.length) { host.innerHTML = '<div class="empty" style="display:block">Ranking indisponível neste recorte.</div>'; return; }
      const w = 720, rowH = 26, padL = 190, padR = 50, padT = 12, padB = 12;
      const h = padT + list.length * rowH + padB;
      const maxAbs = Math.max(...list.map((r) => Math.abs(Number(r[valueKey] ?? r.association ?? r.importance))), 0.01);
      const bars = list.map((r, i) => {
        const v = Number(r[valueKey] ?? r.association ?? r.importance);
        const y = padT + i * rowH;
        const bw = (Math.abs(v) / maxAbs) * (w - padL - padR);
        const fill = v < 0 ? '#3b82f6' : '#f47920';
        return '<text x="' + (padL - 8) + '" y="' + (y + 14) + '" text-anchor="end" font-size="11" fill="#ccc">' + escapeHtml((r.label || r.id || '').slice(0, 28)) + '</text>' +
          '<rect x="' + padL + '" y="' + (y + 4) + '" width="' + Math.max(2, bw) + '" height="14" fill="' + fill + '" rx="2"/>' +
          '<text x="' + (padL + bw + 6) + '" y="' + (y + 15) + '" font-size="10" fill="#ddd">' + v.toFixed(3).replace('.', ',') + '</text>';
      }).join('');
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#141414"/>' + bars + '</svg>';
    }

    function scRenderGroupComparative(p) {
      const m = p.groupComparative || p.exploratory?.groupComparative;
      const host = document.getElementById('scGroupMatrixHost');
      const narr = document.getElementById('scGroupMatrixNarration');
      const table = document.getElementById('scGroupMatrixTable');
      if (!host) return;
      if (!m?.variables?.length || !m?.groups?.length) {
        host.innerHTML = '<div class="empty" style="display:block">Matriz comparativa indisponível.</div>';
        return;
      }
      const cellW = 72, cellH = 32, labelW = 150, labelH = 90;
      const w = labelW + m.groups.length * cellW + 8;
      const h = labelH + m.variables.length * cellH + 8;
      const byKey = new Map((m.cells || []).map((c) => [c.varId + '||' + c.groupId, c]));
      let cells = '';
      m.variables.forEach((v, i) => {
        m.groups.forEach((g, j) => {
          const c = byKey.get(v.id + '||' + g.id);
          const std = c?.standardized;
          const colors = std == null ? { fill: '#3a3a3a', text: '#bbb' } : scCorrColor(Math.max(-1, Math.min(1, std)));
          const txt = std == null ? '—' : (std > 0 ? '+' : '') + Number(std).toFixed(2).replace('.', ',');
          const tip = escapeHtml(v.label) + ' · ' + escapeHtml(g.label) + '<br/>padronizado: ' + txt +
            (c?.value != null ? '<br/>valor: ' + c.value : '') + '<br/>n=' + (g.n ?? '—');
          const x = labelW + j * cellW;
          const y = labelH + i * cellH;
          cells += '<g class="sc-axis-cell" data-tip="' + tip + '"><rect x="' + x + '" y="' + y + '" width="' + (cellW - 2) + '" height="' + (cellH - 2) + '" rx="2" fill="' + colors.fill + '"/>' +
            '<text x="' + (x + cellW / 2) + '" y="' + (y + cellH / 2 + 4) + '" text-anchor="middle" font-size="10" fill="' + colors.text + '">' + txt + '</text></g>';
        });
      });
      const colLabs = m.groups.map((g, j) => '<text transform="translate(' + (labelW + j * cellW + cellW / 2) + ',' + (labelH - 8) + ') rotate(-50)" text-anchor="start" font-size="10" fill="#bbb">' + escapeHtml(g.label) + ' (n=' + g.n + ')</text>').join('');
      const rowLabs = m.variables.map((v, i) => '<text x="' + (labelW - 6) + '" y="' + (labelH + i * cellH + cellH / 2 + 3) + '" text-anchor="end" font-size="10" fill="#ccc">' + escapeHtml(v.label) + '</text>').join('');
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + Math.min(w, 960) + '" height="' + Math.min(h, 520) + '"><rect width="' + w + '" height="' + h + '" fill="#141414"/>' + colLabs + rowLabs + cells + '</svg>';
      host.querySelectorAll('.sc-axis-cell').forEach((g) => {
        g.addEventListener('mousemove', (evt) => scShowTip(g.getAttribute('data-tip') || '', evt));
        g.addEventListener('mouseleave', scHideTip);
      });
      if (narr) narr.textContent = m.note || '';
      if (table) {
        table.innerHTML = '<table><thead><tr><th>Variável</th>' + m.groups.map((g) => '<th class="num">' + escapeHtml(g.label) + '</th>').join('') + '</tr></thead><tbody>' +
          m.variables.map((v) => '<tr><td>' + escapeHtml(v.label) + '</td>' + m.groups.map((g) => {
            const c = byKey.get(v.id + '||' + g.id);
            return '<td class="num">' + (c?.value == null ? '—' : c.value) + '</td>';
          }).join('') + '</tr>').join('') + '</tbody></table>';
      }
    }

    function scRenderPredictive(p) {
      const pred = p.predictiveModel || p.exploratory?.predictive;
      const meta = document.getElementById('scPredictMeta');
      const table = document.getElementById('scPredictTable');
      if (meta) {
        if (!pred) meta.textContent = 'Modelo preditivo indisponível.';
        else if (pred.status === 'insufficient_sample') meta.textContent = pred.note || 'Amostra insuficiente.';
        else {
          const m = pred.metrics || {};
          meta.textContent = 'Técnica: ' + (pred.method || '—') + ' · split: ' + (pred.splitType || '—') +
            ' · treino n=' + (pred.sample?.train ?? '—') + ' · validação n=' + (pred.sample?.test ?? '—') +
            ' · prevalência=' + (pred.sample?.prevalence != null ? (pred.sample.prevalence * 100).toFixed(1).replace('.', ',') + '%' : '—') +
            ' · ROC-AUC=' + (m.rocAuc ?? '—') + ' · precision=' + (m.precision ?? '—') + ' · recall=' + (m.recall ?? '—') + ' · F1=' + (m.f1 ?? '—') +
            '. Leakage removido: stayDays, datas/status de churn.';
        }
      }
      scRenderRankBars(pred?.ranking || [], 'scPredictChart', 'importance');
      if (table && pred?.ranking?.length) {
        table.innerHTML = '<table><thead><tr><th>#</th><th>Variável</th><th class="num">Importância</th><th>Direção</th><th class="num">AUC univ.</th><th class="num">Cobertura</th><th>Estabilidade</th><th>Leakage</th><th>Observação</th></tr></thead><tbody>' +
          pred.ranking.map((r) => '<tr><td>' + r.rank + '</td><td>' + escapeHtml(r.label || r.id) + '</td><td class="num">' + (r.importance != null ? Number(r.importance).toFixed(3).replace('.', ',') : '—') + '</td><td>' + escapeHtml(r.direction || '—') + '</td><td class="num">' + (r.univariateAuc != null ? Number(r.univariateAuc).toFixed(3).replace('.', ',') : '—') + '</td><td class="num">' + (r.coveragePercent != null ? epFmtPct(r.coveragePercent) : '—') + '</td><td class="num">' + (r.stability != null ? Number(r.stability).toFixed(2) : '—') + '</td><td>' + escapeHtml(r.leakageRisk || '—') + '</td><td>' + escapeHtml(r.observation || '—') + '</td></tr>').join('') + '</tbody></table>';
      }
    }

    function scRenderHighPerf(p) {
      const hp = p.highPerformance || p.exploratory?.highPerformance;
      const host = document.getElementById('scHighPerfHost');
      const narr = document.getElementById('scHighPerfNarration');
      if (!host) return;
      if (!hp?.groups?.length) { host.innerHTML = '<div class="empty" style="display:block">Alta performance indisponível.</div>'; return; }
      const w = 720, h = 220, padL = 40, padR = 20, padT = 30, padB = 40;
      const groups = hp.groups.filter((g) => (g.n || 0) > 0);
      const gW = (w - padL - padR) / Math.max(groups.length, 1);
      let bars = '';
      groups.forEach((g, i) => {
        const v = Number(g.cancelledPct || 0);
        const bh = (v / 100) * (h - padT - padB);
        const x = padL + i * gW + gW * 0.2;
        bars += '<rect x="' + x + '" y="' + (h - padB - bh) + '" width="' + (gW * 0.6) + '" height="' + Math.max(1, bh) + '" fill="#22c55e" rx="2"/>' +
          '<text x="' + (padL + i * gW + gW / 2) + '" y="' + (h - 14) + '" text-anchor="middle" font-size="10" fill="#ccc">' + escapeHtml((g.label || '').slice(0, 22)) + '</text>' +
          '<text x="' + (padL + i * gW + gW / 2) + '" y="' + (h - padB - bh - 6) + '" text-anchor="middle" font-size="10" fill="#ddd">' + v.toFixed(1).replace('.', ',') + '%</text>';
      });
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#141414"/>' + bars +
        '<text x="' + padL + '" y="18" font-size="11" fill="#aaa">% cancelado por perfil de alta performance (menor é melhor)</text></svg>';
      if (narr) narr.textContent = (hp.definition || '') + ' ' + (hp.note || '');
    }

    function scRenderHealth(p) {
      const list = p.healthScoreCandidates || p.exploratory?.healthScoreCandidates || [];
      const host = document.getElementById('scHealthHost');
      const narr = document.getElementById('scHealthNarration');
      if (!host) return;
      if (!list.length) {
        host.innerHTML = '<p class="note-muted">Sem candidatos elegíveis com cobertura/estabilidade suficientes neste recorte.</p>';
        return;
      }
      host.innerHTML = list.map((c) => '<article class="sc-health-card"><strong>' + escapeHtml(c.label || c.id) + '</strong>' +
        '<p><em>' + escapeHtml(c.dimension || '') + '</em> · cobertura ' + (c.coveragePercent != null ? epFmtPct(c.coveragePercent) : '—') + ' · facilidade ' + escapeHtml(c.operationalEase || '—') + '</p>' +
        '<p>Churn: ' + (c.associationChurn != null ? Number(c.associationChurn).toFixed(2).replace('.', ',') : '—') +
        ' · Renovação: ' + (c.associationRenewal != null ? Number(c.associationRenewal).toFixed(2).replace('.', ',') : '—') +
        ' · NPS: ' + (c.associationNps != null ? Number(c.associationNps).toFixed(2).replace('.', ',') : '—') +
        ' · AUC: ' + (c.univariateAuc != null ? Number(c.univariateAuc).toFixed(3).replace('.', ',') : '—') + '</p>' +
        '<p>' + escapeHtml(c.justification || '') + '</p>' +
        '<p>' + escapeHtml(c.limitations || '') + '</p></article>').join('');
      if (narr) narr.textContent = 'Uma variável representante por dimensão (engajamento, satisfação, implementação etc.) para reduzir redundância.';
    }

    function scRenderExploratoryAll(p) {
      const axes = p.axisMatrices || {};
      scRenderAxisHeatmap(axes.cancellation, 'scCancelMatrixHost', 'scCancelMatrixLegend', 'scCancelMatrixNarration', 'scCancelMatrixTable');
      scRenderAxisHeatmap(axes.nps, 'scNpsMatrixHost', 'scNpsMatrixLegend', 'scNpsMatrixNarration', null);
      scRenderAxisHeatmap(axes.renewal, 'scRenewalMatrixHost', 'scRenewalMatrixLegend', 'scRenewalMatrixNarration', null);
      scRenderAxisHeatmap(axes.tenure, 'scTenureMatrixHost', 'scTenureMatrixLegend', 'scTenureMatrixNarration', null);
      const ranks = p.discoveryRankings || p.exploratory?.discoveryRankings || {};
      scRenderRankBars(ranks.cancellation, 'scCancelRankHost', 'association');
      scRenderRankBars(ranks.nps, 'scNpsRankHost', 'association');
      scRenderRankBars(ranks.renewal, 'scRenewalRankHost', 'association');
      const table = document.getElementById('scCancelRankTable');
      if (table && ranks.cancellation?.length) {
        table.innerHTML = '<table><thead><tr><th>#</th><th>Variável</th><th class="num">Associação</th><th class="num">AUC</th><th class="num">Cobertura</th><th>Direção</th><th>Observação</th></tr></thead><tbody>' +
          ranks.cancellation.map((r) => '<tr><td>' + r.rank + '</td><td>' + escapeHtml(r.label) + '</td><td class="num">' + (r.association != null ? Number(r.association).toFixed(3).replace('.', ',') : '—') + '</td><td class="num">' + (r.auc != null ? Number(r.auc).toFixed(3).replace('.', ',') : '—') + '</td><td class="num">' + (r.coveragePercent != null ? epFmtPct(r.coveragePercent) : '—') + '</td><td>' + escapeHtml(r.direction || '—') + '</td><td>' + escapeHtml(r.observation || '—') + '</td></tr>').join('') + '</tbody></table>';
      }
      scRenderGroupComparative(p);
      scRenderPredictive(p);
      scRenderHighPerf(p);
      scRenderHealth(p);
      scBindZoomBars();
    }

`;

html = html.replace(INJECT_MARK, JS + "\n" + INJECT_MARK);

// Replace scRenderMatrixVars with compact grouped selector
{
  const oldStart = "    function scRenderMatrixVars(p) {";
  const oldEnd = "    function scOpenMatrixCell(cell, p) {";
  const i0 = html.indexOf(oldStart);
  const i1 = html.indexOf(oldEnd);
  if (i0 < 0 || i1 < 0) throw new Error("matrix vars block missing");
  const NEW_VARS = `    function scRenderMatrixVars(p) {
      const host = document.querySelector('#scMatrixVarsHost');
      const summary = document.querySelector('#scMsSummary');
      const chips = document.querySelector('#scMsChips');
      if (!host) return;
      const selected = new Set(scState.msDraft || scState.matrixVarIds || SC_MATRIX_RECOMMENDED);
      const q = (document.querySelector('#scMsSearch')?.value || '').toLowerCase().trim();
      host.innerHTML = SC_VAR_GROUPS.map((g) => {
        const opts = g.ids.map((id) => {
          const label = SC_VAR_LABELS[id] || id;
          if (q && !label.toLowerCase().includes(q) && !id.toLowerCase().includes(q)) return '';
          const checked = selected.has(id);
          return '<label class="sc-ms-option"><input type="checkbox" data-sc-matrix-var="' + escapeHtml(id) + '" ' + (checked ? 'checked' : '') + '/> <span>' + escapeHtml(label) + '</span></label>';
        }).join('');
        if (!opts.replace(/\\s/g, '')) return '';
        return '<div class="sc-ms-group"><strong>' + escapeHtml(g.label) +
          ' <button type="button" data-sc-group="' + escapeHtml(g.id) + '" style="font-size:10px;padding:2px 6px">grupo</button></strong>' + opts + '</div>';
      }).join('');
      const count = selected.size;
      if (summary) summary.textContent = 'Variáveis selecionadas: ' + count;
      if (chips) {
        const labels = [...selected].map((id) => SC_VAR_LABELS[id] || id);
        chips.textContent = labels.length <= 3 ? labels.join(', ') : (labels.slice(0, 3).join(', ') + ' +' + (labels.length - 3));
      }
      const warn = document.getElementById('scMsWarn');
      if (warn) warn.hidden = count <= 12;
      host.querySelectorAll('input[data-sc-matrix-var]').forEach((inp) => {
        inp.addEventListener('change', () => {
          const ids = [...host.querySelectorAll('input[data-sc-matrix-var]:checked')].map((el) => el.dataset.scMatrixVar);
          scState.msDraft = ids.slice(0, 12);
          if (ids.length > 12) {
            inp.checked = false;
            scState.msDraft = [...host.querySelectorAll('input[data-sc-matrix-var]:checked')].map((el) => el.dataset.scMatrixVar);
          }
          scRenderMatrixVars(p);
        });
      });
      host.querySelectorAll('[data-sc-group]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const g = SC_VAR_GROUPS.find((x) => x.id === btn.dataset.scGroup);
          if (!g) return;
          const cur = new Set(scState.msDraft || scState.matrixVarIds || []);
          g.ids.forEach((id) => cur.add(id));
          scState.msDraft = [...cur].slice(0, 12);
          scRenderMatrixVars(p);
        });
      });
    }

`;
  html = html.slice(0, i0) + NEW_VARS + html.slice(i1);
}

// Patch scRenderCohort to respect minN and cell mode + larger cells
{
  const marker = `      const cohorts = cohort.cohorts;
      const ages = cohort.ages;`;
  const repl = `      const minCohortN = Number(document.querySelector('#scCohortMinN')?.value || 5);
      const cellMode = document.querySelector('#scCohortCellMode')?.value || 'pct';
      const cohorts = (cohort.cohorts || []).filter((c) => (c.nStart || 0) >= minCohortN);
      const ages = cohort.ages;`;
  if (html.includes(marker)) html = html.replace(marker, repl);

  html = html.replace(
    `      const cellW = 46, cellH = 28, labelW = 54, labelH = 70;`,
    `      const cellW = 56, cellH = 34, labelW = 54, labelH = 78;`,
  );
  html = html.replace(
    `          const txt = observable ? Number(cell.retainedPct).toFixed(0) + '%' : '—';`,
    `          const txt = observable
            ? (cellMode === 'n' ? String(cell.retainedN ?? '—') : (Number(cell.retainedPct).toFixed(0) + '%'))
            : '—';`,
  );
}

// Hook exploratory renders
{
  const hook = `      scRenderDiffChart(p);
      scRenderAucChart(p);
      scRenderNpsGroupsChart(p);
      scRenderRenewalDiffChart(p);
      scRenderSurvivalChart(p);
      scRenderCohort(p);
      scRenderRiskRules(p);`;
  const hookNew = `      scRenderDiffChart(p);
      scRenderAucChart(p);
      scRenderNpsGroupsChart(p);
      scRenderRenewalDiffChart(p);
      scRenderExploratoryAll(p);
      scRenderSurvivalChart(p);
      scRenderCohort(p);
      scRenderRiskRules(p);
      scBindZoomBars();`;
  if (!html.includes(hook)) throw new Error("render hook missing for exploratory");
  html = html.replace(hook, hookNew);
}

// Listeners for compact selector + cohort controls
{
  const listenMark = `    document.querySelector('#scMatrixRecommended')?.addEventListener('click', () => {
      scState.matrixVarIds = [...SC_MATRIX_RECOMMENDED];
      loadStatisticalCrosses();
    });
    document.querySelector('#scMatrixClear')?.addEventListener('click', () => {
      scState.matrixVarIds = [];
      loadStatisticalCrosses();
    });`;
  const listenNew = `    document.querySelector('#scMsTrigger')?.addEventListener('click', () => {
      const wrap = document.getElementById('scMsWrap');
      const panel = document.getElementById('scMsPanel');
      const open = panel && !panel.hidden;
      if (panel) panel.hidden = !!open;
      if (wrap) wrap.classList.toggle('is-open', !open);
      document.querySelector('#scMsTrigger')?.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (!open) {
        scState.msDraft = [...(scState.matrixVarIds || SC_MATRIX_RECOMMENDED)];
        if (scState.payload) scRenderMatrixVars(scState.payload);
      }
    });
    document.querySelector('#scMsSearch')?.addEventListener('input', () => { if (scState.payload) scRenderMatrixVars(scState.payload); });
    document.querySelector('#scMsApply')?.addEventListener('click', () => {
      const ids = scState.msDraft || [];
      if (ids.length > 12) { alert('Selecione no máximo 12 variáveis para manter a legibilidade.'); return; }
      scState.matrixVarIds = ids.length ? ids : [...SC_MATRIX_RECOMMENDED];
      const panel = document.getElementById('scMsPanel');
      const wrap = document.getElementById('scMsWrap');
      if (panel) panel.hidden = true;
      if (wrap) wrap.classList.remove('is-open');
      loadStatisticalCrosses();
    });
    document.querySelector('#scMsCancel')?.addEventListener('click', () => {
      scState.msDraft = null;
      const panel = document.getElementById('scMsPanel');
      const wrap = document.getElementById('scMsWrap');
      if (panel) panel.hidden = true;
      if (wrap) wrap.classList.remove('is-open');
      if (scState.payload) scRenderMatrixVars(scState.payload);
    });
    document.querySelector('#scMatrixRecommended')?.addEventListener('click', () => {
      scState.msDraft = [...SC_MATRIX_RECOMMENDED];
      if (scState.payload) scRenderMatrixVars(scState.payload);
    });
    document.querySelector('#scMatrixClear')?.addEventListener('click', () => {
      scState.msDraft = [];
      if (scState.payload) scRenderMatrixVars(scState.payload);
    });
    document.querySelector('#scCohortCellMode')?.addEventListener('change', () => { if (scState.payload) scRenderCohort(scState.payload); });
    document.querySelector('#scCohortMinN')?.addEventListener('change', () => { if (scState.payload) scRenderCohort(scState.payload); });`;
  if (!html.includes("scMsTrigger") || !html.includes("scMsApply")) {
    // panel exists in HTML; listeners may need insert
  }
  if (html.includes(listenMark)) {
    html = html.replace(listenMark, listenNew);
  } else if (!html.includes("scMsApply")) {
    throw new Error("matrix recommended listeners missing");
  }
}

writeFileSync(path, html);
console.log("JS exploratory + selector injected");
