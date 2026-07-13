# Dashboard de Qualidade dos Dados

Primeira aba do dashboard Quarta Via conectada ao Supabase.

## Executar em localhost

1. Salve as credenciais em `exemplo.env` dentro desta pasta (há fallback para `.env`).
2. Execute `bun run server.ts` (ou `python3 server.py`, quando Python estiver disponível).
3. Acesse `http://localhost:4173`.

O backend consulta o schema `public` explicitamente e mantém a `service_role` fora do navegador.

## Regra de cálculo

- Não preenchidos: `NULL`, string vazia ou apenas espaços.
- Preenchidos: `total de linhas - não preenchidos`.
- Percentual preenchido: `preenchidos / total de linhas da tabela * 100`.

## Contrato da fonte de dados

A tela espera uma lista de objetos no formato:

```js
{ domain, table, column, totalRows, missingRows }
```

O endpoint local `/api/quality` retorna os totais calculados diretamente no Supabase. Não exponha `service_role` no navegador.

## Próximas abas previstas

Jornada, Reuniões, Financeiro, NPS e CSAT, Cancelamentos e Renovação.
