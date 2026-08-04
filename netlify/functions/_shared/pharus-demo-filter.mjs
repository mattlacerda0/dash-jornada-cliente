import { getPharusEnv } from "./env.mjs";

const DEMO_EMAIL = /@demo\.com(?:$|\b)/i;
let identitiesPromise = null;

export function isPharusDemoEmail(value) {
  return DEMO_EMAIL.test(String(value || "").trim());
}

export function pharusRowEmail(row) {
  const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return row?.email || row?.alternative_email || row?.user_email || metadata.email || metadata.user_email || "";
}

export function filterPharusDemoRows(rows, identities, userIdFields = ["user_id", "userId", "client_id"]) {
  const demoIds = identities?.userIds || new Set();
  return (rows || []).filter((row) => {
    if (isPharusDemoEmail(pharusRowEmail(row))) return false;
    const metadata = row?.metadata && typeof row.metadata === "object" ? row.metadata : {};
    return !userIdFields.some((field) =>
      (row?.[field] != null && demoIds.has(String(row[field])))
      || (metadata?.[field] != null && demoIds.has(String(metadata[field]))),
    );
  });
}

export async function fetchPharusDemoIdentities(warnings = []) {
  if (identitiesPromise) return identitiesPromise;
  identitiesPromise = (async () => {
    const env = getPharusEnv();
    const userIds = new Set();
    const emails = new Set();
    if (!env.url || !env.serviceRoleKey) {
      warnings.push({ code: "PHARUS_DEMO_FILTER_PARTIAL", severity: "warning", message: "Filtro @demo.com parcial: service role do Pharus indisponível para consultar Auth." });
      return { userIds, emails, available: false };
    }
    try {
      for (let page = 1; page <= 100; page += 1) {
        const endpoint = new URL("/auth/v1/admin/users", env.url);
        endpoint.searchParams.set("page", String(page));
        endpoint.searchParams.set("per_page", "1000");
        const response = await fetch(endpoint, { headers: { apikey: env.serviceRoleKey, Authorization: `Bearer ${env.serviceRoleKey}` } });
        if (!response.ok) throw new Error(`Auth users: HTTP ${response.status}`);
        const payload = await response.json();
        const users = Array.isArray(payload) ? payload : payload?.users || [];
        for (const user of users) {
          if (!isPharusDemoEmail(user?.email)) continue;
          if (user?.id) userIds.add(String(user.id));
          if (user?.email) emails.add(String(user.email).toLowerCase());
        }
        if (users.length < 1000) break;
      }
      return { userIds, emails, available: true };
    } catch (error) {
      warnings.push({ code: "PHARUS_DEMO_FILTER_PARTIAL", severity: "warning", message: `Filtro @demo.com parcial: ${error?.message || error}` });
      return { userIds, emails, available: false };
    }
  })();
  return identitiesPromise;
}
