-- Validação SQL — Performance EP (Pharus) + Cruzamentos
-- Executar no projeto correspondente. Não altera dados.

-- ============================================================
-- A. Cancelados confirmados (BASE QV / public)
-- ============================================================
SELECT COUNT(DISTINCT client_id) AS confirmed_cancelled_clients
FROM public.cancellations
WHERE archived_at IS NULL
  AND (
    churn_efetivado_at IS NOT NULL
    OR distrato_assinado_at IS NOT NULL
  );

-- ============================================================
-- B. Ativos analíticos (status bruto ativo + sem cancelamento confirmado)
-- ============================================================
WITH confirmed AS (
  SELECT DISTINCT client_id
  FROM public.cancellations
  WHERE archived_at IS NULL
    AND (churn_efetivado_at IS NOT NULL OR distrato_assinado_at IS NOT NULL)
)
SELECT COUNT(*) AS active_analytical
FROM public.clients c
WHERE LOWER(COALESCE(c.status, '')) LIKE '%ativ%'
  AND c.id NOT IN (SELECT client_id FROM confirmed WHERE client_id IS NOT NULL);

-- ============================================================
-- C. Clientes com reuniões (visão aproximada — alinhar ao dashboard Reuniões)
-- ============================================================
SELECT COUNT(DISTINCT client_id) AS clients_with_meeting
FROM (
  SELECT client_id FROM public.client_meetings WHERE client_id IS NOT NULL
  UNION
  SELECT client_id FROM public.manual_meetings WHERE client_id IS NOT NULL
) x;

-- ============================================================
-- D. Distribuição descritiva (exemplo renda) ativos vs cancelados
-- ============================================================
-- (requer join com client_financial_data — ajustar nomes reais se necessário)

-- ============================================================
-- E. App Pharus (schema core; se falhar, tentar public)
-- ============================================================
SELECT COUNT(*) AS raw_scheduled FROM core.scheduled_meetings;

SELECT status, COUNT(*) AS n
FROM core.scheduled_meetings
GROUP BY status
ORDER BY n DESC;

SELECT COUNT(DISTINCT user_id) AS distinct_users
FROM core.scheduled_meetings
WHERE user_id IS NOT NULL;

SELECT COUNT(DISTINCT advisor_internal_id) AS distinct_advisors
FROM core.scheduled_meetings
WHERE advisor_internal_id IS NOT NULL;
