    /* -------- Performance do EP -------- */
    const epState = {
      payload: null, page: 1, pageSize: 25, sortKey: 'totalClients', sortDir: 'desc',
      loading: false, requestId: 0
    };
    const epFilters = {
      search: document.querySelector('#epSearch'),
      status: document.querySelector('#epStatusFilter'),
      segment: document.querySelector('#epSegment'),
      hireFrom: document.querySelector('#epHireFrom'),
      hireTo: document.querySelector('#epHireTo'),
      period: document.querySelector('#epPeriod'),
      from: document.querySelector('#epFrom'),
      to: document.querySelector('#epTo'),
      onlyPortfolio: document.querySelector('#epOnlyPortfolio'),
      hasMeeting: document.querySelector('#epHasMeeting'),
      meetingSource: document.querySelector('#epMeetingSource'),
      portfolioMetric: document.querySelector('#epPortfolioMetric')
    };

    function epPct(n, d) {
      if (d == null || d <= 0 || n == null) return null;
      return Math.round((n / d) * 1000) / 10;
    }
    function epFmtPct(v) { return v == null ? '—' : pct(v); }
    function epSampleBadge(row) {
      if (!row || row.totalClients >= 10) return '';
      return `<span class="badge sample-small" title="Indicadores baseados em uma carteira pequena podem variar bastante.">Amostra pequena</span>`;
    }

    function epPeriodBounds() {
      const key = epFilters.period?.value || 'all';
      const now = new Date();
      const end = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999));
      if (key === 'custom') {
        const from = epFilters.from?.value ? new Date(epFilters.from.value + 'T00:00:00.000Z') : null;
        const to = epFilters.to?.value ? new Date(epFilters.to.value + 'T23:59:59.999Z') : null;
        return { from, to, active: Boolean(from || to) };
      }
      if (key === '30' || key === '90') {
        const days = Number(key);
        const to = end(now);
        const from = new Date(to); from.setUTCDate(from.getUTCDate() - days);
        return { from, to, active: true };
      }
      return { from: null, to: null, active: false };
    }

    function filteredEpEngineers() {
      const engineers = epState.payload?.byAdvisor || epState.payload?.engineers || [];
      const q = (epFilters.search?.value || '').trim().toLowerCase();
      const status = epFilters.status?.value || 'all';
      const segment = epFilters.segment?.value || 'all';
      const onlyPortfolio = epFilters.onlyPortfolio?.value !== 'all';
      const hasMeeting = epFilters.hasMeeting?.value || 'all';
      const hireFrom = epFilters.hireFrom?.value || '';
      const hireTo = epFilters.hireTo?.value || '';
      const period = epPeriodBounds();

      return engineers.map((raw) => {
        let clients = Array.isArray(raw.clients) ? raw.clients.slice() : [];
        if (status === 'active') clients = clients.filter((c) => c.analyticalStatus === 'Ativo');
        if (status === 'frozen') clients = clients.filter((c) => c.analyticalStatus === 'Congelado');
        if (status === 'cancelled') clients = clients.filter((c) => c.cancelled || c.analyticalStatus === 'Cancelado');
        if (status === 'active_or_frozen') clients = clients.filter((c) => c.analyticalStatus === 'Ativo' || c.analyticalStatus === 'Congelado');
        if (status === 'unknown') clients = clients.filter((c) => c.analyticalStatus === 'Não informado');
        if (segment !== 'all') clients = clients.filter((c) => c.segment === segment);
        if (hireFrom || hireTo) {
          clients = clients.filter((c) => {
            if (!c.hireDate) return false;
            const d = new Date(c.hireDate);
            if (Number.isNaN(d.getTime())) return false;
            if (hireFrom && d < new Date(hireFrom + 'T00:00:00Z')) return false;
            if (hireTo && d > new Date(hireTo + 'T23:59:59Z')) return false;
            return true;
          });
        }
        if (period.active) {
          clients = clients.map((c) => {
            const dates = (c.meetingDates || []).filter((iso) => {
              const d = new Date(iso);
              if (Number.isNaN(d.getTime())) return false;
              if (period.from && d < period.from) return false;
              if (period.to && d > period.to) return false;
              return true;
            });
            return { ...c, totalMeetings: dates.length, meetingDates: dates };
          });
        }
        const totalClients = clients.length;
        const activeClients = clients.filter((c) => c.analyticalStatus === 'Ativo').length;
        const frozenClients = clients.filter((c) => c.analyticalStatus === 'Congelado').length;
        const cancelledClients = clients.filter((c) => c.cancelled || c.analyticalStatus === 'Cancelado').length;
        const meetingCounts = clients.map((c) => c.totalMeetings || 0);
        const totalMeetings = meetingCounts.reduce((a, b) => a + b, 0);
        const clientsWithMeeting = meetingCounts.filter((n) => n > 0).length;
        const clientsWithoutMeeting = totalClients - clientsWithMeeting;
        const withMeet = meetingCounts.filter((n) => n > 0).sort((a, b) => a - b);
        const medianAmong = withMeet.length
          ? (withMeet.length % 2 ? withMeet[(withMeet.length - 1) / 2] : (withMeet[withMeet.length / 2 - 1] + withMeet[withMeet.length / 2]) / 2)
          : null;
        return {
          ...raw,
          clients,
          totalClients,
          activeClients,
          frozenClients,
          cancelledClients,
          cancelledShareOfPortfolio: epPct(cancelledClients, totalClients),
          clientsWithMeeting,
          clientsWithoutMeeting,
          meetingCoverage: epPct(clientsWithMeeting, totalClients),
          totalMeetings,
          averageMeetingsPerClient: totalClients ? Math.round((totalMeetings / totalClients) * 10) / 10 : null,
          medianMeetingsAmongWithMeetings: medianAmong == null ? null : Math.round(medianAmong * 10) / 10,
          sampleSize: totalClients < 10 ? 'small' : 'regular',
          sampleSizeLabel: totalClients < 10 ? 'Amostra pequena' : 'Amostra regular'
        };
      }).filter((e) => {
        if (onlyPortfolio && (e.engineer === 'Não informado' || e.totalClients <= 0)) return false;
        if (q && !(e.engineer || '').toLowerCase().includes(q)) return false;
        if (hasMeeting === 'yes' && !(e.totalMeetings > 0)) return false;
        if (hasMeeting === 'no' && e.totalMeetings > 0) return false;
        return e.totalClients > 0 || !onlyPortfolio;
      });
    }

    function fillEpFilters() {
      const engineers = epState.payload?.byAdvisor || epState.payload?.engineers || [];
      const segments = [...new Set(engineers.flatMap((e) => (e.clients || []).map((c) => c.segment)).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const sel = epFilters.segment;
      if (!sel) return;
      const cur = sel.value;
      sel.innerHTML = '<option value="all">Todos</option>' + segments.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('');
      sel.value = segments.includes(cur) ? cur : 'all';
    }

    function renderEpPerformance() {
      if (!epState.payload) return;
      const rows = filteredEpEngineers().filter((e) => e.engineer !== 'Não informado' || (epFilters.onlyPortfolio?.value === 'all'));
      const named = rows.filter((e) => e.engineer !== 'Não informado');
      const totalClients = named.reduce((a, e) => a + e.totalClients, 0);
      const active = named.reduce((a, e) => a + e.activeClients, 0);
      const frozen = named.reduce((a, e) => a + e.frozenClients, 0);
      const cancelled = named.reduce((a, e) => a + e.cancelledClients, 0);
      const withMeeting = named.reduce((a, e) => a + e.clientsWithMeeting, 0);
      const coverage = epPct(withMeeting, totalClients);
      const s = epState.payload.summary || {};

      const useServer = !(epFilters.search?.value || epFilters.status?.value !== 'all' || epFilters.segment?.value !== 'all' || epFilters.hireFrom?.value || epFilters.hireTo?.value || (epFilters.period?.value && epFilters.period.value !== 'all') || epFilters.hasMeeting?.value !== 'all');
      const summary = useServer ? s : {
        advisorsWithPortfolio: named.length,
        totalClients,
        activeClients: active,
        frozenClients: frozen,
        confirmedCancelledClients: cancelled,
        meetingCoverage: coverage,
        clientsWithMeeting: withMeeting
      };

      setOrHtml('#epKpis', `
        <article class="metric kpi-primary"><div class="metric-label">Engenheiros com carteira</div><div class="metric-value">${fmt.format(summary.advisorsWithPortfolio || 0)}</div><div class="metric-note">EPs com ≥1 cliente no recorte.</div></article>
        <article class="metric kpi-primary"><div class="metric-label">Clientes na carteira</div><div class="metric-value">${fmt.format(summary.totalClients || 0)}</div><div class="metric-note">Clientes distintos.</div></article>
        <article class="metric kpi-secondary"><div class="metric-label">Clientes ativos</div><div class="metric-value">${fmt.format(summary.activeClients || 0)}</div></article>
        <article class="metric kpi-secondary"><div class="metric-label">Clientes congelados</div><div class="metric-value">${fmt.format(summary.frozenClients || 0)}</div></article>
        <article class="metric kpi-secondary"><div class="metric-label">Cancelados confirmados</div><div class="metric-value">${fmt.format(summary.confirmedCancelledClients || 0)}</div></article>
        <article class="metric kpi-secondary"><div class="metric-label">Cobertura de reuniões</div><div class="metric-value">${epFmtPct(summary.meetingCoverage)}</div><div class="metric-note">${fmt.format(summary.clientsWithMeeting || 0)} com reunião.</div></article>`);

      const metric = epFilters.portfolioMetric?.value || 'total';
      const portfolioItems = named.map((e) => ({
        label: e.engineer,
        count: metric === 'active' ? e.activeClients : metric === 'frozen' ? e.frozenClients : metric === 'cancelled' ? e.cancelledClients : e.totalClients,
        percent: epPct(metric === 'active' ? e.activeClients : metric === 'frozen' ? e.frozenClients : metric === 'cancelled' ? e.cancelledClients : e.totalClients, totalClients) || 0
      })).filter((i) => i.count > 0).sort((a, b) => b.count - a.count);
      setOrHtml('#epChartPortfolio', portfolioItems.length ? hBars(portfolioItems, 15) : '<div class="empty" style="display:block">Não há dados suficientes para este recorte.</div>');
      setOrHtml('#epChartCoverage', named.length ? hBars(named.map((e) => ({ label: e.engineer, count: e.clientsWithMeeting, percent: e.meetingCoverage || 0 })).sort((a, b) => b.percent - a.percent).slice(0, 15)) : '<div class="empty" style="display:block">Não há dados suficientes para este recorte.</div>');
      setOrHtml('#epChartFrequency', named.length ? hBars(named.map((e) => ({ label: e.engineer, count: Math.round((e.averageMeetingsPerClient || 0) * 10), percent: e.averageMeetingsPerClient || 0 })).sort((a, b) => b.percent - a.percent).slice(0, 15).map((i) => ({ ...i, count: i.percent, percent: i.percent }))) : '<div class="empty" style="display:block">Não há dados suficientes para este recorte.</div>');
      // frequency bars: show average as count display via custom
      const freqEl = document.querySelector('#epChartFrequency');
      if (freqEl && named.length) {
        const max = Math.max(...named.map((e) => e.averageMeetingsPerClient || 0), 0.1);
        freqEl.innerHTML = named.slice().sort((a, b) => (b.averageMeetingsPerClient || 0) - (a.averageMeetingsPerClient || 0)).slice(0, 15).map((e) => {
          const w = Math.max(4, Math.round(((e.averageMeetingsPerClient || 0) / max) * 100));
          return `<div class="hbar" title="${escapeHtml(e.engineer)}: média ${e.averageMeetingsPerClient ?? '—'} · mediana atendidos ${e.medianMeetingsAmongWithMeetings ?? '—'}"><div class="hbar-label">${escapeHtml(e.engineer)}</div><div class="hbar-track"><span style="width:${w}%"></span></div><div class="hbar-val">${e.averageMeetingsPerClient ?? '—'} · med ${e.medianMeetingsAmongWithMeetings ?? '—'}</div></div>`;
        }).join('');
      }
      setOrHtml('#epChartWithout', named.length ? hBars(named.map((e) => ({ label: e.engineer, count: e.clientsWithoutMeeting, percent: epPct(e.clientsWithoutMeeting, e.totalClients) || 0 })).sort((a, b) => b.count - a.count).slice(0, 15)) : '<div class="empty" style="display:block">Não há dados suficientes para este recorte.</div>');

      const sorted = [...named].sort((a, b) => {
        const av = a[epState.sortKey]; const bv = b[epState.sortKey];
        let cmp = 0;
        if (av == null && bv == null) cmp = 0;
        else if (av == null) cmp = 1;
        else if (bv == null) cmp = -1;
        else if (typeof av === 'number' && typeof bv === 'number') cmp = av - bv;
        else cmp = String(av).localeCompare(String(bv), 'pt-BR', { numeric: true });
        return epState.sortDir === 'asc' ? cmp : -cmp;
      });
      const pages = Math.max(1, Math.ceil(sorted.length / epState.pageSize));
      if (epState.page > pages) epState.page = pages;
      if (epState.page < 1) epState.page = 1;
      const pageRows = sorted.slice((epState.page - 1) * epState.pageSize, epState.page * epState.pageSize);
      setOrHtml('#epRows', pageRows.map((e) => `
        <tr>
          <td>${escapeHtml(e.engineer)}</td>
          <td class="num">${fmt.format(e.totalClients)}</td>
          <td class="num">${fmt.format(e.activeClients)}</td>
          <td class="num">${fmt.format(e.frozenClients)}</td>
          <td class="num">${fmt.format(e.cancelledClients)}</td>
          <td class="num">${epFmtPct(e.cancelledShareOfPortfolio)}</td>
          <td class="num">${fmt.format(e.clientsWithMeeting)}</td>
          <td class="num">${epFmtPct(e.meetingCoverage)}</td>
          <td class="num">${fmt.format(e.totalMeetings)}</td>
          <td class="num">${e.averageMeetingsPerClient ?? '—'}</td>
          <td class="num">${e.medianMeetingsAmongWithMeetings ?? '—'}</td>
          <td class="num">${e.medianDaysSinceLastMeeting ?? '—'}</td>
          <td class="num">${fmt.format(e.clientsWithoutMeeting)}</td>
          <td>${epSampleBadge(e)}</td>
        </tr>`).join(''));
      const empty = document.querySelector('#epEmpty');
      if (empty) empty.style.display = sorted.length ? 'none' : 'block';
      const counter = document.querySelector('#epCounter');
      if (counter) counter.textContent = `${fmt.format(sorted.length)} EP(s)`;
      const pageInfo = document.querySelector('#epPageInfo');
      if (pageInfo) pageInfo.textContent = `Página ${epState.page} de ${pages}`;
      const prev = document.querySelector('#epPrev');
      const next = document.querySelector('#epNext');
      if (prev) prev.disabled = epState.page <= 1;
      if (next) next.disabled = epState.page >= pages;

      const pharus = epState.payload.pharusMeetings || {};
      const pharusHost = document.querySelector('#epPharusHost');
      if (pharusHost) {
        if (!pharus.available && (pharus.source?.status === 'failed' || !pharus.source)) {
          pharusHost.innerHTML = `<div class="empty" style="display:block">Não foi possível carregar as reuniões do App Pharus. A BASE QV permanece disponível.</div>`;
        } else {
          const ps = pharus.summary || {};
          pharusHost.innerHTML = `
            <section class="summary kpis-ep-primary">
              <article class="metric kpi-secondary"><div class="metric-label">Reuniões registradas</div><div class="metric-value">${ps.totalMeetings == null ? '—' : fmt.format(ps.totalMeetings)}</div></article>
              <article class="metric kpi-secondary"><div class="metric-label">Concluídas</div><div class="metric-value">${ps.completedMeetings == null ? '—' : fmt.format(ps.completedMeetings)}</div></article>
              <article class="metric kpi-secondary"><div class="metric-label">Canceladas</div><div class="metric-value">${ps.cancelledMeetings == null ? '—' : fmt.format(ps.cancelledMeetings)}</div></article>
              <article class="metric kpi-secondary"><div class="metric-label">Usuários distintos</div><div class="metric-value">${ps.distinctUsers == null ? '—' : fmt.format(ps.distinctUsers)}</div></article>
              <article class="metric kpi-secondary"><div class="metric-label">Taxa de conclusão</div><div class="metric-value">${ps.completionRate == null ? '—' : epFmtPct(ps.completionRate)}</div></article>
              <article class="metric kpi-secondary"><div class="metric-label">Média por usuário</div><div class="metric-value">${ps.averageMeetingsPerUser ?? '—'}</div></article>
            </section>
            <p class="note-muted">${escapeHtml(pharus.source?.message || pharus.blockedReason || 'App Pharus conectado.')}</p>
            ${(pharus.warnings || []).length ? `<p class="note-muted">${(pharus.warnings || []).slice(0, 4).map((w) => escapeHtml(w.message || w.code)).join(' · ')}</p>` : ''}`;
        }
      }

      if (typeof showSourceWarningsAlert === 'function') {
        showSourceWarningsAlert('#epSourceAlert', 'ep-performance-quality-warning', 'Leitura dos indicadores por EP', [
          { code: 'method', label: 'Leitura dos indicadores por EP', message: 'As métricas são descritivas e dependem do tamanho da carteira e da cobertura dos dados. O percentual cancelado utiliza o EP atualmente vinculado ao cliente.', severity: 'info' },
          ...(epState.payload.qualityWarnings || epState.payload.warnings || [])
        ], { note: 'Avisos agregados — sem alerta individual por EP.' });
      }
    }

    function setOrHtml(sel, htmlContent) {
      const el = document.querySelector(sel);
      if (el) el.innerHTML = htmlContent;
    }

    async function loadEpPerformance() {
      if (!isPortalAuthenticated()) return;
      if (epState.loading) return;
      epState.loading = true;
      const requestId = ++epState.requestId;
      const endpoint = '/api/ep-performance';
      const refresh = document.querySelector('#epRefresh');
      const status = document.querySelector('#epStatus');
      if (refresh) { refresh.disabled = true; refresh.textContent = 'Atualizando…'; }
      if (status) { status.textContent = '● Atualizando dados'; status.style.color = 'var(--color-warning)'; }
      try {
        const response = await apiFetch(`${endpoint}?t=${Date.now()}`, { cache: 'no-store' });
        const responseText = await response.text();
        let payload = {};
        try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = {}; }
        if (requestId !== epState.requestId) return;
        if (!response.ok) {
          console.error('[EP Performance API]', { endpoint, status: response.status, code: payload?.code, message: payload?.error || payload?.message, body: responseText.slice(0, 800) });
          throw Object.assign(new Error(friendlyApiError(response.status, payload)), { status: response.status, payload });
        }
        epState.payload = payload;
        fillEpFilters();
        renderEpPerformance();
        if (status) { status.textContent = '● Base conectada'; status.style.color = 'var(--color-success)'; }
        const updated = document.querySelector('#epUpdated');
        if (updated) updated.textContent = payload.generatedAt ? `Atualizado em ${new Date(payload.generatedAt).toLocaleString('pt-BR')}` : 'Dados carregados';
      } catch (error) {
        if (requestId !== epState.requestId) return;
        if (error?.code === 'AUTH_REQUIRED' || error?.message === 'AUTH_REQUIRED') return;
        console.error('[EP Performance API]', { endpoint, status: error?.status || 0, code: error?.payload?.code, message: error?.message });
        if (status) { status.textContent = '● Falha na atualização'; status.style.color = 'var(--color-danger)'; }
        const updated = document.querySelector('#epUpdated');
        if (updated) updated.textContent = error.message || friendlyApiError(0, null, true);
        const empty = document.querySelector('#epEmpty');
        if (empty) { empty.style.display = 'block'; empty.textContent = 'Não foi possível carregar a performance dos EPs.'; }
      } finally {
        if (requestId === epState.requestId) {
          epState.loading = false;
          if (refresh) { refresh.disabled = false; refresh.textContent = 'Atualizar'; }
        }
      }
    }

    Object.values(epFilters).forEach((el) => el?.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => { epState.page = 1; renderEpPerformance(); }));
    document.querySelector('#epClear')?.addEventListener('click', () => {
      if (epFilters.search) epFilters.search.value = '';
      ['status', 'segment', 'period', 'hasMeeting', 'meetingSource', 'onlyPortfolio', 'portfolioMetric'].forEach((k) => {
        if (!epFilters[k]) return;
        if (k === 'onlyPortfolio') epFilters[k].value = 'yes';
        else if (k === 'meetingSource') epFilters[k].value = 'base_qv';
        else if (k === 'portfolioMetric') epFilters[k].value = 'total';
        else epFilters[k].value = 'all';
      });
      ['hireFrom', 'hireTo', 'from', 'to'].forEach((k) => { if (epFilters[k]) epFilters[k].value = ''; });
      epState.page = 1; renderEpPerformance();
    });
    document.querySelector('#epRefresh')?.addEventListener('click', loadEpPerformance);
    document.querySelector('#epPrev')?.addEventListener('click', () => { epState.page -= 1; renderEpPerformance(); });
    document.querySelector('#epNext')?.addEventListener('click', () => { epState.page += 1; renderEpPerformance(); });
    document.querySelectorAll('#view-ep th[data-epsort]').forEach((th) => th.addEventListener('click', () => {
      const key = th.dataset.epsort;
      if (epState.sortKey === key) epState.sortDir = epState.sortDir === 'asc' ? 'desc' : 'asc';
      else { epState.sortKey = key; epState.sortDir = key === 'engineer' ? 'asc' : 'desc'; }
      renderEpPerformance();
    }));

    /* -------- Cruzamentos Estatísticos -------- */
    const scState = { payload: null, loading: false, requestId: 0 };
    const scFilters = {
      hireFrom: document.querySelector('#scHireFrom'),
      hireTo: document.querySelector('#scHireTo'),
      status: document.querySelector('#scStatusFilter'),
      segment: document.querySelector('#scSegment'),
      engineer: document.querySelector('#scEngineer'),
      hasMeeting: document.querySelector('#scHasMeeting'),
      hasFinancial: document.querySelector('#scHasFinancial'),
      minCoverage: document.querySelector('#scMinCoverage'),
      minSample: document.querySelector('#scMinSample')
    };

    function fillScFilters() {
      const opts = scState.payload?.filterOptions || {};
      const fill = (sel, values, allLabel) => {
        if (!sel) return;
        const cur = sel.value;
        sel.innerHTML = `<option value="all">${allLabel}</option>` + (values || []).map((v) => `<option value="${escapeHtml(v)}">${escapeHtml(v)}</option>`).join('');
        sel.value = (values || []).includes(cur) ? cur : 'all';
      };
      fill(scFilters.segment, opts.segments, 'Todos');
      fill(scFilters.engineer, opts.engineers, 'Todos');
    }

    function renderStatisticalCrosses() {
      if (!scState.payload) return;
      const p = scState.payload;
      const s = p.summary || {};
      setOrHtml('#scKpis', `
        <article class="metric kpi-primary"><div class="metric-label">Clientes analisados</div><div class="metric-value">${fmt.format(s.analyzedClients || 0)}</div></article>
        <article class="metric kpi-primary"><div class="metric-label">Cancelamentos confirmados</div><div class="metric-value">${fmt.format(s.confirmedCancellations || 0)}</div></article>
        <article class="metric kpi-secondary"><div class="metric-label">Censurados / não cancelados</div><div class="metric-value">${fmt.format(s.censoredClients || 0)}</div></article>
        <article class="metric kpi-secondary"><div class="metric-label">Variáveis avaliadas</div><div class="metric-value">${fmt.format(s.evaluatedVariables || 0)}</div></article>
        <article class="metric kpi-secondary"><div class="metric-label">Cobertura média</div><div class="metric-value">${s.averageCoverage == null ? '—' : epFmtPct(s.averageCoverage)}</div></article>
        <article class="metric kpi-secondary"><div class="metric-label">Período observado</div><div class="metric-value" style="font-size:16px">${s.observationPeriod?.from ? dateBR(s.observationPeriod.from) : '—'} → ${s.observationPeriod?.to ? dateBR(s.observationPeriod.to) : '—'}</div></article>`);

      const diffs = p.groupDifferences || p.comparisons || [];
      const minCov = Number(scFilters.minCoverage?.value || 30);
      const minSample = Number(scFilters.minSample?.value || 30);
      const visibleDiffs = diffs.filter((d) => {
        const cov = d.coveragePercent ?? d.coverage ?? (100 - (d.missingPercent || 0));
        const n = d.n ?? d.sampleSize ?? ((d.nActive || 0) + (d.nCancelled || 0));
        return (cov == null || cov >= minCov) && (n == null || n >= minSample);
      });
      setOrHtml('#scDiffRows', visibleDiffs.map((d) => `
        <tr>
          <td>${escapeHtml(d.label || d.id || '—')}</td>
          <td class="num">${d.medianActive ?? d.medianNonCancelled ?? d.median0 ?? '—'}</td>
          <td class="num">${d.medianCancelled ?? d.median1 ?? '—'}</td>
          <td class="num">${d.diff ?? d.diffAbs ?? d.delta ?? '—'}</td>
          <td>${escapeHtml(String(d.measure || d.association || d.strength || '—'))}</td>
          <td class="num">${d.coveragePercent != null ? epFmtPct(d.coveragePercent) : (d.coverage != null ? epFmtPct(d.coverage) : '—')}</td>
          <td class="num">${d.n ?? d.sampleSize ?? '—'}</td>
          <td>${escapeHtml(d.note || d.interpretation || d.warning || 'Associação observada')}</td>
        </tr>`).join(''));
      const diffEmpty = document.querySelector('#scDiffEmpty');
      if (diffEmpty) diffEmpty.style.display = visibleDiffs.length ? 'none' : 'block';

      const auc = p.univariateAuc || p.predictivePower || [];
      setOrHtml('#scAucRows', auc.map((a) => `
        <tr>
          <td>${escapeHtml(a.label || a.id || '—')}</td>
          <td class="num">${a.auc ?? a.aucAdjusted ?? '—'}</td>
          <td>${escapeHtml(a.direction || a.aucDirection || '—')}</td>
          <td class="num">${a.n ?? '—'}</td>
          <td>${escapeHtml(a.warning || a.note || '—')}</td>
        </tr>`).join(''));
      const aucEmpty = document.querySelector('#scAucEmpty');
      if (aucEmpty) aucEmpty.hidden = auc.length > 0;

      const numeric = p.numericAssociations || (p.associations || []).filter((a) => /point|numeric|biserial/i.test(`${a.measure} ${a.type}`));
      const categorical = p.categoricalAssociations || (p.associations || []).filter((a) => /cramer|categ/i.test(`${a.measure} ${a.type}`));
      setOrHtml('#scChartNumeric', numeric.length ? hBars(numeric.slice(0, 12).map((a) => ({ label: a.label || a.id, count: Math.round(Math.abs(a.absMeasure ?? a.abs ?? a.value ?? 0) * 1000), percent: Math.abs(a.absMeasure ?? a.abs ?? a.value ?? 0) * 100 })), 12) : '<div class="empty" style="display:block">Não há dados suficientes para este recorte.</div>');
      setOrHtml('#scChartCategorical', categorical.length ? hBars(categorical.slice(0, 12).map((a) => ({ label: a.label || a.id, count: Math.round(Math.abs(a.absMeasure ?? a.abs ?? a.value ?? a.cramersV ?? 0) * 1000), percent: Math.abs(a.absMeasure ?? a.abs ?? a.value ?? a.cramersV ?? 0) * 100 })), 12) : '<div class="empty" style="display:block">Não há dados suficientes para este recorte.</div>');

      const seg = p.segmentAnalysis || [];
      setOrHtml('#scSegmentHost', seg.length ? `<div class="table-wrap"><table><thead><tr><th>Segmento</th><th class="num">Clientes</th><th class="num">Cancelados</th><th class="num">% cancelado</th></tr></thead><tbody>${seg.map((r) => `<tr><td>${escapeHtml(r.label || r.segment || '—')}</td><td class="num">${fmt.format(r.n || r.total || 0)}</td><td class="num">${fmt.format(r.cancelled || r.confirmedCancellations || 0)}</td><td class="num">${epFmtPct(r.rate || r.percent || r.cancelledShare)}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty" style="display:block">Não há dados suficientes para este recorte.</div>');
      setOrHtml('#scMeetingHost', (p.meetingAnalysis || []).length ? `<ul>${(p.meetingAnalysis || []).slice(0, 12).map((m) => `<li>${escapeHtml(m.label || m.id)} — ${escapeHtml(String(m.note || m.strength || m.measure || ''))}</li>`).join('')}</ul>` : '<div class="empty" style="display:block">Não há dados suficientes para este recorte.</div>');
      setOrHtml('#scFinancialHost', (p.financialUpdateAnalysis || []).length ? `<ul>${(p.financialUpdateAnalysis || []).slice(0, 12).map((m) => `<li>${escapeHtml(m.label || m.id)} — ${escapeHtml(String(m.note || m.strength || m.measure || ''))}</li>`).join('')}</ul>` : '<div class="empty" style="display:block">Não há dados suficientes para este recorte.</div>');

      const surv = p.survival?.overall || p.survival || {};
      const curve = surv.curve || [];
      setOrHtml('#scSurvivalHost', curve.length ? `<p class="note-muted">n=${surv.nStart ?? '—'} · eventos=${surv.events ?? '—'} · censurados=${surv.censored ?? '—'} · mediana=${surv.medianSurvival ?? 'não atingida'}</p><div class="table-wrap"><table><thead><tr><th>Tempo</th><th class="num">Sobrevivência</th><th class="num">Em risco</th></tr></thead><tbody>${curve.filter((_, i) => i % Math.max(1, Math.floor(curve.length / 12)) === 0 || i === curve.length - 1).map((pt) => `<tr><td>${pt.time}</td><td class="num">${pt.survival != null ? Math.round(pt.survival * 1000) / 10 + '%' : '—'}</td><td class="num">${pt.atRisk ?? '—'}</td></tr>`).join('')}</tbody></table></div>` : '<div class="empty" style="display:block">Não há dados suficientes para este recorte.</div>');

      const excluded = p.excludedVariables || [];
      setOrHtml('#scExcludedHost', excluded.length ? `<ul>${excluded.map((e) => `<li><b>${escapeHtml(e.label || e.id)}</b> — ${escapeHtml(e.reason || e.note || 'excluída')}</li>`).join('')}</ul>` : '<p class="note-muted">Nenhuma variável excluída neste recorte.</p>');

      if (typeof showSourceWarningsAlert === 'function') {
        showSourceWarningsAlert('#scSourceAlert', 'statistical-crosses-quality-warning', 'Qualidade dos cruzamentos', p.qualityWarnings || p.warnings || [], {
          note: 'Somente cancelamentos confirmados (churn efetivado ou distrato assinado).'
        });
        showSourceWarningsAlert('#scMethodAlert', 'statistical-crosses-methodology', 'Como interpretar os cruzamentos', [{
          code: 'methodology',
          label: 'Como interpretar os cruzamentos',
          message: 'Os resultados mostram associações observadas na base e não comprovam causalidade. Amostras pequenas, dados ausentes e diferenças de período podem afetar as conclusões.',
          severity: 'info'
        }], { note: 'Associação ≠ causalidade.' });
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
        if (scFilters.status?.value) params.set('status', scFilters.status.value);
        if (scFilters.segment?.value && scFilters.segment.value !== 'all') params.set('segment', scFilters.segment.value);
        if (scFilters.engineer?.value && scFilters.engineer.value !== 'all') params.set('engineer', scFilters.engineer.value);
        if (scFilters.hasMeeting?.value && scFilters.hasMeeting.value !== 'all') params.set('hasMeeting', scFilters.hasMeeting.value);
        if (scFilters.hasFinancial?.value && scFilters.hasFinancial.value !== 'all') params.set('hasFinancial', scFilters.hasFinancial.value);
        if (scFilters.minSample?.value) params.set('minSample', scFilters.minSample.value);
        if (scFilters.minCoverage?.value) params.set('minCoverage', scFilters.minCoverage.value);
        if (scFilters.hireFrom?.value) params.set('hireFrom', scFilters.hireFrom.value);
        if (scFilters.hireTo?.value) params.set('hireTo', scFilters.hireTo.value);
        const response = await apiFetch(`${endpoint}?${params}`, { cache: 'no-store' });
        const responseText = await response.text();
        let payload = {};
        try { payload = responseText ? JSON.parse(responseText) : {}; } catch { payload = {}; }
        if (requestId !== scState.requestId) return;
        if (!response.ok) {
          console.error('[Statistical Crosses API]', { endpoint, status: response.status, code: payload?.code, message: payload?.error || payload?.message, body: responseText.slice(0, 800) });
          throw Object.assign(new Error(friendlyApiError(response.status, payload)), { status: response.status, payload });
        }
        scState.payload = payload;
        fillScFilters();
        renderStatisticalCrosses();
        if (status) { status.textContent = '● Base conectada'; status.style.color = 'var(--color-success)'; }
        const updated = document.querySelector('#scUpdated');
        if (updated) updated.textContent = payload.generatedAt ? `Atualizado em ${new Date(payload.generatedAt).toLocaleString('pt-BR')}` : 'Dados carregados';
      } catch (error) {
        if (requestId !== scState.requestId) return;
        if (error?.code === 'AUTH_REQUIRED' || error?.message === 'AUTH_REQUIRED') return;
        console.error('[Statistical Crosses API]', { endpoint, status: error?.status || 0, code: error?.payload?.code, message: error?.message });
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

    Object.values(scFilters).forEach((el) => el?.addEventListener('input', () => {
      if (['minCoverage', 'minSample'].includes(el.id?.replace(/^sc/, '')?.replace(/^[A-Z]/, (m) => m.toLowerCase()) || '') || el === scFilters.minCoverage || el === scFilters.minSample) {
        renderStatisticalCrosses();
      }
    }));
    document.querySelector('#scClear')?.addEventListener('click', () => {
      ['status', 'segment', 'engineer', 'hasMeeting', 'hasFinancial'].forEach((k) => {
        if (!scFilters[k]) return;
        scFilters[k].value = k === 'status' ? 'active_cancelled' : 'all';
      });
      ['hireFrom', 'hireTo'].forEach((k) => { if (scFilters[k]) scFilters[k].value = ''; });
      if (scFilters.minCoverage) scFilters.minCoverage.value = '30';
      if (scFilters.minSample) scFilters.minSample.value = '30';
      loadStatisticalCrosses();
    });
    document.querySelector('#scRefresh')?.addEventListener('click', loadStatisticalCrosses);
    ['status', 'segment', 'engineer', 'hasMeeting', 'hasFinancial', 'hireFrom', 'hireTo'].forEach((k) => {
      scFilters[k]?.addEventListener('change', () => loadStatisticalCrosses());
    });
