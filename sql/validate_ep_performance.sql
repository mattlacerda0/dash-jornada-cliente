-- Validação SQL · Performance do EP
-- Comparar com GET /api/ep-performance (mesmos filtros = diferença 0).
-- Cancelado confirmado = churn_efetivado_at OU distrato_assinado_at, archived_at IS NULL.

-- Clientes distintos por EP
SELECT
  COALESCE(NULLIF(TRIM(c.engenheiro_patrimonial), ''), 'Não informado') AS ep,
  COUNT(DISTINCT c.id) AS clientes
FROM public.clients c
GROUP BY 1
ORDER BY 2 DESC;

-- Ativos / congelados / cancelados confirmados por EP
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
)
SELECT
  COALESCE(NULLIF(TRIM(c.engenheiro_patrimonial), ''), 'Não informado') AS ep,
  COUNT(DISTINCT c.id) FILTER (
    WHERE cancel.client_id IS NULL
      AND LOWER(TRIM(COALESCE(c.status, ''))) IN ('ativo', 'active', 'ativa')
  ) AS ativos,
  COUNT(DISTINCT c.id) FILTER (
    WHERE cancel.client_id IS NULL
      AND (
        LOWER(TRIM(COALESCE(c.status, ''))) LIKE '%congel%'
        OR LOWER(TRIM(COALESCE(c.status, ''))) LIKE '%pausad%'
      )
  ) AS congelados,
  COUNT(DISTINCT c.id) FILTER (WHERE cancel.client_id IS NOT NULL) AS cancelados_confirmados
FROM public.clients c
LEFT JOIN cancel ON cancel.client_id = c.id
GROUP BY 1
ORDER BY 4 DESC NULLS LAST;

-- Clientes sem EP
SELECT COUNT(DISTINCT id) AS clientes_sem_ep
FROM public.clients
WHERE NULLIF(TRIM(engenheiro_patrimonial), '') IS NULL;

-- Observação: cobertura/reuniões válidas devem usar a mesma consolidação do dashboard Reuniões
-- (deduplicação URI/manual + attendance). Não recontar registros brutos aqui.
