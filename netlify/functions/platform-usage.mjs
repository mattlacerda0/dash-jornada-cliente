const SOURCE = {
  id: "qv360",
  label: "QV360",
  schema: process.env.QV360_SUPABASE_SCHEMA || "public",
  url:
    process.env.QV360_SUPABASE_URL ||
    process.env.SUPABASE_QV360_URL ||
    "https://sfxbzfaxbbdjzuhzzrjc.supabase.co",
  key: process.env.QV360_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_QV360_SERVICE_ROLE_KEY,
};

function parseDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfDay(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(start, end) {
  if (!start || !end) return null;
  return Math.floor((startOfDay(end).getTime() - startOfDay(start).getTime()) / 86400000);
}

function monthsBetween(start, end) {
  if (!start || !end) return 1;
  const months = (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth();
  return Math.max(1, months + 1);
}

function average(values) {
  const nums = values.filter((v) => Number.isFinite(v));
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

function median(values) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!nums.length) return null;
  const mid = Math.floor(nums.length / 2);
  return nums.length % 2 ? nums[mid] : Math.round(((nums[mid - 1] + nums[mid]) / 2) * 100) / 100;
}

function pct(count, total) {
  return total ? Math.round((count / total) * 1000) / 10 : 0;
}

function firstValue(row, fields) {
  for (const field of fields) {
    const value = row?.[field];
    if (value !== null && value !== undefined && value !== "") return value;
  }
  return null;
}

async function fetchAll(table, select = "*", warnings = []) {
  const pageSize = 1000;
  const rows = [];
  let offset = 0;
  while (true) {
    const url = new URL(`/rest/v1/${table}`, SOURCE.url);
    url.searchParams.set("select", select);
    const response = await fetch(url, {
      headers: {
        apikey: SOURCE.key,
        Authorization: `Bearer ${SOURCE.key}`,
        "Accept-Profile": SOURCE.schema,
        "Content-Profile": SOURCE.schema,
        Range: `${offset}-${offset + pageSize - 1}`,
      },
    });
    if (!response.ok) {
      warnings.push(`${table}: HTTP ${response.status}`);
      return [];
    }
    const batch = await response.json();
    rows.push(...batch);
    if (batch.length < pageSize) break;
    offset += pageSize;
    if (offset > 200000) break;
  }
  return rows;
}

function userIdFrom(row) {
  return String(firstValue(row, ["user_id", "id"]) || "");
}

function buildClientUsage(users, logins, sessions) {
  const byUser = new Map();
  for (const user of users) {
    const id = userIdFrom(user);
    if (!id) continue;
    byUser.set(id, {
      source: SOURCE.label,
      userId: id,
      userName: [user.first_name, user.last_name].filter(Boolean).join(" ") || user.full_name || user.email || "Não informado",
      email: user.email || "Não informado",
      joinedAt: firstValue(user, ["date_joined", "created_at"]) || null,
      lastLoginFromUser: firstValue(user, ["last_login"]) || null,
      logins: [],
      sessions: new Set(),
    });
  }
  for (const login of logins) {
    const id = userIdFrom(login);
    if (!id) continue;
    if (!byUser.has(id)) {
      byUser.set(id, {
        source: SOURCE.label,
        userId: id,
        userName: "Não informado",
        email: "Não informado",
        joinedAt: null,
        lastLoginFromUser: null,
        logins: [],
        sessions: new Set(),
      });
    }
    const item = byUser.get(id);
    const timestamp = firstValue(login, ["timestamp", "created_at"]);
    if (timestamp) item.logins.push({ timestamp, sessionId: firstValue(login, ["session_id"]) });
    const sessionId = firstValue(login, ["session_id"]);
    if (sessionId) item.sessions.add(String(sessionId));
  }
  for (const session of sessions) {
    const id = userIdFrom(session);
    if (!id) continue;
    if (!byUser.has(id)) continue;
    const sessionId = firstValue(session, ["id", "sid", "key_hashed"]);
    if (sessionId) byUser.get(id).sessions.add(String(sessionId));
  }

  const now = new Date();
  return [...byUser.values()].map((client) => {
    const loginDates = client.logins
      .map((login) => parseDate(login.timestamp))
      .filter(Boolean)
      .sort((a, b) => a - b);
    const lastLoginDate = loginDates[loginDates.length - 1] || parseDate(client.lastLoginFromUser);
    const firstLoginDate = loginDates[0] || parseDate(client.joinedAt) || lastLoginDate;
    const intervals = [];
    for (let i = 1; i < loginDates.length; i += 1) {
      const diff = daysBetween(loginDates[i - 1], loginDates[i]);
      if (diff != null && diff >= 0) intervals.push(diff);
    }
    const monthSpan = monthsBetween(firstLoginDate, now);
    const weekSpan = Math.max(1, Math.ceil((daysBetween(firstLoginDate, now) || 1) / 7));
    const monthlyBuckets = new Set(loginDates.map((d) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`));
    const weeklyBuckets = new Set(loginDates.map((d) => {
      const start = Date.UTC(d.getUTCFullYear(), 0, 1);
      return `${d.getUTCFullYear()}-${Math.ceil(((d.getTime() - start) / 86400000 + 1) / 7)}`;
    }));
    return {
      source: SOURCE.label,
      userId: client.userId,
      userName: client.userName,
      email: client.email,
      joinedAt: client.joinedAt,
      realizedLogin: Boolean(loginDates.length || client.lastLoginFromUser),
      totalLogins: loginDates.length,
      loginsPerMonth: Math.round((loginDates.length / monthSpan) * 100) / 100,
      daysSinceLastAccess: daysBetween(lastLoginDate, now),
      averageDaysBetweenAccesses: average(intervals),
      typicalDaysBetweenAccesses: median(intervals),
      averageSessionMinutes: null,
      totalSessions: client.sessions.size || loginDates.length,
      weeklyAccessFrequency: Math.round((loginDates.length / weekSpan) * 100) / 100,
      monthlyAccessFrequency: Math.round((loginDates.length / monthSpan) * 100) / 100,
      activeWeeks: weeklyBuckets.size,
      activeMonths: monthlyBuckets.size,
      firstAccessAt: firstLoginDate ? firstLoginDate.toISOString() : null,
      lastAccessAt: lastLoginDate ? lastLoginDate.toISOString() : null,
    };
  });
}

function indicator(indicator, value, total, metric, viability = "Sim") {
  return {
    indicator,
    viability,
    value,
    total,
    coverage: pct(value, total),
    metric,
  };
}

export default async function handler() {
  if (!SOURCE.key) {
    return Response.json(
      { error: "Configure QV360_SUPABASE_SERVICE_ROLE_KEY para consultar uso da plataforma." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  const warnings = [];
  const [users, logins, sessions] = await Promise.all([
    fetchAll("core_user", "id,email,first_name,last_name,date_joined,last_login", warnings),
    fetchAll("login_history", "id,timestamp,user_id,session_id,device_id,ip_address", warnings),
    fetchAll("core_session", "id,user_id,created_at,key_hashed", warnings),
  ]);
  const clients = buildClientUsage(users, logins, sessions);
  const total = clients.length;
  const withLogin = clients.filter((c) => c.realizedLogin).length;
  const totalLogins = clients.reduce((sum, c) => sum + c.totalLogins, 0);
  const totalSessions = clients.reduce((sum, c) => sum + c.totalSessions, 0);
  const intervals = clients.map((c) => c.averageDaysBetweenAccesses).filter((v) => v != null);
  const sessionDurationCoverage = 0;
  const summary = {
    totalUsers: total,
    usersWithLogin: withLogin,
    loginCoverage: pct(withLogin, total),
    totalLogins,
    totalSessions,
    averageLoginsPerMonth: average(clients.map((c) => c.loginsPerMonth)),
    averageDaysSinceLastAccess: average(clients.map((c) => c.daysSinceLastAccess)),
    typicalDaysSinceLastAccess: median(clients.map((c) => c.daysSinceLastAccess)),
    averageDaysBetweenAccesses: average(intervals),
    typicalDaysBetweenAccesses: median(intervals),
    averageSessionMinutes: null,
    averageWeeklyFrequency: average(clients.map((c) => c.weeklyAccessFrequency)),
    averageMonthlyFrequency: average(clients.map((c) => c.monthlyAccessFrequency)),
  };
  return Response.json(
    {
      generatedAt: new Date().toISOString(),
      summary,
      sources: {
        databases: [
          {
            source: SOURCE.label,
            schema: SOURCE.schema,
            clientTable: "core_user",
            loginTable: "login_history",
            sessionTable: "core_session",
            userCount: users.length,
            loginCount: logins.length,
            sessionCount: sessions.length,
          },
          {
            source: "App Pharus",
            schema: "core",
            clientTable: null,
            loginTable: null,
            sessionTable: null,
            note: "Não foram identificadas tabelas de login/sessão/acesso no App Pharus.",
          },
        ],
        warnings,
      },
      indicators: [
        indicator("Realizou login? (Sim/Não)", withLogin, total, "QV360.login_history por user_id ou core_user.last_login", "Viável somente no QV360"),
        indicator("Número total de logins", clients.filter((c) => c.totalLogins > 0).length, total, "Contagem de QV360.login_history por user_id", "Viável somente no QV360"),
        indicator("Média de logins por mês", clients.filter((c) => c.loginsPerMonth != null).length, total, "Total de logins dividido pelos meses entre primeiro login e hoje", "Viável somente no QV360"),
        indicator("Dias desde o último acesso", clients.filter((c) => c.daysSinceLastAccess != null).length, total, "Data atual menos último QV360.login_history.timestamp ou core_user.last_login", "Viável somente no QV360"),
        indicator("Tempo médio entre acessos", clients.filter((c) => c.averageDaysBetweenAccesses != null).length, total, "Média dos intervalos entre logins consecutivos", "Viável somente no QV360"),
        indicator("Tempo médio de sessão", sessionDurationCoverage, total, "Sem campo confiável de encerramento/logout ou duração de sessão", "Sem dados"),
        indicator("Quantidade de sessões", clients.filter((c) => c.totalSessions > 0).length, total, "Distinct login_history.session_id ou registros em core_session", "Viável somente no QV360"),
        indicator("Frequência semanal de acesso", clients.filter((c) => c.weeklyAccessFrequency != null).length, total, "Total de logins dividido pelas semanas desde o primeiro acesso", "Viável somente no QV360"),
        indicator("Frequência mensal de acesso", clients.filter((c) => c.monthlyAccessFrequency != null).length, total, "Total de logins dividido pelos meses desde o primeiro acesso", "Viável somente no QV360"),
      ],
      clients,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
