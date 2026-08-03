-- Validação analítica — Cancelamentos (somente leitura)
-- Timezone de referência: America/Sao_Paulo
-- Não altera tabelas/views/registros.

-- A. INTENÇÃO/PEDIDO (clientes distintos, não arquivados)
SELECT COUNT(DISTINCT client_id) AS intencao_pedido_clients
FROM public.cancellations
WHERE archived_at IS NULL
  AND client_id IS NOT NULL
  AND (
    data_pedido IS NOT NULL
    OR intencao_registrada_at IS NOT NULL
  );

-- B. CANCELAMENTO EFETIVADO EM CANCELLATIONS
SELECT
  COUNT(DISTINCT client_id) FILTER (WHERE churn_efetivado_at IS NOT NULL) AS by_churn,
  COUNT(DISTINCT client_id) FILTER (WHERE distrato_assinado_at IS NOT NULL) AS by_distrato_at,
  COUNT(DISTINCT client_id) FILTER (
    WHERE lower(trim(distrato)) = 'assinado'
  ) AS by_distrato_text,
  COUNT(DISTINCT client_id) FILTER (
    WHERE churn_efetivado_at IS NOT NULL
       OR distrato_assinado_at IS NOT NULL
       OR lower(trim(distrato)) = 'assinado'
  ) AS efetivado_cancellations_union
FROM public.cancellations
WHERE archived_at IS NULL
  AND client_id IS NOT NULL;

-- C. CANCELAMENTO EM CLIENTS
SELECT COUNT(DISTINCT id) AS clients_with_data_churn
FROM public.clients
WHERE data_churn IS NOT NULL;

-- D. UNIÃO FINAL (deduplicada)
WITH cancel_ids AS (
  SELECT DISTINCT client_id::text AS id
  FROM public.cancellations
  WHERE archived_at IS NULL
    AND client_id IS NOT NULL
    AND (
      churn_efetivado_at IS NOT NULL
      OR distrato_assinado_at IS NOT NULL
      OR lower(trim(distrato)) = 'assinado'
    )
),
client_ids AS (
  SELECT DISTINCT id::text AS id
  FROM public.clients
  WHERE data_churn IS NOT NULL
)
SELECT COUNT(*) AS efetivado_union_distinct
FROM (
  SELECT id FROM cancel_ids
  UNION
  SELECT id FROM client_ids
) u;

-- E. CLIENTES EM PROCESSO = intenção/pedido − efetivados
WITH intention AS (
  SELECT DISTINCT client_id::text AS id
  FROM public.cancellations
  WHERE archived_at IS NULL
    AND client_id IS NOT NULL
    AND (data_pedido IS NOT NULL OR intencao_registrada_at IS NOT NULL)
),
efetivado AS (
  SELECT DISTINCT client_id::text AS id
  FROM public.cancellations
  WHERE archived_at IS NULL
    AND client_id IS NOT NULL
    AND (
      churn_efetivado_at IS NOT NULL
      OR distrato_assinado_at IS NOT NULL
      OR lower(trim(distrato)) = 'assinado'
    )
  UNION
  SELECT DISTINCT id::text
  FROM public.clients
  WHERE data_churn IS NOT NULL
)
SELECT COUNT(*) AS em_processo
FROM intention i
WHERE NOT EXISTS (SELECT 1 FROM efetivado e WHERE e.id = i.id);

-- F. SEGMENTO — vínculo cancellations.client_id → clients + financial (amostra)
SELECT
  c.client_id,
  cl.codigo,
  cl.name,
  f.ultima_renda_mensal,
  f.reserva_liquidez,
  f.ultimo_aporte,
  f.valor_imoveis_quitados
FROM public.cancellations c
LEFT JOIN public.clients cl ON cl.id = c.client_id
LEFT JOIN LATERAL (
  SELECT *
  FROM public.client_financial_data fd
  WHERE fd.client_id = c.client_id
  ORDER BY fd.updated_at DESC NULLS LAST
  LIMIT 1
) f ON true
WHERE c.archived_at IS NULL
LIMIT 50;

-- G. ARQUIVADOS — com vs sem archived_at
SELECT
  COUNT(*) FILTER (WHERE archived_at IS NULL) AS rows_active,
  COUNT(*) FILTER (WHERE archived_at IS NOT NULL) AS rows_archived,
  COUNT(DISTINCT client_id) FILTER (WHERE archived_at IS NULL) AS clients_active_rows,
  COUNT(DISTINCT client_id) FILTER (WHERE archived_at IS NOT NULL) AS clients_archived_rows
FROM public.cancellations
WHERE client_id IS NOT NULL;

-- Controle: "Não assinado" NÃO deve contar como Assinado
SELECT COUNT(*) AS falso_positivo_nao_assinado
FROM public.cancellations
WHERE archived_at IS NULL
  AND lower(trim(distrato)) LIKE '%assinado%'
  AND lower(trim(distrato)) <> 'assinado';
