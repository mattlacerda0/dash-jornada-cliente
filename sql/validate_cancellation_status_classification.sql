-- Validação: regra consolidada de cancelamento efetivado (somente leitura)
-- Não altera tabelas/views.

-- A) CLIENTES COM DATA_CHURN
SELECT count(DISTINCT id) AS clientes_com_data_churn
FROM public.clients
WHERE data_churn IS NOT NULL;

-- B) FONTES EM CANCELLATIONS
SELECT
  count(DISTINCT client_id) FILTER (
    WHERE archived_at IS NULL AND churn_efetivado_at IS NOT NULL
  ) AS with_churn_efetivado_at,
  count(DISTINCT client_id) FILTER (
    WHERE archived_at IS NULL AND distrato_assinado_at IS NOT NULL
  ) AS with_distrato_assinado_at,
  count(DISTINCT client_id) FILTER (
    WHERE archived_at IS NULL
      AND lower(trim(coalesce(distrato, ''))) LIKE '%assinado%'
      AND churn_efetivado_at IS NULL
      AND distrato_assinado_at IS NULL
  ) AS only_distrato_text_assinado
FROM public.cancellations;

-- C) UNIÃO DISTINTA (efetivados)
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
  (SELECT count(*) FROM union_ids) AS total_distinct_effective,
  (SELECT count(*) FROM churn_ids d WHERE NOT EXISTS (
    SELECT 1 FROM cancel_ids c WHERE c.client_id = d.client_id
  )) AS data_churn_sem_cancellations;

-- D) CLASSIFICAÇÃO ANALÍTICA (status bruto × evidência)
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
  SELECT DISTINCT id::text FROM public.clients WHERE data_churn IS NOT NULL
),
effective_with_date AS (
  SELECT DISTINCT client_id::text AS client_id
  FROM public.cancellations
  WHERE archived_at IS NULL
    AND (churn_efetivado_at IS NOT NULL OR distrato_assinado_at IS NOT NULL)
  UNION
  SELECT DISTINCT id::text FROM public.clients WHERE data_churn IS NOT NULL
),
norm AS (
  SELECT
    id::text AS client_id,
    lower(trim(coalesce(status, ''))) AS st
  FROM public.clients
)
SELECT
  count(*) FILTER (
    WHERE n.st IN ('ativo', 'active', 'ativa') AND e.client_id IS NULL
  ) AS ativos,
  count(*) FILTER (
    WHERE n.st LIKE '%congel%' AND e.client_id IS NULL
  ) AS congelados,
  count(*) FILTER (WHERE d.client_id IS NOT NULL) AS cancelados_com_data,
  count(*) FILTER (
    WHERE e.client_id IS NOT NULL AND d.client_id IS NULL
  ) AS cancelados_efetivados_sem_data,
  count(*) FILTER (
    WHERE e.client_id IS NULL
      AND (
        n.st LIKE '%cancel%'
        OR n.st LIKE '%churn%'
        OR n.st IN ('inativo', 'inactive', 'encerrado', 'encerrada')
      )
  ) AS marcados_sem_confirmacao,
  count(*) FILTER (
    WHERE e.client_id IS NULL
      AND coalesce(n.st, '') = ''
  ) AS status_vazio,
  count(*) FILTER (
    WHERE e.client_id IS NULL
      AND coalesce(n.st, '') <> ''
      AND n.st NOT IN ('ativo', 'active', 'ativa')
      AND n.st NOT LIKE '%congel%'
      AND n.st NOT LIKE '%cancel%'
      AND n.st NOT LIKE '%churn%'
      AND n.st NOT IN ('inativo', 'inactive', 'encerrado', 'encerrada')
  ) AS nao_informados_reais
FROM norm n
LEFT JOIN effective e ON e.client_id = n.client_id
LEFT JOIN effective_with_date d ON d.client_id = n.client_id;

-- E) DIVERGÊNCIA DE DATAS (mesmo cliente, fontes distintas)
WITH dates AS (
  SELECT
    c.id::text AS client_id,
    (SELECT min(x.churn_efetivado_at)
       FROM public.cancellations x
      WHERE x.client_id = c.id AND x.archived_at IS NULL AND x.churn_efetivado_at IS NOT NULL) AS churn_at,
    (SELECT min(x.distrato_assinado_at)
       FROM public.cancellations x
      WHERE x.client_id = c.id AND x.archived_at IS NULL AND x.distrato_assinado_at IS NOT NULL) AS distrato_at,
    c.data_churn
  FROM public.clients c
)
SELECT
  count(*) FILTER (
    WHERE (
      (churn_at IS NOT NULL)::int
      + (distrato_at IS NOT NULL)::int
      + (data_churn IS NOT NULL)::int
    ) >= 2
    AND date_trunc('day', coalesce(churn_at, distrato_at, data_churn))
      = date_trunc('day', coalesce(data_churn, distrato_at, churn_at))
  ) AS datas_iguais_aprox,
  count(*) FILTER (
    WHERE churn_at IS NOT NULL AND data_churn IS NOT NULL
      AND abs(extract(epoch FROM (churn_at - data_churn))) > 86400
  ) AS churn_vs_data_churn_gt_1d,
  count(*) FILTER (
    WHERE distrato_at IS NOT NULL AND data_churn IS NOT NULL
      AND abs(extract(epoch FROM (distrato_at - data_churn))) > 86400
  ) AS distrato_vs_data_churn_gt_1d
FROM dates;

-- F) PRIORIDADE DA DATA ANALÍTICA (amostra)
WITH base AS (
  SELECT
    cl.id,
    can.churn_efetivado_at,
    can.distrato_assinado_at,
    cl.data_churn,
    CASE
      WHEN can.churn_efetivado_at IS NOT NULL THEN 'churn_efetivado_at'
      WHEN can.distrato_assinado_at IS NOT NULL THEN 'distrato_assinado_at'
      WHEN cl.data_churn IS NOT NULL THEN 'clients.data_churn'
      WHEN lower(trim(coalesce(can.distrato, ''))) LIKE '%assinado%' THEN 'distrato_assinado_text'
      ELSE NULL
    END AS cancellation_source,
    coalesce(can.churn_efetivado_at, can.distrato_assinado_at, cl.data_churn) AS cancellation_date
  FROM public.clients cl
  LEFT JOIN LATERAL (
    SELECT *
    FROM public.cancellations x
    WHERE x.client_id = cl.id AND x.archived_at IS NULL
    ORDER BY
      CASE WHEN x.churn_efetivado_at IS NOT NULL THEN 0
           WHEN x.distrato_assinado_at IS NOT NULL THEN 1
           WHEN lower(trim(coalesce(x.distrato, ''))) LIKE '%assinado%' THEN 2
           ELSE 9 END,
      x.updated_at DESC NULLS LAST
    LIMIT 1
  ) can ON true
)
SELECT cancellation_source, count(*) AS clientes
FROM base
WHERE cancellation_source IS NOT NULL
GROUP BY 1
ORDER BY 2 DESC;
