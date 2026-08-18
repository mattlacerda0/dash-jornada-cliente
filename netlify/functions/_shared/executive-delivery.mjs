/**
 * Entrega da análise executiva (Etapa 8.5).
 * Composer é a fonte. Gemini só refina redação. Cache + single-flight.
 */

import { buildExecutiveAnalysis } from "./executive-analysis.mjs";
import { composeDeterministicAnalysis } from "./executive-composer.mjs";
import { extractExecutiveCandidates } from "./executive-candidates.mjs";
import { refineExecutiveWording, GEMINI_REFINEMENT_TIMEOUT_MS } from "./executive-ai.mjs";
import { isExecutiveGeminiEnabled } from "./env.mjs";
import {
  getExecutiveCache,
  setExecutiveCache,
  makeExecutiveCacheKey,
  withExecutiveSingleFlight,
} from "./executive-cache.mjs";

function nowIso() {
  return new Date().toISOString();
}

function successPayload(engine, composed, extraMeta, timing) {
  const analysis = composed.executive_analysis;
  return {
    success: true,
    page: engine.page,
    title: engine.title,
    generated_at: extraMeta.generated_at || nowIso(),
    analysis_context: engine.analysis_context,
    executive_snapshot: engine.analysis_context?.executive_snapshot || null,
    executive_analysis: analysis,
    metadata: {
      ai_generated: extraMeta.ai_generated === true,
      generation_mode: extraMeta.generation_mode || "deterministic",
      model: extraMeta.model || null,
      generated_at: extraMeta.generated_at || nowIso(),
      composer_version: composed.metadata?.composer_version || null,
      debug_limitations: composed.debug_limitations || [],
      scope: analysis?.scope || engine.analysis_context?.executive_snapshot?.scope || null,
      snapshot_bytes: engine.analysis_context?.metadata?.snapshot_bytes || null,
      context_bytes_without_snapshot: engine.analysis_context?.metadata?.context_bytes_without_snapshot || null,
      cache_hit: extraMeta.cache_hit === true,
      gemini_fallback_reason: extraMeta.gemini_fallback_reason || null,
    },
    timing_ms: timing,
  };
}

function engineTiming(engine) {
  return engine?.analysis_context?.metadata?.timing_ms || {};
}

/**
 * @param {{ page: string, filters?: object, generate?: boolean, refresh?: boolean }} input
 * @param {{ fetchImpl?: typeof fetch, engineResult?: object, skipGemini?: boolean }} [options]
 */
export async function deliverExecutiveAnalysis(input = {}, options = {}) {
  const page = input.page;
  const filters = input.filters && typeof input.filters === "object" ? input.filters : {};
  const generate = input.generate === true || input.generate === "true" || input.generate === 1;
  const refresh = input.refresh === true || input.refresh === "true";

  if (!generate) {
    return options.engineResult || buildExecutiveAnalysis({ page, filters });
  }

  const key = makeExecutiveCacheKey(page, filters);
  if (!refresh) {
    const cached = getExecutiveCache(key);
    if (cached) {
      return {
        ...cached,
        metadata: { ...cached.metadata, cache_hit: true },
        timing_ms: {
          compute_payload: 0,
          snapshot: 0,
          engine: 0,
          composer: 0,
          gemini: 0,
          total: cached.timing_ms?.total_cached || 0,
          cache_hit: true,
        },
      };
    }
  }

  return withExecutiveSingleFlight(key, async () => {
    if (!refresh) {
      const cached = getExecutiveCache(key);
      if (cached) {
        return {
          ...cached,
          metadata: { ...cached.metadata, cache_hit: true },
          timing_ms: { ...(cached.timing_ms || {}), cache_hit: true, total: 0 },
        };
      }
    }

    const engine = options.engineResult || await buildExecutiveAnalysis({ page, filters });
    if (!engine?.success) return engine;

    const snapshot = engine.analysis_context?.executive_snapshot;
    if (!snapshot) {
      return {
        success: false,
        code: "data_query_failed",
        error: "Snapshot executivo indisponível.",
        generated_at: nowIso(),
        page: engine.page,
      };
    }

    const candidates = extractExecutiveCandidates(engine.analysis_context);
    const composed = composeDeterministicAnalysis(snapshot, candidates);
    const et = engineTiming(engine);
    const generatedAt = nowIso();
    let timing = {
      compute_payload: et.compute_payload ?? null,
      snapshot: et.snapshot ?? null,
      engine: et.engine ?? null,
      composer: composed.timing_ms?.composer ?? 0,
      gemini: 0,
      total: (et.compute_payload || 0) + (et.snapshot || 0) + (et.engine || 0) + (composed.timing_ms?.composer || 0),
    };

    let payload = successPayload(engine, composed, {
      generation_mode: "deterministic",
      ai_generated: false,
      generated_at: generatedAt,
    }, timing);
    setExecutiveCache(key, payload);

    const skipGemini = options.skipGemini === true || !isExecutiveGeminiEnabled();
    if (skipGemini) return payload;

    const refined = await refineExecutiveWording(composed.executive_analysis, {
      page: engine.page,
      snapshot,
      analysisContext: engine.analysis_context,
      fetchImpl: options.fetchImpl,
      timeoutMs: options.geminiTimeoutMs ?? GEMINI_REFINEMENT_TIMEOUT_MS,
    });
    timing = {
      ...timing,
      gemini: refined.timing_ms?.gemini ?? 0,
      total: timing.total + (refined.timing_ms?.gemini || 0),
    };

    if (refined.success && refined.executive_analysis) {
      payload = successPayload(engine, { ...composed, executive_analysis: refined.executive_analysis }, {
        generation_mode: "gemini_refined",
        ai_generated: true,
        model: refined.metadata?.model || null,
        generated_at: refined.metadata?.generated_at || generatedAt,
      }, timing);
      setExecutiveCache(key, payload);
      return payload;
    }

    payload = {
      ...payload,
      timing_ms: timing,
      metadata: {
        ...payload.metadata,
        generation_mode: "deterministic",
        gemini_fallback_reason: refined.reason || refined.code || "gemini_unavailable",
      },
    };
    setExecutiveCache(key, payload);
    return payload;
  });
}
