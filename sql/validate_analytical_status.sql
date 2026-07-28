-- Validação da regra analítica oficial de status/cancelamento
-- Cancelado = churn_efetivado_at OU distrato_assinado_at (archived_at null)
-- Não usar data_pedido / intencao_registrada_at

-- A. CLIENTES CANCELADOS ANALÍTICOS
with cancellations_validas as (
  select
    ca.client_id,
    ca.churn_efetivado_at,
    ca.distrato_assinado_at,
    row_number() over (
      partition by ca.client_id
      order by
        case
          when nullif(trim(ca.churn_efetivado_at::text), '') is not null then 1
          when nullif(trim(ca.distrato_assinado_at::text), '') is not null then 2
          else 3
        end,
        coalesce(ca.updated_at, ca.created_at) desc nulls last
    ) as rn
  from public.cancellations ca
  where ca.archived_at is null
    and (
      nullif(trim(ca.churn_efetivado_at::text), '') is not null
      or nullif(trim(ca.distrato_assinado_at::text), '') is not null
    )
)
select
  'A_cancelled_analytical' as check_id,
  count(distinct client_id)::bigint as value
from cancellations_validas
where rn = 1;

-- B. CLIENTES ATIVOS ANALÍTICOS
with cancellations_validas as (
  select distinct ca.client_id
  from public.cancellations ca
  where ca.archived_at is null
    and (
      nullif(trim(ca.churn_efetivado_at::text), '') is not null
      or nullif(trim(ca.distrato_assinado_at::text), '') is not null
    )
)
select
  'B_active_analytical' as check_id,
  count(*)::bigint as value
from public.clients c
left join cancellations_validas cv on cv.client_id = c.id
where lower(trim(coalesce(c.status::text, ''))) in ('ativo', 'active')
  and cv.client_id is null;

-- C. ATIVOS BRUTOS QUE VIRAM CANCELADOS ANALÍTICOS
with cancellations_validas as (
  select distinct ca.client_id
  from public.cancellations ca
  where ca.archived_at is null
    and (
      nullif(trim(ca.churn_efetivado_at::text), '') is not null
      or nullif(trim(ca.distrato_assinado_at::text), '') is not null
    )
)
select
  'C_raw_active_to_cancelled' as check_id,
  count(*)::bigint as value
from public.clients c
inner join cancellations_validas cv on cv.client_id = c.id
where lower(trim(coalesce(c.status::text, ''))) in ('ativo', 'active');

-- D. CONGELADOS BRUTOS QUE VIRAM CANCELADOS ANALÍTICOS
with cancellations_validas as (
  select distinct ca.client_id
  from public.cancellations ca
  where ca.archived_at is null
    and (
      nullif(trim(ca.churn_efetivado_at::text), '') is not null
      or nullif(trim(ca.distrato_assinado_at::text), '') is not null
    )
)
select
  'D_raw_frozen_to_cancelled' as check_id,
  count(*)::bigint as value
from public.clients c
inner join cancellations_validas cv on cv.client_id = c.id
where lower(trim(coalesce(c.status::text, ''))) in ('congelado', 'frozen', 'paused');

-- Referência: status_analitico por cliente
with cancellations_validas as (
  select
    ca.client_id,
    ca.churn_efetivado_at,
    ca.distrato_assinado_at,
    row_number() over (
      partition by ca.client_id
      order by
        case
          when nullif(trim(ca.churn_efetivado_at::text), '') is not null then 1
          when nullif(trim(ca.distrato_assinado_at::text), '') is not null then 2
          else 3
        end,
        coalesce(ca.updated_at, ca.created_at) desc nulls last
    ) as rn
  from public.cancellations ca
  where ca.archived_at is null
    and (
      nullif(trim(ca.churn_efetivado_at::text), '') is not null
      or nullif(trim(ca.distrato_assinado_at::text), '') is not null
    )
)
select
  case
    when cv.client_id is not null then 'Cancelado'
    when lower(trim(coalesce(c.status::text, ''))) in ('ativo', 'active') then 'Ativo'
    when lower(trim(coalesce(c.status::text, ''))) in ('congelado', 'frozen', 'paused') then 'Congelado'
    -- status bruto cancelado sem churn/distrato NÃO é cancelado analítico
    else 'Não informado'
  end as status_analitico,
  count(*)::bigint as total
from public.clients c
left join cancellations_validas cv
  on cv.client_id = c.id
 and cv.rn = 1
group by 1
order by 1;
