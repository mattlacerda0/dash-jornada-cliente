/**
 * Melhora PDF (proporção, paisagem, interpretação humana) e destaca botão exportar.
 * Sem Git. Sem alteração de cálculos/banco.
 */
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const path = resolve(dirname(fileURLToPath(import.meta.url)), "..", "index.html");
let html = readFileSync(path, "utf8").replace(/\r\n/g, "\n");

// --- Button + sticky CSS ---
{
  const cssAnchor = `#view-statistical-crosses .sc-top-table th,#view-statistical-crosses .sc-top-table td{padding:4px 6px;white-space:nowrap}`;
  if (html.includes(cssAnchor) && !html.includes(".sc-export-primary")) {
    html = html.replace(
      cssAnchor,
      `${cssAnchor}
    #view-statistical-crosses .page-header{position:sticky;top:0;z-index:25;background:linear-gradient(180deg,rgba(18,18,18,.98),rgba(18,18,18,.92));backdrop-filter:blur(8px);padding-bottom:10px;margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,.06)}
    #view-statistical-crosses .sc-export-primary{
      display:inline-flex;align-items:center;gap:8px;padding:10px 16px;min-height:42px;
      background:#f47920;color:#111;border:1px solid #ff9a4a;border-radius:10px;
      font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 6px 18px rgba(244,121,32,.35);
      transition:transform .15s ease,box-shadow .15s ease,background .15s ease;
    }
    #view-statistical-crosses .sc-export-primary:hover{background:#ff8a3a;box-shadow:0 8px 22px rgba(244,121,32,.45);transform:translateY(-1px)}
    #view-statistical-crosses .sc-export-primary:disabled{opacity:.7;cursor:wait;transform:none;box-shadow:none}
    #view-statistical-crosses .sc-export-primary .sc-export-ico{width:16px;height:16px;flex:0 0 auto}
    #view-statistical-crosses .sc-export-primary.is-ok{background:#22c55e;border-color:#4ade80;color:#052e16}
    #view-statistical-crosses .sc-export-primary.is-err{background:#ef4444;border-color:#f87171;color:#fff}
    #view-statistical-crosses .btn-group .btn{align-self:center}
    @media(max-width:720px){
      #view-statistical-crosses .sc-export-primary{width:100%;justify-content:center}
      #view-statistical-crosses .page-header .btn-group{width:100%}
    }`,
    );
  }
}

// Button markup
html = html.replace(
  `<button class="btn" id="scExportReport" type="button" title="Baixa o PDF do relatório com o recorte atual">Exportar relatório</button>`,
  `<button class="sc-export-primary" id="scExportReport" type="button" title="Baixa o PDF com o recorte atual">
                  <svg class="sc-export-ico" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M12 18v-6"/><path d="M9 15l3 3 3-3"/></svg>
                  <span class="sc-export-label">Exportar relatório em PDF</span>
                </button>`,
);

// Replace from scHumanFilters through end of scExportReport (before renderStatisticalCrosses)
const start = html.indexOf("    function scHumanFilters(p) {");
const end = html.indexOf("\n    function renderStatisticalCrosses()");
if (start < 0 || end < 0) throw new Error("export function bounds missing");

