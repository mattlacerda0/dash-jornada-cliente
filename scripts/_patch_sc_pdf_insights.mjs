/**
 * Correções finais Análises Estatísticas:
 * - PDF download direto (jsPDF via CDN)
 * - insights didáticos, cores, tooltips, Como ler
 * - ativos com sinais, top Pharus/Davos, cohort período
 * Sem Git. Sem banco.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const path = resolve(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
let html = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

function mustInclude(s, label) {
  if (!html.includes(s)) throw new Error(`Missing: ${label}`);
}

// CDN for PDF (no npm package in project)
if (!html.includes("jspdf") && html.includes('<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js')) {
  html = html.replace(
    '<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js"></script>',
    `<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/dist/umd/supabase.min.js"></script>`,
  );
}

// CSS extras
{
  const anchor = `#view-statistical-crosses .sc-toc a:hover{color:var(--color-text);border-color:rgba(244,121,32,.5)}`;
  if (html.includes(anchor) && !html.includes(".sc-howto{")) {
    html = html.replace(
      anchor,
      `${anchor}
    #view-statistical-crosses .sc-howto{display:flex;gap:8px;align-items:flex-start;margin:0 0 10px;padding:8px 10px;border:1px solid rgba(255,255,255,.08);border-radius:8px;background:rgba(255,255,255,.03);font-size:12px;line-height:1.4;color:var(--color-text-muted)}
    #view-statistical-crosses .sc-howto strong{color:var(--color-text);font-weight:600}
    #view-statistical-crosses .sc-howto .sc-howto-ico{flex:0 0 auto;width:18px;height:18px;border-radius:50%;border:1px solid var(--color-border);display:inline-flex;align-items:center;justify-content:center;font-size:11px;color:var(--color-text)}
    #view-statistical-crosses .sc-assoc-legend{display:flex;gap:14px;font-size:11px;color:var(--color-text-muted);margin:0 0 8px}
    #view-statistical-crosses .sc-assoc-legend span{display:inline-flex;align-items:center;gap:6px}
    #view-statistical-crosses .sc-assoc-legend i{width:12px;height:12px;border-radius:2px;display:inline-block}
    #view-statistical-crosses .sc-discovery-card .sc-disc-cat{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--color-text-muted)}
    #view-statistical-crosses .sc-discovery-card .sc-disc-val{font-size:18px;font-weight:700;margin:6px 0;color:var(--color-text)}
    #view-statistical-crosses .sc-top-table{font-size:11px}
    #view-statistical-crosses .sc-top-table th,#view-statistical-crosses .sc-top-table td{padding:4px 6px;white-space:nowrap}`,
    );
  }
}

// Cohort period + challenge note + new sections before quality
{
  const oldCohortFilters = `          <section class="filters financial" aria-label="Controles da coorte" style="margin-bottom:10px">
            <label>Granularidade<select id="scCohortGranularity"><option value="month" selected>Mensal</option><option value="quarter">Trimestral</option></select></label>
            <label>Texto da célula<select id="scCohortCellMode"><option value="pct" selected>Percentual</option><option value="n">Quantidade</option></select></label>
            <label>Tamanho mínimo da coorte<input id="scCohortMinN" type="number" min="1" value="5" style="width:72px"/></label>
          </section>`;
  const newCohortFilters = `          <section class="filters financial" aria-label="Controles da coorte" style="margin-bottom:10px">
            <label>Tipo<select id="scCohortType"><option value="contract" selected>Retenção contratual</option><option value="challenges" disabled>Desafios 45 dias (indisponível)</option></select></label>
            <label>Período da cohort<select id="scCohortPeriod"><option value="since_2025_01" selected>Desde jan/2025</option><option value="last_12_months">Últimos 12 meses</option><option value="all">Todo o histórico</option></select></label>
            <label>Granularidade<select id="scCohortGranularity"><option value="month" selected>Mensal</option><option value="quarter">Trimestral</option></select></label>
            <label>Texto da célula<select id="scCohortCellMode"><option value="pct" selected>Percentual</option><option value="n">Quantidade</option></select></label>
            <label>Tamanho mínimo da coorte<input id="scCohortMinN" type="number" min="1" value="5" style="width:72px"/></label>
          </section>
          <p class="note-muted" id="scChallengeCohortNote"></p>`;
  if (html.includes(oldCohortFilters)) html = html.replace(oldCohortFilters, newCohortFilters);
}

// Insert new sections before excluded variables / after health
{
  const marker = `          <div class="section-head"><div><h2>15. Variáveis excluídas</h2>`;
  const insert = `          <div class="section-head" id="scSecSignals"><div><h2>Clientes ativos com sinais detectados</h2>
            <p class="sc-section-note" style="margin:0">Clientes ainda ativos com padrões associados ao cancelamento. Não é previsão certa de churn.</p></div></div>
          <div class="sc-howto"><span class="sc-howto-ico" title="Informação">i</span><div><strong>Como ler:</strong> cada linha é um cliente ativo com um ou mais sinais. Use a intensidade e a cobertura dos sinais — não trate como lista de cancelamento futuro.</div></div>
          <div id="scSignalsSummary" class="note-muted"></div>
          <div id="scSignalsChart" class="sc-chart-host"></div>
          <details class="sc-data-details"><summary>Ver clientes com sinais</summary><div id="scSignalsTable" class="table-wrap"></div></details>

          <div class="section-head" id="scSecTop"><div><h2>Top clientes — Pharus e Davos</h2>
            <p class="sc-section-note" style="margin:0">Ranking pelo índice exploratório de alta performance (transparente). Não é Health Score oficial.</p></div></div>
          <div class="sc-howto"><span class="sc-howto-ico">i</span><div><strong>Como ler:</strong> pontuação equilibra NPS, renovação, reuniões, mecanismos, financeiro e permanência. Renda tem teto para não dominar o ranking.</div></div>
          <p class="note-muted" id="scTopMethodNote"></p>
          <div class="section-head" style="margin-top:8px"><div><h3 style="font-size:14px;margin:0">Top clientes — Pharus</h3></div>
            <button class="btn" type="button" id="scExportPharusCsv">Exportar CSV</button>
          </div>
          <details class="sc-data-details" open><summary>Ver tabela Pharus</summary><div id="scTopPharusTable" class="table-wrap"></div></details>
          <div class="section-head" style="margin-top:8px"><div><h3 style="font-size:14px;margin:0">Top clientes — Davos</h3></div>
            <button class="btn" type="button" id="scExportDavosCsv">Exportar CSV</button>
          </div>
          <details class="sc-data-details" open><summary>Ver tabela Davos</summary><div id="scTopDavosTable" class="table-wrap"></div></details>

          <div class="section-head" id="scSecNpsMatrix"><div><h2>Matriz comparativa NPS (variáveis amplas)</h2>
            <p class="sc-section-note" style="margin:0">Promotores, Neutros e Detratores em renda, aporte, mecanismos, reuniões e demais indicadores disponíveis.</p></div></div>
          <label style="font-size:12px">Modo <select id="scNpsCompMode"><option value="standardized" selected>Padronizado vs população</option><option value="value">Valor original</option><option value="diff">Diferença vs população</option></select></label>
          <div id="scNpsCompHost" class="sc-chart-host" style="margin-top:8px"></div>
          <p class="note-muted" id="scNpsCompNarration"></p>

          <div class="section-head"><div><h2>15. Variáveis excluídas</h2>`;
  if (html.includes(marker) && !html.includes("scSecSignals")) {
    html = html.replace(marker, insert);
  }
}

// How-to boxes near key sections (diff/auc/nps)
html = html.replace(
  `<h3 style="font-size:14px;margin:16px 0 6px">Diferença entre ativos e cancelados</h3>`,
  `<h3 style="font-size:14px;margin:16px 0 6px">Diferença entre ativos e cancelados</h3>
            <div class="sc-howto"><span class="sc-howto-ico">i</span><div><strong>Como ler este gráfico:</strong> compare o comprimento das barras. <strong>Verde = ativos</strong>, <strong>vermelho = cancelados</strong>. Quando a barra vermelha é maior, a mediana dos cancelados é maior.</div></div>`,
);
html = html.replace(
  `<h3 style="font-size:14px;margin:16px 0 6px">Poder preditivo individual (AUC)</h3>`,
  `<h3 style="font-size:14px;margin:16px 0 6px">Poder preditivo individual (AUC)</h3>
            <div class="sc-howto"><span class="sc-howto-ico">i</span><div><strong>A AUC</strong> mede quanto uma variável, sozinha, diferencia cancelados de não cancelados. 0,50 = não diferencia · 0,60 = fraco · 0,70 = moderado · 0,80+ = forte (auditar leakage). <em>AUC não é taxa de acerto nem causalidade.</em> Quanto mais a barra se afasta de 0,50, maior o poder de separação.</div></div>`,
);
html = html.replace(
  `<h3 style="font-size:14px;margin:16px 0 6px">Promotores, Neutros e Detratores</h3>`,
  `<h3 style="font-size:14px;margin:16px 0 6px">Promotores, Neutros e Detratores</h3>
            <div class="sc-howto"><span class="sc-howto-ico">i</span><div><strong>Como ler:</strong> barras agrupadas por classe NPS. Os números acima das barras mostram o percentual. Cobertura NPS baixa reduz a confiança.</div></div>`,
);

// Export button title
html = html.replace(
  `title="Gera relatório HTML/PDF com os filtros atuais"`,
  `title="Baixa o PDF do relatório com o recorte atual"`,
);

// ---------- JS patches ----------
// Discoveries cards
{
  const old = `      host.innerHTML = rows.map((d) => '<article class="sc-discovery-card"><strong>' + escapeHtml(d.title || d.id || 'Descoberta') + '</strong><p>' + escapeHtml(d.text || '') + '</p></article>').join('');`;
  const neu = `      host.innerHTML = rows.map((d) => {
        const tip = [d.technical, d.caveat, d.sample != null ? ('Amostra: ' + d.sample) : '', d.coverage != null ? ('Cobertura: ' + d.coverage + '%') : ''].filter(Boolean).join(' · ');
        return '<article class="sc-discovery-card" tabindex="0" data-tip="' + escapeHtml(tip) + '"><div class="sc-disc-cat">' + escapeHtml(d.category || d.section || 'Insight') + (d.lowConfidence ? ' · cautela' : '') + '</div><strong>' + escapeHtml(d.title || d.id || 'Descoberta') + '</strong>' +
          (d.primaryValue ? '<div class="sc-disc-val">' + escapeHtml(String(d.primaryValue)) + '</div>' : '') +
          '<p>' + escapeHtml(d.text || '') + '</p></article>';
      }).join('');
      host.querySelectorAll('[data-tip]').forEach((el) => {
        el.addEventListener('mousemove', (evt) => scShowTip(el.getAttribute('data-tip') || '', evt));
        el.addEventListener('mouseleave', scHideTip);
        el.addEventListener('focus', (evt) => scShowTip(el.getAttribute('data-tip') || '', evt));
        el.addEventListener('blur', scHideTip);
      });`;
  if (html.includes(old)) html = html.replace(old, neu);
}

// Diff chart green/red + tooltips
{
  const oldBars = `        bars += '<text x="' + (padL - 8) + '" y="' + (y + 14) + '" text-anchor="end" font-size="11" fill="#ccc">' + escapeHtml((d.label || d.id || '').slice(0, 22)) + '</text>' +
          '<rect x="' + padL + '" y="' + y + '" width="' + xOf(a) + '" height="10" fill="#3b82f6" rx="2"/>' +
          '<rect x="' + padL + '" y="' + (y + 12) + '" width="' + xOf(c) + '" height="10" fill="#f47920" rx="2"/>';
      });
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#141414"/>' + bars +
        '<g transform="translate(' + padL + ',' + (h - 8) + ')"><rect width="12" height="8" fill="#3b82f6"/><text x="16" y="8" font-size="10" fill="#aaa">Ativos</text><rect x="70" width="12" height="8" fill="#f47920"/><text x="86" y="8" font-size="10" fill="#aaa">Cancelados</text></g></svg>';
      if (narr) {
        const top = rows[0];
        narr.textContent = top ? ('Exemplo no grupo: ' + (top.label || top.id) + ' — mediana ativos ' + scFormatValue(top.id, top.label, top.medianActive ?? top.activeMedian) + ' vs cancelados ' + scFormatValue(top.id, top.label, top.medianCancelled ?? top.cancelledMedian) + '.') : '';
      }
    }`;
  const newBars = `        const tip = escapeHtml(d.label || d.id) + '<br/>Ativos: mediana ' + escapeHtml(String(scFormatValue(d.id, d.label, a))) +
          '<br/>Cancelados: mediana ' + escapeHtml(String(scFormatValue(d.id, d.label, c))) +
          '<br/>Diferença: ' + escapeHtml(String(scFormatValue(d.id, d.label, c - a))) +
          '<br/>Interpretação: ' + (c < a ? 'cancelados tiveram valor inferior neste recorte.' : c > a ? 'cancelados tiveram valor superior neste recorte.' : 'medianas semelhantes.');
        bars += '<g class="sc-diff-row" data-tip="' + tip + '"><text x="' + (padL - 8) + '" y="' + (y + 14) + '" text-anchor="end" font-size="11" fill="#ccc">' + escapeHtml((d.label || d.id || '').slice(0, 22)) + '</text>' +
          '<rect x="' + padL + '" y="' + y + '" width="' + xOf(a) + '" height="10" fill="#22c55e" rx="2"/>' +
          '<rect x="' + padL + '" y="' + (y + 12) + '" width="' + xOf(c) + '" height="10" fill="#ef4444" rx="2"/></g>';
      });
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#141414"/>' + bars +
        '<g transform="translate(' + padL + ',' + (h - 8) + ')"><rect width="12" height="8" fill="#22c55e"/><text x="16" y="8" font-size="10" fill="#aaa">Ativos</text><rect x="70" width="12" height="8" fill="#ef4444"/><text x="86" y="8" font-size="10" fill="#aaa">Cancelados</text></g></svg>';
      host.querySelectorAll('.sc-diff-row').forEach((g) => {
        g.addEventListener('mousemove', (evt) => scShowTip(g.getAttribute('data-tip') || '', evt));
        g.addEventListener('mouseleave', scHideTip);
      });
      if (narr) {
        const top = rows.find((d) => /reuni|meeting/i.test((d.id || '') + (d.label || ''))) || rows[0];
        narr.textContent = top
          ? ('Exemplo deste recorte: clientes ativos tiveram mediana de ' + scFormatValue(top.id, top.label, top.medianActive ?? top.activeMedian) + ' e cancelados tiveram mediana de ' + scFormatValue(top.id, top.label, top.medianCancelled ?? top.cancelledMedian) + ' em ' + (top.label || top.id) + '.')
          : '';
      }
    }`;
  if (html.includes(oldBars)) html = html.replace(oldBars, newBars);
  else console.warn("diff chart block not exact — manual check");
}

// NPS groups chart - values above bars
{
  const oldNps = `          bars += '<rect x="' + x + '" y="' + y + '" width="' + (bw * 0.8) + '" height="' + Math.max(1, bh) + '" fill="' + m.color + '" rx="2"/>';
        });
        bars += '<text x="' + (padL + gi * gW + gW / 2) + '" y="' + (h - 12) + '" text-anchor="middle" font-size="11" fill="#ccc">' + escapeHtml(g.label || g.class || '') + '</text>';
      });`;
  const newNps = `          bars += '<rect x="' + x + '" y="' + y + '" width="' + (bw * 0.8) + '" height="' + Math.max(1, bh) + '" fill="' + m.color + '" rx="2"/>' +
            '<text x="' + (x + bw * 0.4) + '" y="' + (y - 4) + '" text-anchor="middle" font-size="10" fill="#eee">' + v.toFixed(1).replace('.', ',') + '%</text>';
        });
        bars += '<text x="' + (padL + gi * gW + gW / 2) + '" y="' + (h - 12) + '" text-anchor="middle" font-size="11" fill="#ccc">' + escapeHtml(g.label || g.class || '') + '</text>';
      });`;
  if (html.includes(oldNps)) html = html.replace(oldNps, newNps);
}

// Rank bars legend note for blue/orange
{
  const oldRankEnd = `      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#141414"/>' + bars + '</svg>';
    }

    function scRenderGroupComparative(p) {`;
  const newRankEnd = `      host.innerHTML = '<div class="sc-assoc-legend"><span><i style="background:#f47920"></i> Positiva</span><span><i style="background:#3b82f6"></i> Negativa</span></div>' +
        '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#141414"/>' + bars + '</svg>' +
        '<p class="note-muted" style="margin:6px 0 0">Laranja: associação positiva. Azul: associação negativa (quando a variável aumenta, o indicador tende a diminuir).</p>';
    }

    function scRenderGroupComparative(p) {`;
  if (html.includes(oldRankEnd)) html = html.replace(oldRankEnd, newRankEnd);
}

// Inject new render helpers before scRenderExploratoryAll
{
  const mark = `    function scRenderExploratoryAll(p) {`;
  mustInclude(mark, "scRenderExploratoryAll");
  if (!html.includes("function scRenderActiveSignals")) {
    const helpers = `
    function scRenderActiveSignals(p) {
      const block = p.activeRiskSignals;
      const sum = document.getElementById('scSignalsSummary');
      const chart = document.getElementById('scSignalsChart');
      const table = document.getElementById('scSignalsTable');
      if (!block) return;
      if (sum) sum.textContent = (block.note || '') + ' Ativos com sinais listados: ' + (block.summary?.activeWithSignals ?? 0) + ' · EPs afetados: ' + (block.summary?.engineersAffected ?? 0) + ' · baseline cancelamento: ' + (block.baselinePct ?? '—') + '%.';
      if (chart) {
        const stats = (block.signalStats || []).slice(0, 8);
        if (!stats.length) chart.innerHTML = '<div class="empty" style="display:block">Nenhum sinal com suporte neste recorte.</div>';
        else {
          const w = 720, rowH = 28, padL = 220, padT = 10;
          const h = padT + stats.length * rowH + 20;
          const maxLift = Math.max(...stats.map((s) => Number(s.lift) || 1), 1.01);
          const bars = stats.map((s, i) => {
            const y = padT + i * rowH;
            const lift = Number(s.lift) || 1;
            const bw = ((lift - 1) / (maxLift - 1 || 1)) * 400 + 20;
            const tip = escapeHtml(s.label) + '<br/>Ativos com sinal: ' + s.activeClientsWithSignal + '<br/>Taxa observada: ' + (s.observedRatePct ?? '—') + '%<br/>Baseline: ' + (s.baselinePct ?? '—') + '%<br/>Lift: ' + (s.lift ?? '—') + '<br/>' + escapeHtml(s.caveat || '');
            return '<g class="sc-sig" data-tip="' + tip + '"><text x="' + (padL - 8) + '" y="' + (y + 14) + '" text-anchor="end" font-size="11" fill="#ccc">' + escapeHtml(s.label.slice(0, 32)) + '</text><rect x="' + padL + '" y="' + (y + 4) + '" width="' + bw + '" height="14" fill="#f59e0b" rx="2"/><text x="' + (padL + bw + 6) + '" y="' + (y + 15) + '" font-size="10" fill="#ddd">lift ' + (s.lift != null ? Number(s.lift).toFixed(2) : '—') + '</text></g>';
          }).join('');
          chart.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '"><rect width="' + w + '" height="' + h + '" fill="#141414"/>' + bars + '</svg>';
          chart.querySelectorAll('.sc-sig').forEach((g) => {
            g.addEventListener('mousemove', (evt) => scShowTip(g.getAttribute('data-tip') || '', evt));
            g.addEventListener('mouseleave', scHideTip);
          });
        }
      }
      if (table) {
        const rows = block.clients || [];
        table.innerHTML = rows.length
          ? '<table class="sc-top-table"><thead><tr><th>Cliente</th><th>EP</th><th>Segmento</th><th>Programa</th><th>Sinais</th><th class="num">Qtd</th><th>Intensidade</th><th>NPS</th><th class="num">Dias s/ reunião</th></tr></thead><tbody>' +
            rows.slice(0, 40).map((r) => '<tr><td>' + escapeHtml(r.clientName || '—') + '</td><td>' + escapeHtml(r.engineer || '—') + '</td><td>' + escapeHtml(r.segment || '—') + '</td><td>' + escapeHtml(r.program || '—') + '</td><td>' + escapeHtml((r.signals || []).join('; ')) + '</td><td class="num">' + r.signalCount + '</td><td>' + escapeHtml(r.intensity || '—') + '</td><td>' + escapeHtml(r.npsClass || '—') + '</td><td class="num">' + (r.daysSinceLastMeeting ?? '—') + '</td></tr>').join('') + '</tbody></table>'
          : '<p class="note-muted">Nenhum cliente ativo com os sinais configurados.</p>';
      }
    }

    function scRenderTopClients(p) {
      const top = p.topClients;
      const note = document.getElementById('scTopMethodNote');
      if (note && top?.methodology) {
        note.textContent = top.methodology.name + ': ' + top.methodology.note + ' Regra de programa: ' + top.methodology.programRule;
      }
      const renderTable = (hostId, bucket) => {
        const host = document.getElementById(hostId);
        if (!host) return;
        const rows = bucket?.rows || [];
        if (!rows.length) { host.innerHTML = '<p class="note-muted">Sem clientes elegíveis neste programa no recorte.</p>'; return; }
        host.innerHTML = '<table class="sc-top-table"><thead><tr><th>#</th><th>Cliente</th><th>Código</th><th>EP</th><th>Segmento</th><th>NPS</th><th class="num">Ciclo</th><th class="num">Reuniões</th><th class="num">Mec. impl.</th><th class="num">Índice</th><th>Sinais +</th></tr></thead><tbody>' +
          rows.map((r) => '<tr title="' + escapeHtml((r.alerts || []).join('; ')) + '"><td>' + r.rank + '</td><td>' + escapeHtml(r.clientName || '—') + '</td><td>' + escapeHtml(r.clientCode || '—') + '</td><td>' + escapeHtml(r.engineer || '—') + '</td><td>' + escapeHtml(r.segment || '—') + '</td><td>' + escapeHtml((r.npsClass || '—') + (r.npsScore != null ? ' (' + r.npsScore + ')' : '')) + '</td><td class="num">' + (r.currentCycle ?? '—') + '</td><td class="num">' + (r.meetingCount ?? '—') + '</td><td class="num">' + (r.implementedMechanismCount ?? '—') + '</td><td class="num">' + (r.exploratoryScore ?? '—') + '</td><td>' + escapeHtml((r.positiveSignals || []).slice(0, 3).join(', ')) + '</td></tr>').join('') + '</tbody></table>';
      };
      renderTable('scTopPharusTable', top?.pharus);
      renderTable('scTopDavosTable', top?.davos);
      const challenge = document.getElementById('scChallengeCohortNote');
      if (challenge) {
        const ch = p.challengeCohort;
        challenge.textContent = ch?.available === false
          ? ('Cohort de desafios: ' + (ch.reason || 'fonte indisponível.'))
          : '';
      }
    }

    function scRenderNpsComparative(p) {
      const m = p.npsComparative;
      const host = document.getElementById('scNpsCompHost');
      const narr = document.getElementById('scNpsCompNarration');
      if (!host || !m?.variables?.length) return;
      const mode = document.getElementById('scNpsCompMode')?.value || 'standardized';
      const cellW = 90, cellH = 30, labelW = 170, labelH = 70;
      const w = labelW + m.groups.length * cellW + 8;
      const h = labelH + m.variables.length * cellH + 8;
      const byKey = new Map((m.cells || []).map((c) => [c.varId + '||' + c.groupId, c]));
      let cells = '';
      m.variables.forEach((v, i) => {
        m.groups.forEach((g, j) => {
          const c = byKey.get(v.id + '||' + g.id);
          let raw = null;
          if (mode === 'value') raw = c?.value;
          else if (mode === 'diff') raw = c?.diffVsGlobal;
          else raw = c?.standardized;
          const colors = raw == null ? { fill: '#3a3a3a', text: '#bbb' } : scCorrColor(Math.max(-1, Math.min(1, Number(raw) / (mode === 'value' ? (Math.abs(Number(raw)) || 1) : 1))));
          const txt = raw == null ? '—' : (mode === 'value' ? String(Number(raw).toFixed(0)) : ((raw > 0 ? '+' : '') + Number(raw).toFixed(2).replace('.', ',')));
          const tip = escapeHtml(v.label) + ' · ' + escapeHtml(g.label) + '<br/>valor: ' + (c?.value ?? '—') + '<br/>n=' + (g.n ?? '—') + '<br/>cobertura: ' + (c?.coveragePercent ?? '—') + '%';
          const x = labelW + j * cellW, y = labelH + i * cellH;
          cells += '<g class="sc-axis-cell" data-tip="' + tip + '"><rect x="' + x + '" y="' + y + '" width="' + (cellW - 2) + '" height="' + (cellH - 2) + '" rx="2" fill="' + colors.fill + '"/><text x="' + (x + cellW / 2) + '" y="' + (y + cellH / 2 + 4) + '" text-anchor="middle" font-size="10" fill="' + colors.text + '">' + txt + '</text></g>';
        });
      });
      const colLabs = m.groups.map((g, j) => '<text transform="translate(' + (labelW + j * cellW + cellW / 2) + ',' + (labelH - 8) + ') rotate(-40)" text-anchor="start" font-size="10" fill="#bbb">' + escapeHtml(g.label) + ' (n=' + g.n + ')</text>').join('');
      const rowLabs = m.variables.map((v, i) => '<text x="' + (labelW - 6) + '" y="' + (labelH + i * cellH + cellH / 2 + 3) + '" text-anchor="end" font-size="10" fill="#ccc">' + escapeHtml(v.label) + '</text>').join('');
      host.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="' + Math.min(w, 900) + '" height="' + Math.min(h, 560) + '"><rect width="' + w + '" height="' + h + '" fill="#141414"/>' + colLabs + rowLabs + cells + '</svg>';
      host.querySelectorAll('.sc-axis-cell').forEach((g) => {
        g.addEventListener('mousemove', (evt) => scShowTip(g.getAttribute('data-tip') || '', evt));
        g.addEventListener('mouseleave', scHideTip);
      });
      if (narr) narr.textContent = (m.note || '') + (m.coverageWarning ? ' ' + m.coverageWarning : '');
    }

    function scExportTopCsv(bucket) {
      const rows = bucket?.rows || [];
      if (!rows.length) { alert('Sem linhas para exportar.'); return; }
      const headers = ['rank','clientName','clientCode','program','engineer','segment','npsClass','npsScore','currentCycle','meetingCount','implementedMechanismCount','exploratoryScore'];
      const lines = [headers.join(';')].concat(rows.map((r) => headers.map((h) => String(r[h] ?? '').replace(/;/g, ',')).join(';')));
      const blob = new Blob([lines.join('\\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'top-clientes-' + (bucket.label || 'export').toLowerCase().replace(/\\s+/g, '-') + '.csv';
      a.click();
    }

`;
    html = html.replace(mark, helpers + mark);
  }
}

// Extend exploratory all
html = html.replace(
  `      scRenderHealth(p);
      scBindZoomBars();
    }`,
  `      scRenderHealth(p);
      scRenderActiveSignals(p);
      scRenderTopClients(p);
      scRenderNpsComparative(p);
      scBindZoomBars();
    }`,
);

// Replace scExportReport with PDF generator — find function and replace whole body until next function
{
  const start = html.indexOf("    function scExportReport() {");
  const end = html.indexOf("\n    function renderStatisticalCrosses()");
  if (start < 0 || end < 0) throw new Error("scExportReport bounds missing");
  const PDF_FN = `    function scHumanFilters(p) {
      const f = p.filters || p.metadata?.filtersApplied || {};
      const mapStatus = { active_cancelled: 'Ativos e cancelados', all: 'Todos', active: 'Ativos', cancelled: 'Cancelados efetivados' };
      const yesNo = { yes: 'Sim', no: 'Não', all: 'Todos' };
      const lines = [];
      const add = (label, val) => {
        if (val == null || val === '' || val === 'null') return;
        lines.push(label + ': ' + val);
      };
      add('Status', mapStatus[f.status] || f.status || 'Ativos e cancelados');
      add('Segmento', f.segment === 'all' ? 'Todos' : (f.segment || 'Todos'));
      add('Engenheiro Patrimonial', f.engineer === 'all' ? 'Todos' : (f.engineer || 'Todos'));
      add('Possui reunião', yesNo[f.hasMeeting] || 'Todos');
      add('Possui NPS', yesNo[f.hasNps] || 'Todos');
      add('Renovação', yesNo[f.renewed] || 'Todos');
      add('Possui mecanismo', yesNo[f.hasMechanism] || 'Todos');
      add('Diagnóstico financeiro', yesNo[f.hasFinancial] || 'Todos');
      add('Amostra mínima', f.minSample != null ? String(f.minSample) : '5');
      add('Cobertura mínima', f.minCoverage != null ? (f.minCoverage + '%') : '30%');
      if (f.hireFrom || f.hireTo) add('Contratação', (f.hireFrom || '…') + ' → ' + (f.hireTo || '…'));
      return lines;
    }

    function scSvgToPngDataUrl(svgEl, scale = 2) {
      return new Promise((resolve) => {
        if (!svgEl) { resolve(null); return; }
        const xml = new XMLSerializer().serializeToString(svgEl);
        const svg64 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          const w = Math.max(svgEl.width?.baseVal?.value || svgEl.clientWidth || 720, 320);
          const h = Math.max(svgEl.height?.baseVal?.value || svgEl.clientHeight || 240, 160);
          canvas.width = w * scale;
          canvas.height = h * scale;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => resolve(null);
        img.src = svg64;
      });
    }

    async function scExportReport() {
      const p = scState.payload;
      const btn = document.querySelector('#scExportReport');
      if (!p) { alert('Carregue as análises antes de exportar.'); return; }
      if (!window.jspdf?.jsPDF) {
        alert('Biblioteca PDF não carregou. Verifique a conexão e recarregue a página.');
        return;
      }
      const prev = btn?.textContent;
      if (btn) { btn.disabled = true; btn.textContent = 'Gerando relatório…'; }
      try {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ unit: 'mm', format: 'a4' });
        const pageW = doc.internal.pageSize.getWidth();
        const pageH = doc.internal.pageSize.getHeight();
        const margin = 14;
        let y = margin;
        const ensure = (need = 12) => {
          if (y + need > pageH - 16) {
            doc.addPage();
            y = margin;
          }
        };
        const h1 = (t) => { ensure(16); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.setTextColor(20); doc.text(t, margin, y); y += 8; };
        const h2 = (t) => { ensure(14); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(30); doc.text(t, margin, y); y += 6; };
        const para = (t) => {
          if (!t) return;
          doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(40);
          const lines = doc.splitTextToSize(String(t), pageW - margin * 2);
          ensure(lines.length * 5 + 2);
          doc.text(lines, margin, y);
          y += lines.length * 5 + 2;
        };
        const bullet = (arr) => arr.forEach((line) => para('• ' + line));

        const s = p.summary || {};
        const day = (s.cutoffDate || new Date().toISOString().slice(0, 10));
        h1('Relatório — Análises Estatísticas');
        para('Fonte: BASE QV · Gerado em ' + new Date().toLocaleString('pt-BR') + ' · Timezone: America/Sao_Paulo');
        para('Período observado: ' + (s.observationPeriod?.from || '—') + ' → ' + (s.observationPeriod?.to || s.cutoffDate || '—'));
        h2('Filtros aplicados');
        bullet(scHumanFilters(p));

        h2('1. Resumo executivo');
        (p.simpleInsights || p.discoveries || []).slice(0, 8).forEach((d) => {
          para((d.title || '') + ' — ' + (d.text || ''));
        });

        h2('2. Base analítica e população');
        bullet([
          'Clientes analisados: ' + (s.analyzedClients ?? '—'),
          'Ativos: ' + (s.activeClients ?? '—'),
          'Cancelamentos efetivados: ' + (s.confirmedCancellations ?? '—'),
          'Renovados: ' + (s.renewedClients ?? '—'),
          'NPS válidas: ' + (s.validNpsResponses ?? '—'),
          'Cobertura média: ' + (s.averageCoverage ?? '—') + '%',
        ]);

        const addChart = async (title, sel, note) => {
          h2(title);
          if (note) para(note);
          const el = document.querySelector(sel);
          const svg = el?.querySelector?.('svg') || (el?.tagName === 'svg' ? el : null);
          const png = await scSvgToPngDataUrl(svg);
          if (png) {
            ensure(78);
            const imgW = pageW - margin * 2;
            const imgH = 62;
            doc.addImage(png, 'PNG', margin, y, imgW, imgH);
            y += imgH + 4;
          } else para('Gráfico indisponível neste recorte.');
        };

        await addChart('3–6. Cancelamento / ativos vs cancelados / AUC', '#scCancelMatrixHost', 'Matriz de associação com cancelamento.');
        await addChart('Ativos vs cancelados', '#scDiffChart', 'Verde = ativos · Vermelho = cancelados.');
        await addChart('AUC individual', '#scAucChart', 'AUC 0,50 sem discriminação; 0,70 sinal moderado. Não é causalidade.');
        await addChart('7–8. NPS', '#scNpsMatrixHost');
        await addChart('Promotores, Neutros e Detratores', '#scNpsGroupsChart');
        await addChart('Matriz comparativa NPS', '#scNpsCompHost');
        await addChart('9–10. Renovação', '#scRenewalMatrixHost');
        await addChart('Renovados vs não renovados', '#scRenewalDiffChart');
        await addChart('11. Permanência', '#scTenureMatrixHost');
        await addChart('12. Curva de sobrevivência', '#scSurvivalChart', document.querySelector('#scSurvivalNarration')?.textContent || '');
        await addChart('13. Cohort de retenção', '#scCohortHost', document.querySelector('#scCohortNote')?.textContent || '');

        h2('14. Clientes ativos com sinais detectados');
        para(p.activeRiskSignals?.note || '');
        bullet((p.activeRiskSignals?.signalStats || []).slice(0, 6).map((s) => s.label + ' — ativos: ' + s.activeClientsWithSignal + ' · lift ' + (s.lift ?? '—') + ' · taxa ' + (s.observedRatePct ?? '—') + '%'));
        para('Ressalva: padrões exploratórios, não previsão individual.');

        h2('15. Clientes de alta performance');
        (p.highPerformance?.groups || []).forEach((g) => para((g.label || '') + ': n=' + (g.n ?? '—') + ' · % cancelado ' + (g.cancelledPct ?? '—') + ' · reuniões medianas ' + (g.medianMeetings ?? '—')));

        h2('16–17. Top clientes Pharus / Davos');
        para(p.topClients?.methodology?.note || '');
        para('Pharus (top 5): ' + ((p.topClients?.pharus?.rows || []).slice(0, 5).map((r) => r.clientName + ' (' + r.exploratoryScore + ')').join('; ') || '—'));
        para('Davos (top 5): ' + ((p.topClients?.davos?.rows || []).slice(0, 5).map((r) => r.clientName + ' (' + r.exploratoryScore + ')').join('; ') || '—'));

        h2('18. Combinações de fatores de risco');
        bullet((p.riskRules || []).slice(0, 6).map((r) => r.label + ' — n=' + r.clients + ' · taxa ' + r.ratePct + '% · lift ' + r.lift));

        h2('19. Ranking preditivo');
        para(document.querySelector('#scPredictMeta')?.textContent || p.predictiveModel?.method || '');
        await addChart('Importância (holdout)', '#scPredictChart');

        h2('20. Candidatos ao Health Score MVP');
        (p.healthScoreCandidates || []).forEach((c) => para((c.label || c.id) + ' (' + (c.dimension || '') + ') — ' + (c.justification || '')));

        h2('21. Cobertura e qualidade');
        para('Cobertura média ' + (s.averageCoverage ?? '—') + '%. Cobertura NPS ' + (s.npsPortfolioCoverage ?? '—') + '%.');
        if (p.challengeCohort?.available === false) para('Cohort de desafios: ' + p.challengeCohort.reason);

        h2('22. Metodologia matemática');
        para('Spearman: correlação de postos, escala −1 a +1 (direção e força monotônica).');
        para('Ponto-bisserial: associação entre variável numérica e alvo binário (ex.: cancelamento).');
        para('V de Cramér: associação entre variáveis categóricas (0 a 1).');
        para('AUC: probabilidade de ordenar um cancelado acima de um ativo; 0,50 = aleatório.');
        para('Mediana: valor central do grupo (robusta a extremos).');
        para('Cobertura = clientes com valor válido / clientes elegíveis.');
        para('hasRenewed = currentCycle > 1 · renewalCount = max(currentCycle − 1, 0).');
        para('Lift = taxa do grupo / taxa da população.');
        para('Kaplan–Meier: sobrevivência com eventos (cancelamento com data) e censura (ativos até a data atual).');
        para('Cohort contratual: coorte = período de contratação; idade = meses de vida; futuros = não observáveis.');
        para('Modelo: regressão logística L2 + importância por permutação no holdout — não é causalidade.');

        h2('23. Limitações');
        bullet([
          'Associação não implica causalidade.',
          'Amostras pequenas e baixa cobertura reduzem estabilidade.',
          'NPS usa a resposta válida mais recente; cobertura pode ser baixa.',
          'Sinais em ativos são exploratórios, não previsão certa.',
          'Índice de alta performance e Health Score MVP são candidatos, não score oficial.',
        ]);

        h2('24. Glossário');
        bullet([
          'Correlação: direção e força da relação.',
          'AUC: separação individual entre grupos.',
          'Lift: quanto a taxa do grupo supera a média.',
          'Censura: cliente sem evento até a data de corte.',
          'Leakage: informação só disponível após o desfecho.',
        ]);

        // footer page numbers
        const pages = doc.getNumberOfPages();
        for (let i = 1; i <= pages; i += 1) {
          doc.setPage(i);
          doc.setFontSize(8);
          doc.setTextColor(120);
          doc.text('Análises Estatísticas · BASE QV · pág. ' + i + '/' + pages, margin, pageH - 8);
        }

        doc.save('relatorio-analises-estatisticas-' + day + '.pdf');
      } catch (err) {
        console.error(err);
        alert('Falha ao gerar PDF: ' + (err?.message || err));
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = prev || 'Exportar relatório'; }
      }
    }

`;
  html = html.slice(0, start) + PDF_FN + html.slice(end);
}

// loadStatisticalCrosses: cohortPeriod param
html = html.replace(
  `        params.set('cohortGranularity', cohortGran);
        if (scState.matrixVarIds?.length) params.set('matrixVars', scState.matrixVarIds.join(','));`,
  `        params.set('cohortGranularity', cohortGran);
        const cohortPeriod = document.querySelector('#scCohortPeriod')?.value || 'since_2025_01';
        params.set('cohortPeriod', cohortPeriod);
        if (scState.matrixVarIds?.length) params.set('matrixVars', scState.matrixVarIds.join(','));`,
);

// Listeners
if (!html.includes("scCohortPeriod')?.addEventListener")) {
  html = html.replace(
    `    document.querySelector('#scCohortGranularity')?.addEventListener('change', () => loadStatisticalCrosses());`,
    `    document.querySelector('#scCohortGranularity')?.addEventListener('change', () => loadStatisticalCrosses());
    document.querySelector('#scCohortPeriod')?.addEventListener('change', () => loadStatisticalCrosses());
    document.querySelector('#scNpsCompMode')?.addEventListener('change', () => { if (scState.payload) scRenderNpsComparative(scState.payload); });
    document.querySelector('#scExportPharusCsv')?.addEventListener('click', () => scExportTopCsv(scState.payload?.topClients?.pharus));
    document.querySelector('#scExportDavosCsv')?.addEventListener('click', () => scExportTopCsv(scState.payload?.topClients?.davos));`,
  );
}

// scExportReport is now async — listener ok as-is
html = html.replace(
  `document.querySelector('#scExportReport')?.addEventListener('click', scExportReport);`,
  `document.querySelector('#scExportReport')?.addEventListener('click', () => { scExportReport(); });`,
);

writeFileSync(path, html);
console.log("UI/PDF patch applied");
