const fmt = new Intl.NumberFormat('pt-BR');

export function execPct(v) {
  return v == null || !Number.isFinite(v) ? '—' : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
}

export function execNum(v) {
  return v == null || !Number.isFinite(v) ? '—' : fmt.format(Math.round(v));
}

export function execDays(v) {
  return v == null || !Number.isFinite(v) ? '—' : `${Math.round(v)} d`;
}

export function execDateBR(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('pt-BR');
}

function healthDot(status) {
  if (!status || status === 'neutral') return '';
  return `<span class="exec-health exec-health--${status}" title="Saúde: ${status}"></span>`;
}

function metricRow(label, value) {
  return `<div class="exec-metric-row"><span>${label}</span><span>${value ?? '—'}</span></div>`;
}

function renderDonut(items) {
  const total = items.reduce((s, i) => s + (i.count || 0), 0) || 1;
  let acc = 0;
  const stops = items.map((item) => {
    const start = (acc / total) * 100;
    acc += item.count || 0;
    const end = (acc / total) * 100;
    return `${item.color} ${start}% ${end}%`;
  }).join(', ');
  const legend = items.map((item) => `
    <div class="exec-legend-item">
      <span class="exec-legend-dot" style="background:${item.color}"></span>
      <span>${item.label}: ${execNum(item.count)} (${execPct(item.percent)})</span>
    </div>`).join('');
  return `<div class="exec-donut-wrap"><div class="exec-donut" style="background:conic-gradient(${stops})"></div><div class="exec-legend">${legend}</div></div>`;
}

function renderBars(items) {
  const colors = { Promotores: '#42c985', Neutros: '#f6bd4b', Detratores: '#ef6b73' };
  return items.map((item) => `
    <div class="exec-hbar">
      <span>${item.label}</span>
      <div class="exec-hbar-track"><div class="exec-hbar-fill" style="width:${item.percent || 0}%;background:${colors[item.label] || '#69a8ff'}"></div></div>
      <span>${execPct(item.percent)}</span>
    </div>`).join('');
}

function funnelRate(value) {
  if (value == null) return '—';
  if (typeof value === 'object') return value.label ?? '—';
  return value;
}

