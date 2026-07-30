-- Validação Dados Gerais status + EP NPS/mecanismos/ciclos (somente SELECT)
-- A. STATUS ANALÍTICO (conceito — espelhar resolveAnalyticalStatus no app)

-- Cancelados confirmados (regra central)
WITH confirmed AS (
  SELECT DISTINCT c.client_id
  FROM public.cancellations c
  WHERE c.archived_at IS NULL
    AND (c.churn_efetivado_at IS NOT NULL OR c.distrato_assinado_at IS NOT NULL)
)
SELECT 'cancelados_confirmados' AS metrica, count(*) AS n
FROM confirmed;

-- Cancelados sem data confirmada: status bruto cancelado/churn e NÃO em confirmed
-- (ajuste a normalização de status conforme a regra do portal)
SELECT
  count(*) AS cancelados_sem_data_confirmada
FROM public.clients cl
WHERE cl.id NOT IN (
  SELECT DISTINCT c.client_id
  FROM public.cancellations c
  WHERE c.archived_at IS NULL
    AND (c.churn_efetivado_at IS NOT NULL OR c.distrato_assinado_at IS NOT NULL)
)
AND regexp_replace(lower(trim(coalesce(cl.status, ''))), '\s+', ' ', 'g')
  ~ '(cancel|churn|encerr|inativ)';

-- B. NPS POR EP (última resposta por cliente)
WITH ranked AS (
  SELECT
    n.client_id,
    n.score,
    n.submitted_at,
    n.created_at,
    row_number() OVER (
      PARTITION BY n.client_id
      ORDER BY n.submitted_at DESC NULLS LAST, n.created_at DESC NULLS LAST
    ) AS rn
  FROM public.nps_responses n
  WHERE n.client_id IS NOT NULL
    AND n.score BETWEEN 0 AND 10
    AND (n.tipo_de_forms IS NULL OR upper(n.tipo_de_forms) LIKE 'NPS%')
),
latest AS (
  SELECT * FROM ranked WHERE rn = 1
),
joined AS (
  SELECT
    coalesce(nullif(trim(cl.engenheiro_patrimonial), ''), 'Não informado') AS ep,
    l.score
  FROM latest l
  JOIN public.clients cl ON cl.id = l.client_id
)
SELECT
  ep,
  count(*) AS clientes_respondentes,
  round(avg(score)::numeric, 1) AS nota_media,
  round(100.0 * count(*) FILTER (WHERE score >= 9) / nullif(count(*), 0), 1)
    - round(100.0 * count(*) FILTER (WHERE score <= 6) / nullif(count(*), 0), 1) AS indice_nps
FROM joined
GROUP BY ep
ORDER BY clientes_respondentes DESC;

-- C. MECANISMOS POR EP (status implementado/concluído — espelhar dashboard Mecanismos)
WITH impl AS (
  SELECT DISTINCT cm.client_id, cm.mecanismo_id
  FROM public.client_mecanismos cm
  WHERE lower(trim(coalesce(cm.status, ''))) IN ('concluido', 'concluida', 'implementado', 'completed')
),
by_ep AS (
  SELECT
    coalesce(nullif(trim(cl.engenheiro_patrimonial), ''), 'Não informado') AS ep,
    i.client_id,
    i.mecanismo_id
  FROM impl i
  JOIN public.clients cl ON cl.id = i.client_id
)
SELECT
  ep,
  count(*) AS mecanismos_implementados,
  count(DISTINCT client_id) AS clientes_com_mecanismo
FROM by_ep
GROUP BY ep
ORDER BY mecanismos_implementados DESC;

-- D. VIEW DE CICLO
SELECT
  count(*) AS linhas,
  count(DISTINCT client_id) AS clientes,
  count(*) - count(DISTINCT client_id) AS linhas_excedentes
FROM public.vw_clients_ciclo_churn;

SELECT
  client_id,
  max(cliente) AS cliente,
  count(*) AS quantidade_linhas,
  count(DISTINCT data_inicio_ciclo) AS datas_inicio_distintas,
  count(DISTINCT programa) AS programas_distintos
FROM public.vw_clients_ciclo_churn
GROUP BY client_id
HAVING count(*) > 1
ORDER BY quantidade_linhas DESC
LIMIT 50;

-- Divergência fl_churn vs cancelamento confirmado
WITH confirmed AS (
  SELECT DISTINCT client_id::text AS client_id
  FROM public.cancellations
  WHERE archived_at IS NULL
    AND (churn_efetivado_at IS NOT NULL OR distrato_assinado_at IS NOT NULL)
),
view_churn AS (
  SELECT DISTINCT client_id::text AS client_id
  FROM public.vw_clients_ciclo_churn
  WHERE fl_churn = 1
)
SELECT
  (SELECT count(*) FROM confirmed) AS confirmados,
  (SELECT count(*) FROM view_churn) AS fl_churn_1,
  (SELECT count(*) FROM confirmed c JOIN view_churn v USING (client_id)) AS intersecao,
  (SELECT count(*) FROM view_churn v WHERE NOT EXISTS (SELECT 1 FROM confirmed c WHERE c.client_id = v.client_id)) AS so_na_view,
  (SELECT count(*) FROM confirmed c WHERE NOT EXISTS (SELECT 1 FROM view_churn v WHERE v.client_id = c.client_id)) AS so_na_regra_central;

-- E. RENOVAÇÃO
-- NÃO aplicar count(distinct cycle_id) — a view atual é 1 linha por cliente
-- e não possui identificador explícito de ciclo. Aguardar fonte-base de histórico.
