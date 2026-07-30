-- Validação portal (somente SELECT — não altera banco)
-- A. CLIENTES CONGELADOS (status bruto + sem churn/distrato)
-- Ajuste o nome da coluna de status se necessário (clients.status).

WITH cancel_efetivado AS (
  SELECT DISTINCT c.client_id
  FROM public.cancellations c
  WHERE c.archived_at IS NULL
    AND (c.churn_efetivado_at IS NOT NULL OR c.distrato_assinado_at IS NOT NULL)
),
normalized AS (
  SELECT
    cl.id AS client_id,
    lower(unaccent(trim(coalesce(cl.status, '')))) AS status_norm
  FROM public.clients cl
)
SELECT count(*) AS clientes_congelados
FROM normalized n
WHERE n.status_norm IN ('congelado', 'frozen', 'paused')
  AND n.client_id NOT IN (SELECT client_id FROM cancel_efetivado);

-- Sem unaccent (alternativa):
-- WHERE regexp_replace(lower(trim(coalesce(cl.status,''))), '\s+', ' ', 'g')
--   IN ('congelado','frozen','paused')

-- B. CLIENTES EM PROCESSO (pedido OU intenção; sem efetivação; não arquivado)
SELECT count(DISTINCT c.client_id) AS clientes_em_processo
FROM public.cancellations c
WHERE c.archived_at IS NULL
  AND (c.data_pedido IS NOT NULL OR c.intencao_registrada_at IS NOT NULL)
  AND c.churn_efetivado_at IS NULL
  AND c.distrato_assinado_at IS NULL;

-- C. PROCESSO POR STATUS (join correto status_id = id)
SELECT
  coalesce(cs.name, 'Status não informado') AS etapa,
  cs.display_order,
  count(DISTINCT c.client_id) AS clientes
FROM public.cancellations c
LEFT JOIN public.cancellation_statuses cs
  ON cs.id = c.status_id
WHERE c.archived_at IS NULL
  AND (c.data_pedido IS NOT NULL OR c.intencao_registrada_at IS NOT NULL)
  AND c.churn_efetivado_at IS NULL
  AND c.distrato_assinado_at IS NULL
GROUP BY coalesce(cs.name, 'Status não informado'), cs.display_order
ORDER BY cs.display_order NULLS LAST, clientes DESC;

-- D. DATA DE ENTRADA NO PROCESSO
SELECT
  c.client_id,
  c.data_pedido,
  c.intencao_registrada_at,
  coalesce(c.data_pedido, c.intencao_registrada_at) AS data_entrada_processo,
  CASE
    WHEN c.data_pedido IS NOT NULL THEN 'data_pedido'
    WHEN c.intencao_registrada_at IS NOT NULL THEN 'intencao_registrada_at'
    ELSE NULL
  END AS fonte_entrada
FROM public.cancellations c
WHERE c.archived_at IS NULL
  AND (c.data_pedido IS NOT NULL OR c.intencao_registrada_at IS NOT NULL)
LIMIT 50;

-- Contagem entrada por fonte
SELECT
  count(*) FILTER (WHERE data_pedido IS NOT NULL) AS entrada_por_pedido,
  count(*) FILTER (
    WHERE data_pedido IS NULL AND intencao_registrada_at IS NOT NULL
  ) AS entrada_por_intencao
FROM public.cancellations
WHERE archived_at IS NULL
  AND (data_pedido IS NOT NULL OR intencao_registrada_at IS NOT NULL)
  AND churn_efetivado_at IS NULL
  AND distrato_assinado_at IS NULL;

-- E. FALLBACK AIRTABLE (executar no projeto Business Data quando o schema estiver exposto)
-- Schema esperado: bkp_airtable
-- Tabelas: bkp_clientes_id, bkp_reunioes
-- Descomente após expor o schema no PostgREST:

-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'bkp_airtable'
--   AND table_name IN ('bkp_clientes_id', 'bkp_reunioes')
-- ORDER BY table_name, ordinal_position;
--
-- SELECT status, count(*)
-- FROM bkp_airtable.bkp_reunioes
-- GROUP BY status
-- ORDER BY count(*) DESC;
--
-- Cobertura de chaves (ajuste nomes reais das colunas após o audit):
-- SELECT
--   count(*) FILTER (WHERE cpf IS NOT NULL AND length(regexp_replace(cpf, '\D', '', 'g')) = 11) AS com_cpf,
--   count(*) FILTER (WHERE email IS NOT NULL AND trim(email) <> '') AS com_email,
--   count(*) FILTER (WHERE telefone IS NOT NULL OR phone IS NOT NULL) AS com_telefone,
--   count(*) FILTER (WHERE nome IS NOT NULL OR name IS NOT NULL) AS com_nome
-- FROM bkp_airtable.bkp_clientes_id;

-- Auditoria de status da dimensão
SELECT id, name, display_order, status_type, funnel_type
FROM public.cancellation_statuses
ORDER BY display_order NULLS LAST, name;
