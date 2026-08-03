-- Validação: funil por cancellation_statuses + evidências OR (somente leitura)

-- A) Dimensão de status
SELECT id, name, display_order, status_type, funnel_type
FROM public.cancellation_statuses
ORDER BY display_order NULLS LAST, name;

-- B) Distribuição status_id × clientes distintos (não arquivados)
SELECT
  c.status_id,
  s.name AS status_name,
  s.display_order,
  count(*) AS registros,
  count(DISTINCT c.client_id) AS clientes_distintos
FROM public.cancellations c
LEFT JOIN public.cancellation_statuses s ON s.id = c.status_id
WHERE c.archived_at IS NULL
GROUP BY 1, 2, 3
ORDER BY s.display_order NULLS LAST, clientes_distintos DESC;

-- C) Pedidos: data_pedido (não existe status "Pedido de cancelamento")
SELECT
  count(DISTINCT client_id) FILTER (WHERE data_pedido IS NOT NULL) AS by_data_pedido,
  count(DISTINCT client_id) FILTER (
    WHERE status_id IN (
      SELECT id FROM public.cancellation_statuses
      WHERE lower(trim(name)) LIKE '%pedido%'
    )
  ) AS by_status_pedido_name
FROM public.cancellations
WHERE archived_at IS NULL;

-- D) Intenção: status Nova intenção OR intencao_registrada_at
WITH nova AS (
  SELECT DISTINCT client_id::text AS id
  FROM public.cancellations c
  JOIN public.cancellation_statuses s ON s.id = c.status_id
  WHERE c.archived_at IS NULL
    AND lower(trim(s.name)) LIKE '%nova inten%'
),
data_i AS (
  SELECT DISTINCT client_id::text AS id
  FROM public.cancellations
  WHERE archived_at IS NULL AND intencao_registrada_at IS NOT NULL
)
SELECT
  (SELECT count(*) FROM nova) AS by_status_nova_intencao,
  (SELECT count(*) FROM data_i) AS by_intencao_date,
  (SELECT count(*) FROM nova n JOIN data_i d USING (id)) AS overlap,
  (SELECT count(*) FROM (
    SELECT id FROM nova UNION SELECT id FROM data_i
  ) u) AS union_distinct;