export function renderExecutiveView(data) {
  const ns = data.northStar || {};
  const b = data.blocks || {};
  const r = data.risk || {};
  const p = b.portfolio || {};
  const j = b.journey || {};
  const e = b.engagement || {};
  const s = b.satisfaction || {};
  const funnel = r.funnel || {};

  return `
    <section class="exec-north-star" aria-label="North Star">
      <article class="metric exec-kpi exec-kpi--primary">${healthDot(ns.activeClients?.health)}<div class="metric-label">Clientes ativos</div><div class="metric-value">${execNum(ns.activeClients?.value)}</div><div class="metric-note">Base operacional</div></article>
      <article class="metric exec-kpi exec-kpi--primary">${healthDot(ns.nps?.health)}<div class="metric-label">NPS</div><div class="metric-value">${ns.nps?.value == null ? '—' : (ns.nps.value > 0 ? `+${ns.nps.value}` : ns.nps.value)}</div><div class="metric-note">Promotores − Detratores</div></article>
      <article class="metric exec-kpi exec-kpi--primary">${healthDot(ns.renewalRate?.health)}<div class="metric-label">Taxa de renovação</div><div class="metric-value">${execPct(ns.renewalRate?.value)}</div><div class="metric-note">${execNum(ns.renewalRate?.renewedClients)} clientes renovados</div></article>
      <article class="metric exec-kpi"><div class="metric-label">Permanência mediana</div><div class="metric-value">${ns.typicalStayDays?.label || execDays(ns.typicalStayDays?.value)}</div><div class="metric-note">Tempo na carteira</div></article>
      <article class="metric exec-kpi"><div class="metric-label">Cancelamentos efetivados</div><div class="metric-value">${execNum(ns.effectiveCancellations?.value)}</div><div class="metric-note">Saídas confirmadas</div></article>
    </section>

    <section class="exec-blocks" aria-label="Blocos temáticos">
      <article class="exec-block"><h2>Carteira</h2>
        ${metricRow('Total de clientes', execNum(p.totalClients))}
        ${metricRow('Congelados', execNum(p.frozenClients))}
        ${metricRow('Em processo de cancelamento', execNum(p.inCancellationProcess))}
        ${metricRow('Diagnóstico financeiro', execPct(p.financialProfilePercent))}
        ${metricRow('Segmento dominante', p.dominantSegment || '—')}
      </article>
      <article class="exec-block"><h2>Entrega da jornada</h2>
        ${metricRow('Concluíram onboarding', execPct(j.completedOnboardingPercent))}
        ${metricRow('Mediana até 1ª reunião', execDays(j.typicalFirstMeetingDays))}
        ${metricRow('Plano entregue', execPct(j.planDeliveredPercent))}
        ${metricRow('Taxa de comparecimento', execPct(j.attendanceRate))}
        ${metricRow('Mecanismos implementados', execPct(j.implementationPercent))}
      </article>
      <article class="exec-block"><h2>Engajamento digital</h2>
        ${metricRow('Login no App Pharus', execPct(e.loginCoverage))}
        ${metricRow('Dias desde último acesso', execDays(e.typicalDaysSinceLastAccess))}
        ${metricRow('Financeiro atualizado (30d)', execPct(e.updatedLast30DaysPercent))}
        ${metricRow('Financeiro desatualizado (90d+)', execPct(e.outdatedOver90DaysPercent))}
      </article>
      <article class="exec-block"><h2>Satisfação e atendimento</h2>
        ${metricRow('CSAT médio', s.csatAverage == null ? '—' : s.csatAverage.toLocaleString('pt-BR', { maximumFractionDigits: 1 }))}
        ${metricRow('CSAT satisfeitos (nota 5)', execPct(s.csatSatisfiedPercent))}
        ${metricRow('Taxa de resposta NPS', execPct(s.npsResponseRate))}
        ${metricRow('Acionamentos de suporte', execNum(s.totalTickets))}
        ${metricRow('Acionamentos urgentes', execNum(s.urgentTickets))}
        ${metricRow('Identificação do cliente', execPct(s.identificationCoverage))}
      </article>
    </section>

    <section class="exec-risk" aria-label="Risco e retenção">
      <h2>Risco e retenção — onde agir agora</h2>
      <div class="exec-risk-grid">
        <div>
          <div class="exec-funnel">
            <span class="exec-funnel-step">Intenções: ${execNum(funnel.intentions)}</span>
            <span class="exec-funnel-arrow">→</span>
            <span class="exec-funnel-step">Pedidos: ${execNum(funnel.orders)}</span>
            <span class="exec-funnel-arrow">→</span>
            <span class="exec-funnel-step">Efetivados: ${execNum(funnel.effective)}</span>
          </div>
          <p class="exec-funnel-note">Conversão intenção→pedido: ${funnelRate(funnel.rateIntentionToOrder)} · intenção→efetivado: ${funnelRate(funnel.rateIntentionToEffective)}</p>
        </div>
        <div class="exec-alerts">
          <div class="exec-alert"><strong>Clientes ativos com sinais de risco</strong><p>${execNum(r.activeClientsWithSignals)} (${execPct(r.activeClientsWithSignalsPercent)} da base ativa)</p></div>
          <div class="exec-alert"><strong>Em processo de cancelamento</strong><p>${execNum(r.inCancellationProcess)} clientes</p></div>
          <div class="exec-alert"><strong>Top motivo de cancelamento</strong><p>${r.topCancellationReason || '—'}</p></div>
        </div>
        <div class="exec-insight"><strong>Insight #1</strong><br>${r.insight || 'Insight estatístico indisponível no momento.'}</div>
      </div>
    </section>

    <section class="exec-charts" aria-label="Visualizações">
      <article class="chart-card"><h3>Composição da carteira</h3>${renderDonut(data.charts?.portfolioComposition || [])}</article>
      <article class="chart-card"><h3>NPS por classificação</h3>${renderBars(data.charts?.npsClassification || [])}</article>
    </section>

    <footer class="exec-footer">
      <span>Snapshot da carteira · ${execDateBR(data.generatedAt)}</span>
    </footer>`;
}
