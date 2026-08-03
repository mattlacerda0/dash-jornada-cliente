# Matriz de validação dos filtros (auditoria código + smoke)

| Dashboard | Filtro | Cards | Gráficos | Matrizes | Tabela | Exportação | Resultado |
|---|---|---|---|---|---|---|---|
| Dados Gerais | todos | Sim (recalc client) | Sim | N/A | Sim | Sim | Funcionando |
| Reuniões | período/status/etc | Sim | Parcial (tipos CSV sem filtro) | N/A | Sim | Sim | Parcial |
| Mecanismos BASE QV | status/segmento/EP | Sim | Sim | Sim | Sim | Sim | Funcionando |
| Mecanismos Pharus | busca/status | Não (KPI global) | Não | N/A | Sim | Sim | Parcial |
| Cancelamentos | etapa/período/motivo/etc | **Corrigido** (recalc filtrado) | **Corrigido** (funil/status/EP) | N/A | Sim | Sim | Funcionando* |
| Performance EP | multi-EP + demais | Sim | Sim | N/A | Sim | Sim | Funcionando |
| Cruzamentos | status/segmento | Sim | Sim | Sim | N/A | N/A | Funcionando |
| Qualidade | N/A | N/A | N/A | N/A | N/A | N/A | Não aplicável |

\* Após esta entrega: KPIs/funil/status/EP/segmento recalculam a partir de `filteredCancellationClients()`. Medianas de timing ainda usam payload completo (documentado no tooltip).

## Divergências encontradas

1. **Cancelamentos (antes):** cards/funil usavam `payload.summary` sem filtro — **corrigido**.
2. **Reuniões — tipos:** gráfico CSV não respeita filtros de reunião.
3. **Pharus:** filtros afetam tabelas, não KPIs/charts.
4. **Status «Pedido de cancelamento»:** inexistente em `cancellation_statuses`; pedido = `data_pedido`.

## Status reais (BASE QV)

| status_name | display_order | clientes distintos (não arquivados) |
|---|---:|---:|
| Nova intenção | 10 | 3 |
| Em retenção | 11 | 2 |
| Decisão do cliente | 12 | 6 |
| Saída em curso | 13 | 59 |
| Encerrado | 16 | 86 |
| Em negociação | 15 | 0 no recorte ativo |

Tabela real: `public.cancellation_statuses` (não `cancellations_statuses`).
