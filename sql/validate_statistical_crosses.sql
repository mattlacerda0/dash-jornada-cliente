-- Validação SQL · Cruzamentos Estatísticos
-- Comparar com GET /api/statistical-crosses (diferença permitida: 0 com mesmos filtros).

WITH cancel AS (
  SELECT DISTINCT ON (client_id)
    client_id,
    COALESCE(churn_efetivado_at, distrato_assinado_at) AS cancellation_date
  FROM public.cancellations
  WHERE archived_at IS NULL
    AND (churn_efetivado_at IS NOT NULL OR distrato_assinado_at IS NOT NULL)
  ORDER BY client_id,
    CASE WHEN churn_efetivado_at IS NOT NULL THEN 0 ELSE 1 END,
    COALESCE(churn_efetivado_at, distrato_assinado_at) DESC
),
base AS (
  SELECT
    c.id,
    cancel.client_id IS NOT NULL AS is_cancelled,
    cancel.cancellation_date
  FROM public.clients c
  LEFT JOIN cancel ON cancel.client_id = c.id
)
SELECT
  COUNT(*) AS populacao_total,
  COUNT(*) FILTER (WHERE is_cancelled) AS cancelamentos_confirmados,
  COUNT(*) FILTER (WHERE NOT is_cancelled) AS censurados
FROM base;

-- Distribuição por segmento (usa segmentacao bruta; o portal pode recalcular OVER etc.)
SELECT
  COALESCE(NULLIF(TRIM(c.segmentacao), ''), 'Dados insuficientes') AS segmento,
  COUNT(*) AS clientes,
  COUNT(*) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM public.cancellations x
      WHERE x.client_id = c.id
        AND x.archived_at IS NULL
        AND (x.churn_efetivado_at IS NOT NULL OR x.distrato_assinado_at IS NOT NULL)
    )
  ) AS cancelados_confirmados
FROM public.clients c
GROUP BY 1
ORDER BY 2 DESC;

-- Datas inválidas / cancelamento anterior à contratação (aprox.)
SELECT COUNT(*) AS cancelamento_antes_contratacao
FROM public.clients c
JOIN public.cancellations x ON x.client_id = c.id
WHERE x.archived_at IS NULL
  AND (x.churn_efetivado_at IS NOT NULL OR x.distrato_assinado_at IS NOT NULL)
  AND c.data_inicio_ciclo IS NOT NULL
  AND COALESCE(x.churn_efetivado_at, x.distrato_assinado_at) < c.data_inicio_ciclo::timestamptz;
