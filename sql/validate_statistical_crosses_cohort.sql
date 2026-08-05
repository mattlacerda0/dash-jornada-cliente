-- Validação somente leitura: coortes de contratação (mês de contratação)
-- Comparar nStart das coortes com o endpoint (diferença esperada ~0 no filtro equivalente).

SELECT
  to_char(COALESCE(data_inicio_ciclo, created_at)::date, 'YYYY-MM') AS cohort_month,
  COUNT(*) AS n_start
FROM public.clients
WHERE COALESCE(data_inicio_ciclo, created_at) IS NOT NULL
GROUP BY 1
ORDER BY 1;
