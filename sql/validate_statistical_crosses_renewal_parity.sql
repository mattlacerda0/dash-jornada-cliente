-- Validação: renovação em Cruzamentos Estatísticos vs dashboard Renovações
-- Somente leitura. Diferença esperada no card: 0 (ambos usam ciclo > 1 em clients).

-- A) Clientes renovados (mesma regra do portal)
SELECT COUNT(DISTINCT id) AS renewed_clients
FROM public.clients
WHERE ciclo IS NOT NULL
  AND ciclo::numeric > 1;

-- B) Distribuição por ciclo
SELECT
  COUNT(*) FILTER (WHERE ciclo = 1) AS cycle_1,
  COUNT(*) FILTER (WHERE ciclo = 2) AS cycle_2,
  COUNT(*) FILTER (WHERE ciclo = 3) AS cycle_3,
  COUNT(*) FILTER (WHERE ciclo >= 4) AS cycle_4_plus,
  COUNT(*) FILTER (WHERE ciclo IS NULL OR ciclo::numeric <= 0) AS cycle_invalid
FROM public.clients;

-- C) Renovados por status analítico bruto (ajuda a explicar exclusões do recorte churn)
-- Status bruto em clients.status; status analítico consolidado é calculado no portal.
SELECT
  COALESCE(status, '(null)') AS status_bruto,
  COUNT(*) FILTER (WHERE ciclo IS NOT NULL AND ciclo::numeric > 1) AS renewed
FROM public.clients
GROUP BY 1
ORDER BY renewed DESC;

-- D) Cancelados efetivados (insumos) — cruzar com regra consolidada do portal
SELECT COUNT(DISTINCT client_id) AS cancel_efetivado_cancellations
FROM public.cancellations
WHERE archived_at IS NULL
  AND client_id IS NOT NULL
  AND (
    churn_efetivado_at IS NOT NULL
    OR distrato_assinado_at IS NOT NULL
    OR lower(trim(distrato)) = 'assinado'
  );

SELECT COUNT(*) AS clients_with_data_churn
FROM public.clients
WHERE data_churn IS NOT NULL;
