    /* -------- Performance dos EPs -------- */
    const epState = {
      payload: null, page: 1, pageSize: 25, sortKey: 'totalClients', sortDir: 'desc',
      loading: false, requestId: 0
    };
    const epFilters = {
      search: document.querySelector('#epSearch'),
      engineer: document.querySelector('#epEngineer'),
      status: document.querySelector('#epStatusFilter'),
      segment: document.querySelector('#epSegment'),
      period: document.querySelector('#epPeriod'),
      from: document.querySelector('#epFrom'),
      to: document.querySelector('#epTo'),
      portfolio: document.querySelector('#epPortfolio'),
      hasCancel: document.querySelector('#epHasCancel'),
      hasMeeting: document.querySelector('#epHasMeeting'),
      hideSmall: document.querySelector('#epHideSmall')
    };

    function epMedian(values) {
      const nums = values.filter(v => v != null && Number.isFinite(v)).slice().sort((a, b) => a - b);
      if (!nums.length) return null;
      const mid = Math.floor(nums.length / 2);
      return nums.length % 2 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
    }
    function epRound1(n) {
      if (n == null || !Number.isFinite(n)) return null;
      return Math.round(n * 10) / 10;
    }
    function epPct(n, d) {
      if (d == null || d <= 0 || n == null) return null;
      return Math.round((n / d) * 1000) / 10;
    }
    function epSampleLabel(n) {
      if (n == null || n <= 0) return 'Sem clientes';
      if (n < 10) return 'Amostra muito pequena';
      if (n < 30) return 'Amostra pequena';
      return 'Amostra regular';
    }
    function epPeriodBounds() {
      const key = epFilters.period?.value || 'all';
      const now = new Date();
      const endOfDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
      if (key === 'all') return { from: null, to: null, active: false, label: 'Todo o histórico' };
      if (key === 'custom') {
        const from = epFilters.from?.value ? new Date(epFilters.from.value + 'T00:00:00.000Z') : null;
        const to = epFilters.to?.value ? new Date(epFilters.to.value + 'T23:59:59.999Z') : null;
        return { from, to, active: Boolean(from || to), label: 'Intervalo personalizado' };
      }
      if (key === '30') {
        const to = endOfDay(now);
        const from = new Date(to); from.setUTCDate(from.getUTCDate() - 30);
        return { from, to, active: true, label: 'Últimos 30 dias' };
      }
      if (key === '90') {
        const to = endOfDay(now);
        const from = new Date(to); from.setUTCDate(from.getUTCDate() - 90);
        return { from, to, active: true, label: 'Últimos 90 dias' };
      }
      if (key === 'this_month') {
        return { from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)), to: endOfDay(now), active: true, label: 'Este mês' };
      }
      if (key === 'last_month') {
        return {
          from: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)),
          to: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 23, 59, 59, 999)),
          active: true, label: 'Mês passado'
        };
      }
      if (key === 'this_year') {
        return { from: new Date(Date.UTC(now.getUTCFullYear(), 0, 1)), to: endOfDay(now), active: true, label: 'Este ano' };
      }
      if (key === 'last_year') {
        return {
          from: new Date(Date.UTC(now.getUTCFullYear() - 1, 0, 1)),
          to: new Date(Date.UTC(now.getUTCFullYear() - 1, 11, 31, 23, 59, 59, 999)),
          active: true, label: 'Ano passado'
        };
      }
      return { from: null, to: null, active: false, label: 'Todo o histórico' };
    }
    function epInPeriod(iso, bounds) {
      if (!bounds.active) return true;
      if (!iso) return false;
      const d = new Date(iso);
      if (Number.isNaN(d.getTime())) return false;
      if (bounds.from && d < bounds.from) return false;
      if (bounds.to && d > bounds.to) return false;
      return true;
    }
    function epPortfolioMatch(n, band) {
      if (!band || band === 'all') return true;
      if (band === '1-10') return n >= 1 && n <= 10;
      if (band === '11-30') return n >= 11 && n <= 30;
      if (band === '31-60') return n >= 31 && n <= 60;
      if (band === '61+') return n >= 61;
      return true;
    }
    function epMatchesClientStatus(status, filter) {
      if (!filter || filter === 'all') return true;
      if (filter === 'active_or_frozen') return status === 'Ativo' || status === 'Congelado';
      if (filter === 'active') return status === 'Ativo';
      if (filter === 'frozen') return status === 'Congelado';
      if (filter === 'cancelled') return status === 'Cancelado';
      if (filter === 'unknown') return status === 'Não informado';
      return true;
    }

    function fillEpFilters() {
      const engineers = (epState.payload?.engineers || []).map(e => e.engineer).filter(Boolean);
      const segments = new Set();
      for (const e of epState.payload?.engineers || []) {
        for (const c of e.clients || []) segments.add(c.segment);
      }
      const engSel = epFilters.engineer;
      const segSel = epFilters.segment;
      if (engSel) {
        const cur = engSel.value || 'all';
        engSel.innerHTML = '<option value="all">Todos</option>' +
          engineers.filter(n => n !== 'Não informado').sort((a, b) => a.localeCompare(b, 'pt-BR'))
            .map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('') +
          (engineers.includes('Não informado') ? '<option value="Não informado">Não informado</option>' : '');
        engSel.value = [...engSel.options].some(o => o.value === cur) ? cur : 'all';
      }
      if (segSel) {
        const cur = segSel.value || 'all';
        segSel.innerHTML = '<option value="all">Todos</option>' +
          [...segments].sort((a, b) => a.localeCompare(b, 'pt-BR'))
            .map(n => `<option value="${escapeHtml(n)}">${escapeHtml(n)}</option>`).join('');
        segSel.value = [...segSel.options].some(o => o.value === cur) ? cur : 'all';
      }
    }

    function buildEpRows() {
      const bounds = epPeriodBounds();
      const search = (epFilters.search?.value || '').trim().toLowerCase();
      const engineer = epFilters.engineer?.value || 'all';
      const status = epFilters.status?.value || 'all';
      const segment = epFilters.segment?.value || 'all';
      const hasCancel = epFilters.hasCancel?.value || 'all';
      const hasMeeting = epFilters.hasMeeting?.value || 'all';
      const portfolio = epFilters.portfolio?.value || 'all';
      const hideSmall = Boolean(epFilters.hideSmall?.checked);

      return (epState.payload?.engineers || []).map(raw => {
        if (engineer !== 'all' && raw.engineer !== engineer) return null;
        if (search && !String(raw.engineer).toLowerCase().includes(search)) return null;

        const clients = (raw.clients || []).filter(c => {
          if (!epMatchesClientStatus(c.analyticalStatus, status)) return false;
          if (segment !== 'all' && c.segment !== segment) return false;
          return true;
        });
        if (!clients.length && (status !== 'all' || segment !== 'all')) return null;

        const meetingCounts = clients.map(c => {
          const dates = Array.isArray(c.meetingDates) ? c.meetingDates : [];
          if (!bounds.active) return dates.length || Number(c.totalMeetings) || 0;
          return dates.filter(iso => epInPeriod(iso, bounds)).length;
        });
        const totalMeetings = meetingCounts.reduce((a, b) => a + b, 0);
        const clientsWithMeeting = meetingCounts.filter(n => n > 0).length;
        const clientsWithoutMeeting = clients.length - clientsWithMeeting;
        const totalClients = clients.length;
        const activeClients = clients.filter(c => c.analyticalStatus === 'Ativo').length;
        const frozenClients = clients.filter(c => c.analyticalStatus === 'Congelado').length;
        const cancelledClients = clients.filter(c => c.analyticalStatus === 'Cancelado' || c.cancelled).length;
        const unknownStatusClients = clients.filter(c => c.analyticalStatus === 'Não informado').length;
        const activeOrFrozenClients = activeClients + frozenClients;
        const cancelledShareOfPortfolio = epPct(cancelledClients, totalClients);
        const meetingCoverage = epPct(clientsWithMeeting, totalClients);
        const averageMeetingsPerClient = totalClients > 0 ? epRound1(totalMeetings / totalClients) : null;
        const medianMeetingsAmongWithMeetings = epRound1(epMedian(meetingCounts.filter(n => n > 0)));
        const sampleSizeLabel = epSampleLabel(totalClients);

        if (!epPortfolioMatch(totalClients, portfolio)) return null;
        if (hideSmall && totalClients < 10) return null;
        if (hasCancel === 'yes' && cancelledClients <= 0) return null;
        if (hasCancel === 'no' && cancelledClients > 0) return null;
        if (hasMeeting === 'yes' && clientsWithMeeting <= 0) return null;
        if (hasMeeting === 'no' && clientsWithMeeting > 0) return null;

        const qualityAlerts = [];
        if (raw.engineer === 'Não informado') qualityAlerts.push('EP não informado');
        if (totalClients > 0 && totalClients < 10) qualityAlerts.push('Amostra muito pequena');
        else if (totalClients >= 10 && totalClients < 30) qualityAlerts.push('Amostra pequena');
        if (clientsWithoutMeeting === totalClients && totalClients > 0) qualityAlerts.push('Nenhuma reunião na carteira');
        if (cancelledShareOfPortfolio === 100 && totalClients < 10) {
          qualityAlerts.push('100% cancelado em amostra pequena');
        }

        return {
          engineer: raw.engineer,
          totalClients,
          activeClients,
          frozenClients,
          activeOrFrozenClients,
          cancelledClients,
          unknownStatusClients,
          cancelledShareOfPortfolio,
          meetingCoverage,
          clientsWithMeeting,
          clientsWithoutMeeting,
          totalMeetings,
          averageMeetingsPerClient,
          medianMeetingsAmongWithMeetings,
          sampleSizeLabel,
          qualityAlerts,
          clients,
          methodology: raw.methodology || {}
        };
      }).filter(Boolean);
    }

    function sortEpRows(rows) {
      const key = epState.sortKey;
      const dir = epState.sortDir === 'asc' ? 1 : -1;
      return rows.slice().sort((a, b) => {
        const av = a[key];
        const bv = b[key];
        let cmp = 0;
        if (av == null && bv == null) cmp = 0;
        else if (av == null) cmp = 1;
        else if (bv == null) cmp = -1;
        else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        else cmp = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true });
        if (cmp === 0) cmp = b.totalClients - a.totalClients || a.engineer.localeCompare(b.engineer, 'pt-BR');
        return cmp * dir;
      });
    }

    function renderEpCancelBars(items) {
      const max = Math.max(...items.map(i => i.rate || 0), 1);
      return items.map(i => {
        const sample = i.totalClients < 10
          ? `<span class="ep-sample-tag">${escapeHtml(i.sampleSizeLabel)}</span>`
          : (i.totalClients < 30 ? `<span class="ep-sample-tag">${escapeHtml(i.sampleSizeLabel)}</span>` : '');
        const label = `${i.rate == null ? '—' : pct(i.rate)} · ${fmt.format(i.cancelled)} de ${fmt.format(i.totalClients)} clientes`;
        return `<div class="hbar" title="${escapeHtml(i.engineer)}: ${escapeHtml(label)} · ${escapeHtml(i.sampleSizeLabel)}">
          <div class="hbar-label" title="${escapeHtml(i.engineer)}">${escapeHtml(i.engineer)}${sample}</div>
          <div class="hbar-track"><span style="width:${((i.rate || 0) / max) * 100}%"></span></div>
          <div class="hbar-val">${escapeHtml(label)}</div>
        </div>`;
      }).join('') || '<div class="empty" style="display:block">Sem dados</div>';
    }
    function renderEpCoverageBars(items) {
      const max = Math.max(...items.map(i => i.coverage || 0), 1);
      return items.map(i => {
        const label = `${i.coverage == null ? '—' : pct(i.coverage)} · ${fmt.format(i.withMeeting)} de ${fmt.format(i.totalClients)} com reunião`;
        return `<div class="hbar" title="${escapeHtml(i.engineer)}: ${escapeHtml(label)}">
          <div class="hbar-label" title="${escapeHtml(i.engineer)}">${escapeHtml(i.engineer)}</div>
          <div class="hbar-track"><span style="width:${((i.coverage || 0) / max) * 100}%"></span></div>
          <div class="hbar-val">${escapeHtml(label)}</div>
        </div>`;
      }).join('') || '<div class="empty" style="display:block">Sem dados</div>';
    }
    function renderEpFrequencyBars(items) {
      const max = Math.max(...items.map(i => i.average || 0), 0.1);
      return items.map(i => {
        const label = `média ${i.average == null ? '—' : fmt.format(i.average)} · mediana c/ reunião ${i.medianAmong == null ? '—' : fmt.format(i.medianAmong)}`;
        const sub = `${fmt.format(i.totalMeetings)} reuniões · ${fmt.format(i.withMeeting)} clientes com reunião`;
        return `<div class="hbar" title="${escapeHtml(i.engineer)}: ${escapeHtml(label)} · ${escapeHtml(sub)}">
          <div class="hbar-label" title="${escapeHtml(i.engineer)}">${escapeHtml(i.engineer)}</div>
          <div class="hbar-track"><span style="width:${((i.average || 0) / max) * 100}%"></span></div>
          <div class="hbar-val">${escapeHtml(label)}<br><span class="note-muted">${escapeHtml(sub)}</span></div>
        </div>`;
      }).join('') || '<div class="empty" style="display:block">Sem dados</div>';
    }

    function openEpDrawer(row) {
      const drawer = document.querySelector('#drawer');
      if (!drawer) return;
      document.querySelector('#drawerTitle').textContent = row.engineer;
      document.querySelector('#drawerSub').textContent =
        `${fmt.format(row.totalClients)} clientes · ${escapeHtml(row.sampleSizeLabel)} · EP atual (sem histórico)`;
      const items = [
        ['Clientes', fmt.format(row.totalClients)],
        ['Ativos', fmt.format(row.activeClients)],
        ['Ativos e congelados', fmt.format(row.activeOrFrozenClients)],
        ['Congelados', fmt.format(row.frozenClients)],
        ['Cancelados', fmt.format(row.cancelledClients)],
        ['Não informados (status)', fmt.format(row.unknownStatusClients)],
        ['Percentual cancelado da carteira',
          row.cancelledShareOfPortfolio == null
            ? 'Não calculável'
            : `${pct(row.cancelledShareOfPortfolio)} (${fmt.format(row.cancelledClients)} de ${fmt.format(row.totalClients)})`],
        ['Cobertura de reuniões',
          row.meetingCoverage == null
            ? 'Não calculável'
            : `${pct(row.meetingCoverage)} (${fmt.format(row.clientsWithMeeting)} de ${fmt.format(row.totalClients)})`],
        ['Clientes sem reunião', fmt.format(row.clientsWithoutMeeting)],
        ['Total de reuniões', fmt.format(row.totalMeetings)],
        ['Média de reuniões por cliente', row.averageMeetingsPerClient == null ? 'Não calculável' : fmt.format(row.averageMeetingsPerClient)],
        ['Mediana entre clientes com reunião', row.medianMeetingsAmongWithMeetings == null ? 'Não calculável' : fmt.format(row.medianMeetingsAmongWithMeetings)],
      ];
      document.querySelector('#drawerGrid').innerHTML =
        items.map(([k, v]) => `<div class="drawer-item"><span>${k}</span><strong>${escapeHtml(v)}</strong></div>`).join('') +
        `<div class="drawer-section" style="grid-column:1/-1"><h3>Metodologia</h3><div class="drawer-grid">
          <div class="drawer-item"><span>EP</span><strong>Atual em clients.engenheiro_patrimonial — sem histórico de troca</strong></div>
          <div class="drawer-item"><span>% cancelado</span><strong>Composição da carteira (não é taxa temporal)</strong></div>
          <div class="drawer-item"><span>Reuniões</span><strong>Período filtra pela data da reunião · mesma consolidação da página Reuniões</strong></div>
          <div class="drawer-item"><span>Mecanismos / NPS / renovação</span><strong>Não calculáveis nesta página (ver pendências)</strong></div>
        </div></div>`;
      document.querySelector('#drawerWarnings').innerHTML =
        (row.qualityAlerts || []).map(w => `<li>${escapeHtml(w)}</li>`).join('') ||
        '<li style="color:var(--color-text-muted)">Nenhum alerta</li>';
      drawer.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
    }

    function renderEpPerformance() {
      if (!epState.payload) return;
      const bounds = epPeriodBounds();
      const note = document.querySelector('#epPeriodNote');
      if (note) {
        note.textContent = bounds.active
          ? `Período das reuniões: ${bounds.label} · Percentual cancelado = composição da carteira (não temporal) · EP atual.`
          : 'Período aplica-se às reuniões · Eventos históricos atribuídos ao EP atualmente registrado no cliente.';
      }

      const rows = sortEpRows(buildEpRows());
      const withNamed = rows.filter(r => r.engineer !== 'Não informado');
      const focus = withNamed.length ? withNamed : rows;
      const totalClients = focus.reduce((a, r) => a + r.totalClients, 0);
      const withoutEp = (epState.payload.engineers || []).find(e => e.engineer === 'Não informado');
      const clientsWithoutEp = withoutEp
        ? (withoutEp.clients || []).filter(c => {
            const status = epFilters.status?.value || 'all';
            const segment = epFilters.segment?.value || 'all';
            if (!epMatchesClientStatus(c.analyticalStatus, status)) return false;
            if (segment !== 'all' && c.segment !== segment) return false;
            return true;
          }).length
        : (epState.payload.summary?.clientsWithoutEngineer || 0);
      const cancelled = focus.reduce((a, r) => a + r.cancelledClients, 0);
      const cancelShare = epPct(cancelled, totalClients);
      const withMeeting = focus.reduce((a, r) => a + r.clientsWithMeeting, 0);
      const coverage = epPct(withMeeting, totalClients);
      const totalMeetings = focus.reduce((a, r) => a + r.totalMeetings, 0);
      const avgMeet = totalClients > 0 ? epRound1(totalMeetings / totalClients) : null;

      const kpis = document.querySelector('#epKpis');
      if (kpis) {
        kpis.innerHTML = `
          <article class="metric kpi-primary">
            <div class="metric-label">EPs com carteira <span class="help" title="Engenheiros Patrimoniais com pelo menos um cliente no recorte (exceto filtro de EP específico).">?</span></div>
            <div class="metric-value">${fmt.format(focus.length)}</div>
            <div class="metric-note">${fmt.format(totalClients)} clientes com EP · ${fmt.format(clientsWithoutEp)} sem EP</div>
          </article>
          <article class="metric kpi-primary">
            <div class="metric-label">Percentual cancelado da carteira <span class="help" title="Percentual dos clientes atribuídos ao EP que possuem status analítico Cancelado. Eventos históricos são atribuídos ao EP atual quando não existe histórico de responsável.">?</span></div>
            <div class="metric-value">${cancelShare == null ? '—' : pct(cancelShare)}</div>
            <div class="metric-note">${fmt.format(cancelled)} cancelados de ${fmt.format(totalClients)} · composição, não taxa temporal</div>
          </article>
          <article class="metric kpi-primary">
            <div class="metric-label">Cobertura de reuniões <span class="help" title="Percentual de clientes da carteira que possuem pelo menos uma reunião válida no período.">?</span></div>
            <div class="metric-value">${coverage == null ? '—' : pct(coverage)}</div>
            <div class="metric-note">${fmt.format(withMeeting)} de ${fmt.format(totalClients)} com reunião · média ${avgMeet == null ? '—' : fmt.format(avgMeet)} reun./cliente</div>
          </article>`;
      }

      mountPortalAlert(document.querySelector('#epSampleAlert'), {
        id: 'ep-performance-sample-warning',
        type: 'warning',
        title: 'Comparações exigem atenção à amostra',
        message: 'Indicadores de EPs com carteiras ou amostras pequenas podem variar mais. Consulte sempre a quantidade de clientes considerada. Use “Ocultar amostras < 10 clientes” para comparação mais estável.',
        icon: '⚠'
      });

      showSourceWarningsAlert(
        '#epMethodAlert',
        'ep-performance-method-warning',
        'Atribuição ao EP atual',
        epState.payload.warnings || [],
        {
          message: 'Os eventos históricos são atribuídos ao EP atualmente registrado no cliente. Mudanças anteriores de responsável não estão disponíveis.',
          note: 'Mecanismos (App Pharus), NPS, tempo de resposta e renovação permanecem fora desta página até fonte/fórmula confirmadas.'
        }
      );

      const chartPortfolio = focus
        .slice()
        .sort((a, b) => b.totalClients - a.totalClients)
        .slice(0, 15)
        .map(r => ({ label: r.engineer, count: r.totalClients, percent: epPct(r.totalClients, totalClients) || 0 }));
      const chartCancel = focus
        .slice()
        .sort((a, b) => b.totalClients - a.totalClients)
        .slice(0, 15)
        .map(r => ({
          engineer: r.engineer,
          rate: r.cancelledShareOfPortfolio,
          cancelled: r.cancelledClients,
          totalClients: r.totalClients,
          sampleSizeLabel: r.sampleSizeLabel
        }));
      const chartCoverage = focus
        .slice()
        .sort((a, b) => b.totalClients - a.totalClients)
        .slice(0, 15)
        .map(r => ({
          engineer: r.engineer,
          coverage: r.meetingCoverage,
          withMeeting: r.clientsWithMeeting,
          totalClients: r.totalClients
        }));
      const chartFreq = focus
        .slice()
        .sort((a, b) => b.totalClients - a.totalClients)
        .slice(0, 15)
        .map(r => ({
          engineer: r.engineer,
          average: r.averageMeetingsPerClient,
          medianAmong: r.medianMeetingsAmongWithMeetings,
          totalMeetings: r.totalMeetings,
          withMeeting: r.clientsWithMeeting
        }));

      const elP = document.querySelector('#epChartPortfolio');
      const elC = document.querySelector('#epChartCancel');
      const elCov = document.querySelector('#epChartCoverage');
      const elF = document.querySelector('#epChartFrequency');
      if (elP) elP.innerHTML = hBars(chartPortfolio, 15);
      if (elC) elC.innerHTML = renderEpCancelBars(chartCancel);
      if (elCov) elCov.innerHTML = renderEpCoverageBars(chartCoverage);
      if (elF) elF.innerHTML = renderEpFrequencyBars(chartFreq);

      const pages = Math.max(1, Math.ceil(rows.length / epState.pageSize));
      if (epState.page > pages) epState.page = pages;
      if (epState.page < 1) epState.page = 1;
      const start = (epState.page - 1) * epState.pageSize;
      const pageRows = rows.slice(start, start + epState.pageSize);
      const tbody = document.querySelector('#epRows');
      if (tbody) {
        tbody.innerHTML = pageRows.map(r => `<tr data-epid="${escapeHtml(r.engineer)}">
          <td>${escapeHtml(r.engineer)}</td>
          <td class="num">${fmt.format(r.totalClients)}</td>
          <td class="num">${fmt.format(r.activeClients)}</td>
          <td class="num">${fmt.format(r.activeOrFrozenClients)}</td>
          <td class="num">${fmt.format(r.frozenClients)}</td>
          <td class="num">${fmt.format(r.cancelledClients)}</td>
          <td class="num">${r.cancelledShareOfPortfolio == null ? '—' : `${pct(r.cancelledShareOfPortfolio)} <span class="note-muted">(${fmt.format(r.cancelledClients)}/${fmt.format(r.totalClients)})</span>`}</td>
          <td class="num">${fmt.format(r.clientsWithMeeting)}</td>
          <td class="num">${r.meetingCoverage == null ? '—' : pct(r.meetingCoverage)}</td>
          <td class="num">${r.averageMeetingsPerClient == null ? '—' : fmt.format(r.averageMeetingsPerClient)}</td>
          <td class="num">${r.medianMeetingsAmongWithMeetings == null ? '—' : fmt.format(r.medianMeetingsAmongWithMeetings)}</td>
          <td class="num">${fmt.format(r.totalMeetings)}</td>
          <td>${(r.qualityAlerts || []).length ? escapeHtml(r.qualityAlerts.join(' · ')) : '—'}</td>
        </tr>`).join('');
      }
      const empty = document.querySelector('#epEmpty');
      if (empty) empty.style.display = rows.length ? 'none' : 'block';
      const counter = document.querySelector('#epCounter');
      if (counter) counter.textContent = `${fmt.format(rows.length)} EP(s)`;
      const pageInfo = document.querySelector('#epPageInfo');
      if (pageInfo) pageInfo.textContent = `Página ${epState.page} de ${pages}`;
      const prev = document.querySelector('#epPrev');
      const next = document.querySelector('#epNext');
      if (prev) prev.disabled = epState.page <= 1;
      if (next) next.disabled = epState.page >= pages;
    }

    async function loadEpPerformance() {
      if (!isPortalAuthenticated()) return;
      if (window.__portalCurrentPage !== 'ep' && window.__portalCurrentPageCanonical !== 'ep_performance') return;
      if (epState.loading) return;
      epState.loading = true;
      const requestId = ++epState.requestId;
      const refresh = document.querySelector('#epRefresh');
      const status = document.querySelector('#epStatus');
      if (refresh) { refresh.disabled = true; refresh.textContent = 'Atualizando…'; }
      if (status) { status.textContent = '● Atualizando dados'; status.style.color = 'var(--color-warning)'; }
      try {
        const response = await apiFetch(`/api/ep-performance?t=${Date.now()}`, { cache: 'no-store' });
        const responseText = await response.text();
        let payload = {};
        try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = {}; }
        if (requestId !== epState.requestId) return;
        if (!response.ok) {
          console.error('[EP Performance API]', { status: response.status, body: responseText.slice(0, 800) });
          throw Object.assign(new Error(friendlyApiError(response.status, payload)), { status: response.status, payload });
        }
        epState.payload = {
          ...payload,
          summary: payload?.summary ?? {},
          engineers: Array.isArray(payload?.engineers) ? payload.engineers : [],
          distributions: payload?.distributions ?? {},
          warnings: Array.isArray(payload?.warnings) ? payload.warnings : [],
          pending: payload?.pending || {}
        };
        fillEpFilters();
        renderEpPerformance();
        if (status) {
          status.textContent = '● Base conectada';
          status.style.color = 'var(--color-success)';
        }
        const updated = document.querySelector('#epUpdated');
        if (updated) {
          updated.textContent = epState.payload.generatedAt
            ? `Atualizado em ${new Date(epState.payload.generatedAt).toLocaleString('pt-BR')}`
            : 'Dados carregados';
        }
      } catch (error) {
        if (requestId !== epState.requestId) return;
        if (error?.code === 'AUTH_REQUIRED' || error?.code === 'AUTH_FORBIDDEN' || error?.message === 'AUTH_REQUIRED') return;
        console.error('[EP Performance API]', { status: error?.status || 0, error: error.message });
        if (status) { status.textContent = '● Falha na atualização'; status.style.color = 'var(--color-danger)'; }
        const updated = document.querySelector('#epUpdated');
        if (updated) updated.textContent = error.message || friendlyApiError(0, null, true);
        const empty = document.querySelector('#epEmpty');
        if (empty) {
          empty.style.display = 'block';
          empty.textContent = 'Não foi possível carregar a performance dos EPs. As demais páginas continuam disponíveis.';
        }
      } finally {
        if (requestId === epState.requestId) {
          epState.loading = false;
          if (refresh) { refresh.disabled = false; refresh.textContent = 'Atualizar'; }
        }
      }
    }

    Object.values(epFilters).forEach(el => {
      if (!el) return;
      const ev = el.type === 'checkbox' ? 'change' : 'input';
      el.addEventListener(ev, () => { epState.page = 1; renderEpPerformance(); });
    });
    document.querySelector('#epClear')?.addEventListener('click', () => {
      if (epFilters.search) epFilters.search.value = '';
      ['engineer', 'status', 'segment', 'period', 'portfolio', 'hasCancel', 'hasMeeting'].forEach(k => {
        if (epFilters[k]) epFilters[k].value = 'all';
      });
      ['from', 'to'].forEach(k => { if (epFilters[k]) epFilters[k].value = ''; });
      if (epFilters.hideSmall) epFilters.hideSmall.checked = false;
      epState.page = 1;
      renderEpPerformance();
    });
    document.querySelector('#epRefresh')?.addEventListener('click', loadEpPerformance);
    document.querySelector('#epPrev')?.addEventListener('click', () => { epState.page -= 1; renderEpPerformance(); });
    document.querySelector('#epNext')?.addEventListener('click', () => { epState.page += 1; renderEpPerformance(); });
    document.querySelectorAll('#view-ep th[data-epsort]').forEach(th => th.addEventListener('click', () => {
      const key = th.dataset.epsort;
      if (epState.sortKey === key) epState.sortDir = epState.sortDir === 'asc' ? 'desc' : 'asc';
      else {
        epState.sortKey = key;
        epState.sortDir = key === 'engineer' || key === 'alerts' ? 'asc' : 'desc';
      }
      renderEpPerformance();
    }));
    document.querySelector('#epRows')?.addEventListener('click', e => {
      const tr = e.target.closest('tr[data-epid]');
      if (!tr || !epState.payload) return;
      const rows = buildEpRows();
      const row = rows.find(r => r.engineer === tr.dataset.epid);
      if (row) openEpDrawer(row);
    });