const NEW = `    function scHumanFilters(p) {
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

    function scSvgNaturalSize(svgEl) {
      if (!svgEl) return { w: 720, h: 280 };
      const vb = (svgEl.getAttribute('viewBox') || '').trim().split(/[\\s,]+/).map(Number);
      if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) return { w: vb[2], h: vb[3] };
      const wAttr = Number(svgEl.getAttribute('width'));
      const hAttr = Number(svgEl.getAttribute('height'));
      if (wAttr > 0 && hAttr > 0) return { w: wAttr, h: hAttr };
      const bb = typeof svgEl.getBBox === 'function' ? svgEl.getBBox() : null;
      if (bb && bb.width > 0 && bb.height > 0) return { w: bb.width, h: bb.height };
      return {
        w: Math.max(svgEl.clientWidth || 0, svgEl.width?.baseVal?.value || 0, 720),
        h: Math.max(svgEl.clientHeight || 0, svgEl.height?.baseVal?.value || 0, 240)
      };
    }

    function scCloneSvgForExport(svgEl) {
      if (!svgEl) return null;
      const clone = svgEl.cloneNode(true);
      clone.removeAttribute('style');
      clone.style.transform = 'none';
      clone.style.maxWidth = 'none';
      const size = scSvgNaturalSize(svgEl);
      clone.setAttribute('width', String(size.w));
      clone.setAttribute('height', String(size.h));
      if (!clone.getAttribute('viewBox')) clone.setAttribute('viewBox', '0 0 ' + size.w + ' ' + size.h);
      // light print-friendly background
      const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      bg.setAttribute('x', '0'); bg.setAttribute('y', '0');
      bg.setAttribute('width', String(size.w)); bg.setAttribute('height', String(size.h));
      bg.setAttribute('fill', '#ffffff');
      clone.insertBefore(bg, clone.firstChild);
      // dark text/axes → darker for print where fill is light gray
      clone.querySelectorAll('[fill="#141414"],[fill="#111"]').forEach((n) => n.setAttribute('fill', '#ffffff'));
      return { clone, size };
    }

    function scSvgToPngDataUrl(svgEl, scale = 2.5) {
      return new Promise((resolve) => {
        if (!svgEl) { resolve(null); return; }
        const prepared = scCloneSvgForExport(svgEl);
        if (!prepared) { resolve(null); return; }
        const { clone, size } = prepared;
        const xml = new XMLSerializer().serializeToString(clone);
        const svg64 = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml);
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(size.w * scale));
          canvas.height = Math.max(1, Math.round(size.h * scale));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({ dataUrl: canvas.toDataURL('image/png'), width: size.w, height: size.h });
        };
        img.onerror = () => resolve(null);
        img.src = svg64;
      });
    }

    function scPickSvg(sel) {
      const el = document.querySelector(sel);
      if (!el) return null;
      // Prefer direct SVG, never capture zoom stage with controls
      if (el.tagName && el.tagName.toLowerCase() === 'svg') return el;
      const inner = el.querySelector('.sc-zoom-inner svg') || el.querySelector('svg');
      return inner || null;
    }

    function scFitImageMm(naturalW, naturalH, maxW, maxH) {
      const scale = Math.min(maxW / naturalW, maxH / naturalH);
      return { w: naturalW * scale, h: naturalH * scale };
    }

    function scBuildChartStory(key, p) {
      const s = p.summary || {};
      const insights = p.simpleInsights || p.discoveries || [];
      const find = (re) => insights.find((d) => re.test((d.title || '') + ' ' + (d.text || '') + ' ' + (d.id || '')));
      const stories = {
        cancelMatrix: {
          see: 'Este mapa mostra quais indicadores aparecem mais ligados ao cancelamento neste recorte.',
          indicate: (find(/reuni|contato|cancel/i)?.text) || 'Alguns indicadores se destacam mais do que outros na comparação com cancelamento.',
          matter: 'Isso ajuda a priorizar o que acompanhar no dia a dia, sem afirmar causa.',
          caveat: 'Padrão observado — não comprova causalidade.'
        },
        diff: {
          see: 'Este gráfico compara a mediana dos clientes ativos (verde) com a dos cancelados (vermelho).',
          indicate: (find(/reuni/i)?.text) || (document.querySelector('#scDiffNarration')?.textContent || 'Há diferenças de mediana entre os dois grupos em alguns indicadores.'),
          matter: 'Diferenças grandes sugerem sinais úteis para acompanhamento preventivo.',
          caveat: 'Associação observada; não prova que o indicador causou o cancelamento.'
        },
        auc: {
          see: 'Este gráfico mostra o quanto cada indicador, sozinho, ajuda a separar cancelados de não cancelados.',
          indicate: 'Quanto mais a barra se afasta de 0,50, mais o indicador separa os grupos neste recorte.',
          matter: 'Serve para priorizar variáveis candidatas a monitoramento — não é a taxa de acerto de um modelo completo.',
          caveat: 'Sinais fortes devem ser revisados para garantir que não usam informação só disponível após o cancelamento.'
        },
        nps: {
          see: 'Este mapa relaciona a nota NPS com outros indicadores da jornada.',
          indicate: (find(/nps|promo|detrat/i)?.text) || 'Alguns indicadores acompanham a nota de satisfação neste recorte.',
          matter: 'Ajuda a entender o contexto dos clientes mais e menos satisfeitos.',
          caveat: (s.npsPortfolioCoverage != null && s.npsPortfolioCoverage < 30)
            ? ('Cobertura de NPS em torno de ' + String(s.npsPortfolioCoverage).replace('.', ',') + '% — tratar como sinal inicial.')
            : 'Associação observada, não causalidade.'
        },
        npsGroups: {
          see: 'Comparamos Promotores, Neutros e Detratores em cancelamento e renovação.',
          indicate: (find(/promo|detrat/i)?.text) || 'As classes de NPS apresentam comportamentos diferentes neste recorte.',
          matter: 'Útil para comunicação e priorização de cuidado, com cautela pela cobertura do NPS.',
          caveat: 'Poucos clientes com NPS reduzem a confiança da comparação.'
        },
        renewal: {
          see: 'Este mapa mostra indicadores associados à renovação (ciclo 2 ou superior).',
          indicate: (find(/renov/i)?.text) || 'Alguns indicadores aparecem mais fortes entre quem renovou.',
          matter: 'Ajuda a descrever o perfil de quem permanece e renova.',
          caveat: 'Não afirma que o indicador causou a renovação.'
        },
        tenure: {
          see: 'Este mapa relaciona a permanência em dias com outros indicadores.',
          indicate: 'Alguns fatores acompanham tempos de permanência maiores ou menores neste recorte.',
          matter: 'Complementa a leitura de retenção, sem substituir a curva de permanência.',
          caveat: 'Leitura descritiva; diferente da análise de evento de cancelamento.'
        },
        survival: {
          see: 'A curva estima a chance de o cliente continuar na carteira ao longo do tempo desde a contratação.',
          indicate: (find(/12 meses|permanência estimada|sobreviv/i)?.text) || (document.querySelector('#scSurvivalNarration')?.textContent || 'A curva mostra a permanência estimada ao longo dos meses.'),
          matter: 'Ajuda a planejar acompanhamento em marcos como 3, 6 e 12 meses.',
          caveat: 'Clientes ainda ativos no fim do período continuam na análise sem serem tratados como cancelados.'
        },
        cohort: {
          see: 'Cada coluna reúne clientes que começaram no mesmo mês. As linhas mostram quantos seguem na carteira depois de 1, 2, 3 meses…',
          indicate: (document.querySelector('#scCohortNote')?.textContent || 'Cores e percentuais mostram a retenção por idade da coorte.'),
          matter: 'Permite ver se coortes recentes estão retendo melhor ou pior ao longo do tempo.',
          caveat: 'Coortes recentes ainda não têm tempo suficiente para comparar 12 meses.'
        },
        predict: {
          see: 'Este ranking mostra quais indicadores mais ajudaram a separar grupos no teste fora da amostra.',
          indicate: 'Os primeiros da lista tiveram maior contribuição relativa neste recorte.',
          matter: 'Orienta o que merece validação operacional — não é prova de causa.',
          caveat: 'Importância do modelo não deve ser lida como causalidade.'
        }
      };
      return stories[key] || { see: '', indicate: '', matter: '', caveat: 'Associação observada, não causalidade.' };
    }

    function scSetExportBtn(state, label) {
      const btn = document.querySelector('#scExportReport');
      if (!btn) return;
      const span = btn.querySelector('.sc-export-label');
      btn.classList.remove('is-ok', 'is-err');
      if (state === 'loading') {
        btn.disabled = true;
        if (span) span.textContent = label || 'Gerando relatório…';
      } else if (state === 'ok') {
        btn.disabled = false;
        btn.classList.add('is-ok');
        if (span) span.textContent = label || 'Relatório baixado';
        setTimeout(() => {
          btn.classList.remove('is-ok');
          if (span) span.textContent = 'Exportar relatório em PDF';
        }, 2500);
      } else if (state === 'err') {
        btn.disabled = false;
        btn.classList.add('is-err');
        if (span) span.textContent = label || 'Não foi possível gerar o relatório';
        setTimeout(() => {
          btn.classList.remove('is-err');
          if (span) span.textContent = 'Exportar relatório em PDF';
        }, 3500);
      } else {
        btn.disabled = false;
        if (span) span.textContent = 'Exportar relatório em PDF';
      }
    }

    async function scExportReport() {
      const p = scState.payload;
      const btn = document.querySelector('#scExportReport');
      if (!p) { alert('Carregue as análises antes de exportar.'); return; }
      if (btn?.disabled) return;
      if (!window.jspdf?.jsPDF) {
        scSetExportBtn('err');
        alert('Biblioteca PDF não carregou. Verifique a conexão e recarregue a página.');
        return;
      }
      scSetExportBtn('loading');
      // reset zoom transforms that could affect DOM size reads
      const zoomBackup = {};
      document.querySelectorAll('#view-statistical-crosses .sc-zoom-inner').forEach((el, i) => {
        zoomBackup[i] = el.style.transform;
        el.style.transform = 'none';
      });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      try {
        const { jsPDF } = window.jspdf;
        let doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
        let orient = 'portrait';
        let pageW = doc.internal.pageSize.getWidth();
        let pageH = doc.internal.pageSize.getHeight();
        const margin = 14;
        const footerH = 12;
        const headerH = 10;
        let y = margin + headerH;

        const syncSize = () => {
          pageW = doc.internal.pageSize.getWidth();
          pageH = doc.internal.pageSize.getHeight();
        };
        const newPage = (orientation) => {
          const next = orientation || orient;
          doc.addPage('a4', next);
          orient = next;
          syncSize();
          y = margin + headerH;
        };
        const ensureSpace = (need, orientation) => {
          if (orientation && orientation !== orient) {
            newPage(orientation);
            return;
          }
          if (y + need > pageH - footerH - 4) newPage(orient);
        };
        const paintBrandLine = () => {
          doc.setDrawColor(244, 121, 32);
          doc.setLineWidth(0.8);
          doc.line(margin, y, pageW - margin, y);
          y += 5;
        };
        const h1 = (t) => {
          ensureSpace(18);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(18);
          doc.setTextColor(24, 24, 24);
          doc.text(t, margin, y);
          y += 7;
          paintBrandLine();
        };
        const h2 = (t) => {
          ensureSpace(16);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(13);
          doc.setTextColor(30, 30, 30);
          doc.text(t, margin, y);
          y += 6;
          doc.setDrawColor(230, 230, 230);
          doc.setLineWidth(0.3);
          doc.line(margin, y, pageW - margin, y);
          y += 4;
        };
        const para = (t, opts = {}) => {
          if (!t) return;
          doc.setFont('helvetica', opts.bold ? 'bold' : 'normal');
          doc.setFontSize(opts.size || 10);
          doc.setTextColor(opts.color || 45);
          const lines = doc.splitTextToSize(String(t), pageW - margin * 2);
          ensureSpace(lines.length * 4.8 + 2);
          doc.text(lines, margin, y);
          y += lines.length * 4.8 + 2;
        };
        const label = (t) => {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(244, 121, 32);
          ensureSpace(6);
          doc.text(String(t).toUpperCase(), margin, y);
          y += 4.5;
        };
        const card = (title, value, subtitle) => {
          ensureSpace(20);
          doc.setFillColor(248, 248, 248);
          doc.setDrawColor(230, 230, 230);
          doc.roundedRect(margin, y - 4, pageW - margin * 2, 16, 2, 2, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          doc.setTextColor(100);
          doc.text(title, margin + 3, y + 1);
          doc.setFontSize(13);
          doc.setTextColor(20);
          doc.text(String(value), margin + 3, y + 8);
          if (subtitle) {
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(110);
            doc.text(subtitle, margin + 55, y + 8);
          }
          y += 18;
        };
        const bulletSafe = (arr) => { (arr || []).forEach((line) => para('• ' + line)); };
        const storyBlock = (story) => {
          if (!story) return;
          label('O que estamos vendo');
          para(story.see);
          label('O que os dados indicam');
          para(story.indicate);
          label('Por que isso importa');
          para(story.matter);
          if (story.caveat) {
            doc.setFont('helvetica', 'italic');
            doc.setFontSize(8.5);
            doc.setTextColor(110);
            const lines = doc.splitTextToSize('Ressalva: ' + story.caveat, pageW - margin * 2);
            ensureSpace(lines.length * 4 + 2);
            doc.text(lines, margin, y);
            y += lines.length * 4 + 3;
          }
        };

        const addChartBlock = async ({ title, sel, storyKey, landscape = false, maxHRatio = 0.42 }) => {
          const want = landscape ? 'landscape' : 'portrait';
          const story = scBuildChartStory(storyKey, p);
          // Reserve space for title + short story headers; chart itself checked separately
          ensureSpace(28, want);
          h2(title);
          storyBlock(story);
          const svg = scPickSvg(sel);
          const captured = await scSvgToPngDataUrl(svg, 2.5);
          if (!captured?.dataUrl) {
            para('Gráfico indisponível neste recorte.');
            return;
          }
          const maxW = pageW - margin * 2;
          const maxH = Math.min((pageH - footerH - y - 6), pageH * maxHRatio);
          // If remaining height is too small for a readable chart, new page
          const minReadable = landscape ? 55 : 45;
          if (maxH < minReadable) {
            newPage(want);
            h2(title);
            storyBlock(story);
          }
          const availH = Math.min((pageH - footerH - y - 6), pageH * (landscape ? 0.62 : maxHRatio));
          const fit = scFitImageMm(captured.width, captured.height, maxW, Math.max(availH, minReadable));
          // If still doesn't fit remaining space, force new page then refit
          if (y + fit.h > pageH - footerH - 4) {
            newPage(want);
            h2(title);
            storyBlock(story);
          }
          const availH2 = Math.min((pageH - footerH - y - 6), pageH * (landscape ? 0.7 : 0.55));
          const fit2 = scFitImageMm(captured.width, captured.height, maxW, availH2);
          const x = margin + (maxW - fit2.w) / 2;
          doc.addImage(captured.dataUrl, 'PNG', x, y, fit2.w, fit2.h, undefined, 'FAST');
          y += fit2.h + 5;
        };

        const s = p.summary || {};
        const day = (s.cutoffDate || new Date().toISOString().slice(0, 10));

        // CAPA
        y = margin + 20;
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(22);
        doc.setTextColor(20);
        doc.text('Análises Estatísticas', margin, y);
        y += 10;
        doc.setFontSize(12);
        doc.setTextColor(244, 121, 32);
        doc.text('Jornada do Cliente · BASE QV', margin, y);
        y += 8;
        paintBrandLine();
        para('Relatório gerado em ' + new Date().toLocaleString('pt-BR') + '.');
        para('Período observado: ' + (s.observationPeriod?.from || '—') + ' → ' + (s.observationPeriod?.to || s.cutoffDate || '—') + '.');
        label('Filtros aplicados');
        scHumanFilters(p).forEach((line) => para('• ' + line));
        y += 2;
        label('Resumo da carteira');
        card('Clientes analisados', String(s.analyzedClients ?? '—'), 'população do recorte');
        card('Cancelamentos', String(s.confirmedCancellations ?? '—'), 'efetivados');
        card('Renovados', String(s.renewedClients ?? '—'), 'ciclo > 1');
        card('Cobertura NPS', (s.npsPortfolioCoverage != null ? String(s.npsPortfolioCoverage).replace('.', ',') + '%' : '—'), 'respostas válidas');

        newPage('portrait');
        h1('Principais descobertas');
        para('Leitura simples do que os dados mostram neste recorte. Números vêm das análises já calculadas — sem inventar conclusões.');
        (p.simpleInsights || p.discoveries || []).slice(0, 10).forEach((d, i) => {
          ensureSpace(22);
          doc.setFillColor(252, 252, 252);
          doc.setDrawColor(235, 235, 235);
          doc.roundedRect(margin, y - 3, pageW - margin * 2, 18, 2, 2, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10);
          doc.setTextColor(20);
          doc.text((i + 1) + '. ' + (d.title || 'Descoberta'), margin + 3, y + 2);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(9);
          doc.setTextColor(60);
          const body = (d.text || '') + (d.primaryValue ? ('  ·  Número principal: ' + d.primaryValue) : '');
          const lines = doc.splitTextToSize(body, pageW - margin * 2 - 6);
          doc.text(lines.slice(0, 2), margin + 3, y + 8);
          y += 20;
          if (d.lowConfidence || /cobertura|cautela/i.test(d.caveat || '')) {
            para('Atenção: cobertura ou amostra limitada neste ponto.');
          }
        });

        await addChartBlock({ title: 'Cancelamento — mapa de relações', sel: '#scCancelMatrixHost', storyKey: 'cancelMatrix', landscape: true, maxHRatio: 0.55 });
        await addChartBlock({ title: 'Ativos vs cancelados', sel: '#scDiffChart', storyKey: 'diff', landscape: false, maxHRatio: 0.5 });
        await addChartBlock({ title: 'Quanto cada indicador separa os grupos', sel: '#scAucChart', storyKey: 'auc', landscape: false, maxHRatio: 0.5 });
        await addChartBlock({ title: 'NPS — relações com a satisfação', sel: '#scNpsMatrixHost', storyKey: 'nps', landscape: true });
        await addChartBlock({ title: 'Promotores, Neutros e Detratores', sel: '#scNpsGroupsChart', storyKey: 'npsGroups' });
        await addChartBlock({ title: 'Renovação — relações observadas', sel: '#scRenewalMatrixHost', storyKey: 'renewal', landscape: true });
        await addChartBlock({ title: 'Permanência — relações observadas', sel: '#scTenureMatrixHost', storyKey: 'tenure', landscape: true });
        await addChartBlock({ title: 'Permanência ao longo do tempo', sel: '#scSurvivalChart', storyKey: 'survival', landscape: false, maxHRatio: 0.48 });
        await addChartBlock({ title: 'Retenção por mês de entrada', sel: '#scCohortHost', storyKey: 'cohort', landscape: true, maxHRatio: 0.7 });

        newPage('portrait');
        h2('Clientes ativos com sinais de atenção');
        para('Alguns clientes ainda ativos apresentam combinações que, neste recorte, aparecem mais entre cancelados. Isso não significa que esses clientes vão cancelar.');
        bulletSafe((p.activeRiskSignals?.signalStats || []).slice(0, 6).map((s) => s.label + ': ' + s.activeClientsWithSignal + ' ativos · taxa observada ' + (s.observedRatePct ?? '—') + '%'));

        h2('Alta performance e destaques');
        (p.highPerformance?.groups || []).forEach((g) => {
          para((g.label || '') + ' — ' + (g.n ?? '—') + ' clientes' + (g.medianMeetings != null ? (', mediana de ' + g.medianMeetings + ' reuniões') : '') + '.');
        });
        para('Top Pharus: ' + ((p.topClients?.pharus?.rows || []).slice(0, 5).map((r) => r.clientName).join(', ') || '—'));
        para('Top Davos: ' + ((p.topClients?.davos?.rows || []).slice(0, 5).map((r) => r.clientName).join(', ') || '—'));

        await addChartBlock({ title: 'Prioridades do modelo de validação', sel: '#scPredictChart', storyKey: 'predict' });

        h2('Candidatos a um indicador operacional (MVP)');
        (p.healthScoreCandidates || []).forEach((c) => {
          para((c.label || c.id) + ' — ' + (c.dimension || '') + '. ' + (c.justification || '').replace(/AUC|assoc\\.|Spearman|ponto-bisserial/gi, '').trim());
        });

        newPage('portrait');
        h1('Apêndice técnico');
        para('Esta parte é opcional. A leitura principal do relatório usa linguagem simples; abaixo estão os métodos.');
        para('Métodos: correlação de postos, associação numérica–binária, associação entre categorias, separação individual (AUC), mediana, cobertura, renovação por ciclo, curva de permanência com clientes ainda ativos até a data de corte, retenção por coorte e modelo regularizado com teste fora da amostra.');
        para('Renovação: cliente renovado quando o ciclo atual é maior que 1.');
        para('Cobertura: percentual de clientes com informação válida.');
        para('Cliente ainda ativo na data de corte permanece na curva de permanência sem ser tratado como cancelado.');
        h2('Limitações');
        ['Associações não comprovam causalidade.', 'Amostras pequenas e baixa cobertura reduzem a estabilidade.', 'NPS pode ter cobertura limitada.', 'Sinais em ativos são exploratórios.', 'O índice de alta performance não é um score oficial.'].forEach((t) => para('• ' + t));
        h2('Glossário');
        para('Cancelado efetivado: cliente com regra oficial de churn/distrato.');
        para('Cliente ainda ativo na data de corte: permanece na análise de permanência sem evento de cancelamento.');
        para('Lift: quanto a taxa de um grupo supera a média do recorte.');

        // Headers/footers
        const pages = doc.getNumberOfPages();
        for (let i = 1; i <= pages; i += 1) {
          doc.setPage(i);
          const w = doc.internal.pageSize.getWidth();
          const h = doc.internal.pageSize.getHeight();
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8);
          doc.setTextColor(120);
          doc.text('Análises Estatísticas — Jornada do Cliente', margin, 8);
          doc.setDrawColor(244, 121, 32);
          doc.setLineWidth(0.4);
          doc.line(margin, 10, w - margin, 10);
          doc.setTextColor(130);
          doc.text('Fonte: BASE QV · ' + new Date().toLocaleDateString('pt-BR') + ' · Associações não comprovam causalidade.', margin, h - 6);
          doc.text('Página ' + i + ' de ' + pages, w - margin, h - 6, { align: 'right' });
        }

        doc.save('relatorio-analises-estatisticas-' + day + '.pdf');
        scSetExportBtn('ok');
      } catch (err) {
        console.error(err);
        scSetExportBtn('err');
        alert('Não foi possível gerar o relatório: ' + (err?.message || err));
      } finally {
        document.querySelectorAll('#view-statistical-crosses .sc-zoom-inner').forEach((el, i) => {
          if (zoomBackup[i] != null) el.style.transform = zoomBackup[i];
        });
      }
    }

`;

html = html.slice(0, start) + NEW + html.slice(end);

writeFileSync(path, html);
console.log("PDF export + button polish applied");
