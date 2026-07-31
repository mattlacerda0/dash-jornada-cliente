import { readFileSync, existsSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const name of [".env", "exemplo.env"]) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const raw of readFileSync(path, "utf8").replace(/^\uFEFF/, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !(String(process.env[key] || "").trim())) process.env[key] = value;
  }
}
process.env.PORTAL_INTERNAL_DATA_RUN = "1";

const { computeMechanismsPayload } = await import("../netlify/functions/mechanisms.mjs");
const { computePharusMechanismsPayload } = await import("../netlify/functions/pharus-mechanisms.mjs");

const out = {};
try {
  const m = await computeMechanismsPayload();
  const by = m.distributions?.byAdvisor || m.distributions?.byEngineer || [];
  const warns = m.quality?.warnings || [];
  const uniq = new Set(warns.map((w) => String(w).trim()));
  out.baseQv = {
    ok: true,
    clientsWithMechanisms: m.summary?.clientsWithMechanisms,
    portfolioClients: m.summary?.portfolioClients,
    epCount: by.length,
    topEp: by.slice(0, 5).map((r) => ({
      engineer: r.engineer,
      totalClients: r.totalClients,
      withImpl: r.clientsWithImplemented,
      without: r.clientsWithoutImplemented,
      percent: r.implementationPercent,
      implementations: r.implementations,
      types: r.typesImplemented,
    })),
    warningCount: warns.length,
    uniqueWarnings: uniq.size,
    duplicateWarnings: warns.length !== uniq.size,
    sampleWarnings: warns.slice(0, 5),
  };
} catch (e) {
  out.baseQv = { ok: false, error: e.message };
}

try {
  const p = await computePharusMechanismsPayload();
  out.appPharus = {
    ok: p.success !== false && p.available !== false,
    available: p.available,
    status: p.source?.status,
    schema: p.source?.schema,
    message: p.source?.message,
    summary: p.summary,
    metadata: p.metadata,
    rowsCount: (p.rows || []).length,
    sampleRows: (p.rows || []).slice(0, 3).map((r) => ({
      userId: r.userId,
      userName: r.userName,
      mechanismName: r.mechanismName,
      status: r.status,
    })),
    catalogByEngine: p.catalogByEngine,
    topSuggested: (p.suggestionsByMechanism || []).slice(0, 8),
    statusDistribution: p.statusDistribution,
    onlySuggested: p.summary?.onlySuggestedStatus,
    warnings: (p.qualityWarnings || []).slice(0, 8),
    publicSchema404: (p.qualityWarnings || []).some((w) => /schema public|HTTP 404/i.test(String(w.message || w))),
  };
  out.combined = {
    mode: "gross_sum",
    baseQv: out.baseQv?.clientsWithMechanisms ?? null,
    appPharus: p.summary?.usersWithMechanisms ?? p.summary?.usersWithSuggestion ?? null,
    total: (out.baseQv?.clientsWithMechanisms || 0) + (p.summary?.usersWithMechanisms || p.summary?.usersWithSuggestion || 0),
  };
} catch (e) {
  out.appPharus = { ok: false, error: e.message };
}

writeFileSync(resolve(root, "scripts/_mechanisms_pharus_smoke.json"), JSON.stringify(out, null, 2), "utf8");
console.log(JSON.stringify(out, null, 2));
