# Analytics Jornada do Cliente

Portal Quarta Via (HTML/CSS/JS vanilla) com **três projetos Supabase**:

| Papel | Projeto | Uso |
|--------|---------|-----|
| **Auth** | `rckpuebaiswrxzmywllv` | Google OAuth, sessão, validação de token |
| **Dados** | BASE QV (atual) | Consultas dos dashboards (somente servidor) |
| **App Pharus** | `qvtqufdivpbmubooawdm` | Mecanismos sugeridos (`user_mechanisms` / `mechanisms`) — somente servidor |

## Autenticação (Google OAuth)

Acesso via **Continuar com Google** no projeto Auth. Regra: e-mail `@quartavia.com.br`.

### Configurar no Supabase Auth (`rckpuebaiswrxzmywllv`)

1. **Authentication → Providers → Google** — ative e informe Client ID/Secret do Google Cloud.
2. **Authentication → URL Configuration**
   - Site URL: `http://localhost:4173`
   - Redirect URLs: `http://localhost:4173/`, `http://localhost:4173/**`, URL Netlify e `/**`

### Google Cloud

Authorized redirect URI (callback do projeto **Auth**, não da BASE QV):

```text
https://rckpuebaiswrxzmywllv.supabase.co/auth/v1/callback
```

### Variáveis de ambiente

```env
AUTH_SUPABASE_URL=https://rckpuebaiswrxzmywllv.supabase.co
AUTH_SUPABASE_ANON_KEY=<anon do projeto Auth>

DATA_SUPABASE_URL=https://<base-qv>.supabase.co
DATA_SUPABASE_SERVICE_ROLE_KEY=<service role da BASE QV>

PHARUS_SUPABASE_URL=https://qvtqufdivpbmubooawdm.supabase.co
PHARUS_SUPABASE_ANON_KEY=<anon do App Pharus>
```

- Navegador recebe só Auth via `/api/auth-config` (`authSupabaseUrl` + `authSupabaseAnonKey`).
- Service role da BASE QV e anon key do App Pharus **nunca** vão ao browser.
- Falha do App Pharus **não** bloqueia os dashboards da BASE QV.

## Executar em localhost

1. Preencha `.env` (veja `.env.example`).
2. `python server.py` (ou `bun run server.ts`).
3. Abra `http://localhost:4173/` (prefira `localhost`, não `127.0.0.1`, se só localhost estiver nas Redirect URLs).
4. **Continuar com Google** com conta `@quartavia.com.br`.

Teste de leitura App Pharus (sem PII/chaves):

```text
node scripts/test_pharus_mechanisms_read.mjs
```

## APIs protegidas

Validam o Bearer no projeto **Auth**; consultam dados na **BASE QV** (e App Pharus onde aplicável):

- `/api/quality`
- `/api/general-data`
- `/api/meetings`
- `/api/mechanisms`
- `/api/pharus-mechanisms`
- `/api/financial-updates`
- `/api/support`
- `/api/assistant` (POST) — proxy autenticado do chatbot "Assistente da Jornada". Encaminha a pergunta ao webhook do n8n (`N8N_CHAT_WEBHOOK_URL`) e normaliza a resposta. Não expõe o webhook nem segredos ao frontend.

## Publicar no Netlify

Cadastre as variáveis no painel (incluindo `N8N_CHAT_WEBHOOK_URL` e `PHARUS_SUPABASE_ANON_KEY`). Inclua a URL da Netlify nas Redirect URLs do projeto Auth.
