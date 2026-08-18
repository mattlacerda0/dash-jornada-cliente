import { requireCorporateAuth } from "./_shared/auth.mjs";
import { buildPortalSnapshot } from "./_shared/portal-snapshot-builder.mjs";
import {
  acquireRefreshLock,
  isServerlessRuntime,
  readLockInfo,
  readPortalSnapshot,
  releaseRefreshLock,
  writePortalSnapshot,
} from "./_shared/portal-snapshot-store.mjs";

function json(data, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export default async function handler(request) {
  const denied = await requireCorporateAuth(request);
  if (denied) return denied;

  if (request.method === "GET") {
    const snapshot = await readPortalSnapshot();
    if (!snapshot) {
      return json(
        {
          error: "Snapshot do portal ainda não foi gerado.",
          code: "portal_snapshot_missing",
        },
        404,
      );
    }
    return json(snapshot);
  }

  if (request.method === "POST") {
    if (isServerlessRuntime()) {
      return json(
        {
          error: "No ambiente serverless o snapshot unificado não é persistido. O portal atualiza cada aba pelas APIs.",
          code: "portal_snapshot_serverless_unsupported",
        },
        501,
      );
    }
    const acquired = await acquireRefreshLock();
    if (!acquired) {
      const lock = await readLockInfo();
      return json(
        {
          error: "Uma atualização do portal já está em andamento.",
          code: "portal_snapshot_refresh_in_progress",
          lock,
        },
        409,
      );
    }

    try {
      const snapshot = await buildPortalSnapshot();
      const saved = await writePortalSnapshot(snapshot);
      return json(saved);
    } catch (error) {
      console.error("[Portal Snapshot] refresh failed:", error instanceof Error ? error.message : error);
      return json(
        {
          error: "Não foi possível regenerar o snapshot do portal.",
          code: "portal_snapshot_refresh_failed",
          detail: error instanceof Error ? error.message : String(error),
        },
        500,
      );
    } finally {
      await releaseRefreshLock();
    }
  }

  return json({ error: "Método não permitido.", code: "method_not_allowed" }, 405);
}
