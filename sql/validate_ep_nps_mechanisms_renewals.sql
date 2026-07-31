-- Validação Performance EP: NPS / Mecanismos / Renovações (somente SELECT)
-- Fonte: BASE QV

-- A. NPS mais recente por cliente
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
)
SELECT count(*) AS clientes_respondentes
FROM ranked
WHERE rn = 1;

-- B. NPS médio por EP
WITH ranked AS (
  SELECT
    n.client_id,
    n.score,
    row_number() OVER (
      PARTITION BY n.client_id
      ORDER BY n.submitted_at DESC NULLS LAST, n.created_at DESC NULLS LAST
    ) AS rn
  FROM public.nps_responses n
  WHERE n.client_id IS NOT NULL
    AND n.score BETWEEN 0 AND 10
    AND (n.tipo_de_forms IS NULL OR upper(n.tipo_de_forms) LIKE 'NPS%')
),
latest AS (SELECT * FROM ranked WHERE rn = 1)
SELECT
  coalesce(nullif(trim(cl.engenheiro_patrimonial), ''), 'Não informado') AS ep,
  count(*) AS respondentes,
  round(avg(l.score)::numeric, 1) AS nota_media,
  count(*) FILTER (WHERE l.score >= 9) AS promotores,
  count(*) FILTER (WHERE l.score BETWEEN 7 AND 8) AS neutros,
  count(*) FILTER (WHERE l.score <= 6) AS detratores
FROM latest l
JOIN public.clients cl ON cl.id = l.client_id
GROUP BY 1
ORDER BY nota_media DESC NULLS LAST, respondentes DESC;

-- C. Mecanismos implementados por EP
WITH impl AS (
  SELECT DISTINCT cm.client_id, cm.mecanismo_id
  FROM public.client_mecanismos cm
  WHERE lower(trim(coalesce(cm.status, ''))) IN ('concluido', 'concluida', 'implementado', 'completed')
)
SELECT
  coalesce(nullif(trim(cl.engenheiro_patrimonial), ''), 'Não informado') AS ep,
  count(*) AS mecanismos_implementados,
  count(DISTINCT i.client_id) AS clientes_com_mecanismo
FROM impl i
JOIN public.clients cl ON cl.id = i.client_id
GROUP BY 1
ORDER BY clientes_com_mecanismo DESC;

-- D. Mecanismos utilizados por EP
WITH impl AS (
  SELECT DISTINCT cm.client_id, cm.mecanismo_id
  FROM public.client_mecanismos cm
  WHERE lower(trim(coalesce(cm.status, ''))) IN ('concluido', 'concluida', 'implementado', 'completed')
)
SELECT
  coalesce(nullif(trim(cl.engenheiro_patrimonial), ''), 'Não informado') AS ep,
  coalesce(m.name, i.mecanismo_id::text) AS mecanismo,
  count(DISTINCT i.client_id) AS clientes
FROM impl i
JOIN public.clients cl ON cl.id = i.client_id
LEFT JOIN public.mecanismos m ON m.id = i.mecanismo_id
GROUP BY 1, 2
ORDER BY ep, clientes DESC;

-- E. Clientes renovados por EP (ciclo > 1)
SELECT
  coalesce(nullif(trim(engenheiro_patrimonial), ''), 'Não informado') AS ep,
  count(*) FILTER (WHERE ciclo > 1) AS clientes_renovados,
  count(*) AS carteira,
  round(100.0 * count(*) FILTER (WHERE ciclo > 1) / nullif(count(*), 0), 1) AS pct_carteira
FROM public.clients
GROUP BY 1
ORDER BY clientes_renovados DESC;

-- F. Total de renovações por EP
SELECT
  coalesce(nullif(trim(engenheiro_patrimonial), ''), 'Não informado') AS ep,
  sum(greatest(ciclo - 1, 0)) AS total_renovacoes,
  count(*) FILTER (WHERE ciclo > 1) AS clientes_renovados
FROM public.clients
WHERE ciclo IS NOT NULL
GROUP BY 1
ORDER BY total_renovacoes DESC;

-- G. Distribuição por ciclo
SELECT
  CASE
    WHEN ciclo IS NULL THEN 'Não informado'
    WHEN ciclo <= 0 THEN 'Não informado'
    WHEN ciclo >= 5 THEN 'Ciclo 5+'
    ELSE 'Ciclo ' || ciclo::text
  END AS faixa,
  count(*) AS clientes,
  sum(greatest(ciclo - 1, 0)) AS total_renovacoes
FROM public.clients
GROUP BY 1
ORDER BY 1;

-- H. Auditoria clients.ciclo
SELECT
  count(*) AS linhas,
  count(*) FILTER (WHERE ciclo IS NULL) AS ciclo_nulo,
  count(*) FILTER (WHERE ciclo = 0) AS ciclo_zero,
  count(*) FILTER (WHERE ciclo < 0) AS ciclo_negativo,
  min(ciclo) AS ciclo_min,
  max(ciclo) AS ciclo_max,
  count(*) FILTER (WHERE ciclo > 1) AS renovados,
  sum(greatest(coalesce(ciclo, 0) - 1, 0)) AS total_renovacoes,
  count(*) FILTER (
    WHERE data_inicio_ciclo IS NOT NULL
      AND data_fim_ciclo IS NOT NULL
      AND data_fim_ciclo < data_inicio_ciclo
  ) AS datas_inicio_depois_fim
FROM public.clients;
