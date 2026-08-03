-- Validação Performance EP × cancelamento consolidado / reuniões (somente leitura)

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
portfolio AS (
  SELECT
    coalesce(nullif(trim(engenheiro_patrimonial), ''), 'Não informado') AS ep,
    id::text AS client_id,
    lower(trim(coalesce(status, ''))) AS status_raw,
    CASE WHEN id::text IN (SELECT client_id FROM effective) THEN true ELSE false END AS is_effective_cancel
  FROM public.clients
)
SELECT
  ep,
  count(*) AS carteira,
  count(*) FILTER (
    WHERE NOT is_effective_cancel
      AND status_raw IN ('ativo', 'active', 'ativa')
  ) AS ativos_aprox,
  count(*) FILTER (
    WHERE NOT is_effective_cancel
      AND (status_raw LIKE '%congel%' OR status_raw LIKE '%pausad%' OR status_raw IN ('frozen', 'freeze'))
  ) AS congelados_aprox,
  count(*) FILTER (WHERE is_effective_cancel) AS cancelados_efetivados
FROM portfolio
GROUP BY ep
ORDER BY carteira DESC
LIMIT 20;
