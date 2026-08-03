# Campos de data por dashboard (filtros)

Regra global de intervalo (America/Sao_Paulo, −03:00):

- `timestamp >= início 00:00`
- `timestamp < (fim + 1 dia) 00:00`

Helper no portal: `inDateRange` / `portalRangeStart` / `portalRangeEndExclusive`.

| Dashboard | Campo(s) de data do filtro | Observação |
|---|---|---|
| Dados Gerais | contratação; cancelamento analítico | Já usa helpers de data locais |
| Jornada / Onboarding | datas da jornada / conclusão | Filtros principalmente categóricos |
| Plano Patrimonial | datas do plano quando aplicável | |
| Reuniões | data da reunião (`start_time`) | Custom: `periodStart`/`periodEnd` inclusivos SP |
| Mecanismos | data do vínculo / implementação | |
| Atualização Financeira | `updated_at` válido | `financialUpdateInCustomPeriod` → `inDateRange` |
| Uso da Plataforma | último acesso | |
| Atendimento | `openedAt` / data_abertura | `inDateRange` |
| Cancelamento | data analítica se efetivado; senão `processEntryAt` / pedido / intenção | `cancellationAnalyticalDate` + `inDateRange` |
| Performance EP | contratação; reuniões do período; NPS | hire + period bounds SP |
| Cruzamentos Estatísticos | contratação (hireFrom/hireTo) | |
| Qualidade | N/A | Sem filtro de período |

## Bugs corrigidos nesta entrega

1. Filtros com `T23:59:59Z` / `T00:00:00Z` (UTC) — trocados por intervalo SP inclusivo.
2. Cancelamentos: filtro padrão etapa = efetivado fazia “em processo” parecer 0 — padrão agora = todas.
3. `isDistratoTextSigned` com `includes('assinado')` classificava “Não assinado” como efetivado.
