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

## Publicar no Netlify

O arquivo `netlify.toml` publica a raiz do projeto e encaminha `/api/quality` para uma Netlify Function. No painel do Netlify, cadastre as variáveis de ambiente `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY`.

O dashboard consulta os dados ao abrir, atualiza automaticamente a cada 5 minutos enquanto estiver aberto e também permite uma atualização imediata pelo botão **Atualizar**.

## Próximas abas previstas

Jornada, Reuniões, Financeiro, NPS e CSAT, Cancelamentos e Renovação.
