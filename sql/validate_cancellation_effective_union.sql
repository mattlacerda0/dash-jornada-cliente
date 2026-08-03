-- Validação: nova regra de cancelamento efetivado (somente leitura)
-- Não altera tabelas/views.

-- A) Cancelados em public.cancellations
SELECT
  count(DISTINCT client_id) FILTER (
    WHERE archived_at IS NULL AND churn_efetivado_at IS NOT NULL
  ) AS only_or_with_churn_efetivado_at,
  count(DISTINCT client_id) FILTER (
    WHERE archived_at IS NULL
      AND distrato_assinado_at IS NOT NULL
  ) AS with_distrato_assinado_at,
  count(DISTINCT client_id) FILTER (
    WHERE archived_at IS NULL
      AND lower(trim(coalesce(distrato, ''))) LIKE '%assinado%'
      AND churn_efetivado_at IS NULL
      AND distrato_assinado_at IS NULL
  ) AS only_distrato_text_assinado,
  count(DISTINCT client_id) FILTER (
    WHERE archived_at IS NULL
      AND (
        churn_efetivado_at IS NOT NULL
        OR distrato_assinado_at IS NOT NULL
        OR lower(trim(coalesce(distrato, ''))) LIKE '%assinado%'
      )
  ) AS cancellations_confirmed_distinct
FROM public.cancellations;

-- B) Cancelados em clients.data_churn
SELECT count(DISTINCT id) AS clients_with_data_churn
FROM public.clients
WHERE data_churn IS NOT NULL;

-- C) Total consolidado (união distinta)
WITH cancel_ids AS (
  SELECT DISTINCT client_id::text AS client_id
  FROM public.cancellations
  WHERE archived_at IS NULL
    AND (
      churn_efetivado_at IS NOT NULL
      OR distrato_assinado_at IS NOT NULL
      OR lower(trim(coalesce(distrato, ''))) LIKE '%assinado%'
    )
),
churn_ids AS (
  SELECT DISTINCT id::text AS client_id
  FROM public.clients
  WHERE data_churn IS NOT NULL
),
union_ids AS (
  SELECT client_id FROM cancel_ids
  UNION
  SELECT client_id FROM churn_ids
)
SELECT
  (SELECT count(*) FROM cancel_ids) AS from_cancellations,
  (SELECT count(*) FROM churn_ids) AS from_data_churn,
  (SELECT count(*) FROM cancel_ids c JOIN churn_ids d USING (client_id)) AS overlap,
  (SELECT count(*) FROM union_ids) AS total_distinct_effective;

-- D) Ativos com intenção (sem efetivação consolidada)
WITH effective AS (
  SELECT DISTINCT client_id::text AS client_id
  FROM public.cancellations
  WHERE archived_at IS NULL
    AND (
      churn_efetivado_at IS NOT NULL
      OR distrato_assinado_at IS NOT NULL
      OR lower(trim(coalesce(distrato, ''))) LIKE '%assinado%'
    )
  UNION
  SELECT DISTINCT id::text
  FROM public.clients
  WHERE data_churn IS NOT NULL
),
intentions AS (
  SELECT DISTINCT c.client_id::text AS client_id
  FROM public.cancellations c
  WHERE c.archived_at IS NULL
    AND c.intencao_registrada_at IS NOT NULL
)
SELECT count(DISTINCT i.client_id) AS active_with_intention
FROM intentions i
JOIN public.clients cl ON cl.id::text = i.client_id
WHERE lower(trim(coalesce(cl.status, ''))) IN ('ativo', 'active', 'ativa')
  AND i.client_id NOT IN (SELECT client_id FROM effective);

-- E) Etapa exclusiva (amostra de contagem)
WITH base AS (
  SELECT
    c.client_id,
    bool_or(
      c.archived_at IS NULL AND (
        c.churn_efetivado_at IS NOT NULL
        OR c.distrato_assinado_at IS NOT NULL
        OR lower(trim(coalesce(c.distrato, ''))) LIKE '%assinado%'
      )
    ) OR bool_or(cl.data_churn IS NOT NULL) AS efetivado,
    bool_or(c.archived_at IS NULL AND c.data_pedido IS NOT NULL) AS pedido,
    bool_or(c.archived_at IS NULL AND c.intencao_registrada_at IS NOT NULL) AS intencao
  FROM public.cancellations c
  LEFT JOIN public.clients cl ON cl.id = c.client_id
  GROUP BY c.client_id
)
SELECT
  count(*) FILTER (WHERE efetivado) AS stage_efetivado,
  count(*) FILTER (WHERE NOT efetivado AND pedido) AS stage_pedido,
  count(*) FILTER (WHERE NOT efetivado AND NOT pedido AND intencao) AS stage_intencao
FROM base;

-- F) Mensal intenções vs efetivados (últimos 12 meses, UTC)
SELECT
  to_char(date_trunc('month', intencao_registrada_at AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
  count(DISTINCT client_id) AS intentions
FROM public.cancellations
WHERE archived_at IS NULL
  AND intencao_registrada_at IS NOT NULL
  AND intencao_registrada_at >= (now() AT TIME ZONE 'UTC') - interval '12 months'
GROUP BY 1
ORDER BY 1;

-- F) Mensal: data analítica consolidada (churn > distrato_at > data_churn)
WITH analytical AS (
  SELECT
    cl.id::text AS client_id,
    coalesce(
      (
        SELECT min(x.churn_efetivado_at)
        FROM public.cancellations x
        WHERE x.client_id = cl.id AND x.archived_at IS NULL AND x.churn_efetivado_at IS NOT NULL
      ),
      (
        SELECT min(x.distrato_assinado_at)
        FROM public.cancellations x
        WHERE x.client_id = cl.id AND x.archived_at IS NULL AND x.distrato_assinado_at IS NOT NULL
      ),
      cl.data_churn
    ) AS cancellation_date
  FROM public.clients cl
)
SELECT
  to_char(date_trunc('month', cancellation_date AT TIME ZONE 'UTC'), 'YYYY-MM') AS month,
  count(DISTINCT client_id) AS effective_with_confirmed_date
FROM analytical
WHERE cancellation_date IS NOT NULL
  AND cancellation_date >= (now() AT TIME ZONE 'UTC') - interval '12 months'
GROUP BY 1
ORDER BY 1;
