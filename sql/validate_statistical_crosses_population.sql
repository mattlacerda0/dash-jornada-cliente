-- Validação Cruzamentos Estatísticos (somente leitura)
-- Totais básicos devem bater com o endpoint (diferença 0).

-- População / status analítico depende da mesma regra do portal;
-- estes SQLs cobrem os insumos brutos.

-- 1) Clientes totais
SELECT COUNT(*) AS clients_total FROM public.clients;

-- 2) data_churn
SELECT COUNT(*) AS clients_with_data_churn
FROM public.clients WHERE data_churn IS NOT NULL;

-- 3) Cancelamentos efetivados em cancellations (não arquivados)
SELECT COUNT(DISTINCT client_id) AS cancel_efetivado_cancellations
FROM public.cancellations
WHERE archived_at IS NULL
  AND client_id IS NOT NULL
  AND (
    churn_efetivado_at IS NOT NULL
    OR distrato_assinado_at IS NOT NULL
    OR lower(trim(distrato)) = 'assinado'
  );

-- 4) Cancelados com data vs sem data (texto Assinado)
SELECT
  COUNT(DISTINCT client_id) FILTER (
    WHERE churn_efetivado_at IS NOT NULL OR distrato_assinado_at IS NOT NULL
  ) AS with_date_in_cancellations,
  COUNT(DISTINCT client_id) FILTER (
    WHERE lower(trim(distrato)) = 'assinado'
      AND churn_efetivado_at IS NULL
      AND distrato_assinado_at IS NULL
  ) AS assinados_sem_data
FROM public.cancellations
WHERE archived_at IS NULL AND client_id IS NOT NULL;

-- 5) Ciclo / renovação
SELECT
  COUNT(*) FILTER (WHERE ciclo = 1) AS cycle_1,
  COUNT(*) FILTER (WHERE ciclo > 1) AS renewed_cycle_gt_1,
  COUNT(*) FILTER (WHERE ciclo IS NULL OR ciclo <= 0) AS cycle_invalid
FROM public.clients;

-- 6) NPS válidos (última resposta por cliente — aproximação via DISTINCT ON)
SELECT COUNT(*) AS nps_latest_valid
FROM (
  SELECT DISTINCT ON (client_id) client_id, score
  FROM public.nps_responses
  WHERE client_id IS NOT NULL
    AND score IS NOT NULL
    AND score::numeric BETWEEN 0 AND 10
    AND (tipo_de_forms IS NULL OR upper(tipo_de_forms) LIKE 'NPS%')
  ORDER BY client_id, submitted_at DESC NULLS LAST, created_at DESC NULLS LAST
) t;

SELECT
  COUNT(*) FILTER (WHERE score::numeric >= 9) AS promoters,
  COUNT(*) FILTER (WHERE score::numeric BETWEEN 7 AND 8) AS neutrals,
  COUNT(*) FILTER (WHERE score::numeric BETWEEN 0 AND 6) AS detractors
FROM (
  SELECT DISTINCT ON (client_id) score
  FROM public.nps_responses
  WHERE client_id IS NOT NULL
    AND score IS NOT NULL
    AND score::numeric BETWEEN 0 AND 10
    AND (tipo_de_forms IS NULL OR upper(tipo_de_forms) LIKE 'NPS%')
  ORDER BY client_id, submitted_at DESC NULLS LAST, created_at DESC NULLS LAST
) t;

-- 7) Reuniões (clientes com ao menos uma)
SELECT COUNT(DISTINCT client_id) AS clients_with_calendly_meeting
FROM public.client_meetings
WHERE client_id IS NOT NULL AND start_time IS NOT NULL;
