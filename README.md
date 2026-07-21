# Analytics Jornada do Cliente

Portal Quarta Via (HTML/CSS/JS vanilla) com **dois projetos Supabase**:

| Papel | Projeto | Uso |
|--------|---------|-----|
| **Auth** | `rckpuebaiswrxzmywllv` | Google OAuth, sessão, validação de token |
| **Dados** | BASE QV (atual) | Consultas dos dashboards (somente servidor) |

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
```

- Navegador recebe só Auth via `/api/auth-config` (`authSupabaseUrl` + `authSupabaseAnonKey`).
- Service role da BASE QV **nunca** vai ao browser.

## Executar em localhost

1. Preencha `.env` (veja `.env.example`).
2. `python server.py` (ou `bun run server.ts`).
3. Abra `http://localhost:4173/` (prefira `localhost`, não `127.0.0.1`, se só localhost estiver nas Redirect URLs).
4. **Continuar com Google** com conta `@quartavia.com.br`.

## APIs protegidas

Validam o Bearer no projeto **Auth**; consultam dados na **BASE QV**:

- `/api/quality`
- `/api/general-data`
- `/api/meetings`
- `/api/mechanisms`
- `/api/financial-updates`
- `/api/support`

## Publicar no Netlify

Cadastre as quatro variáveis no painel. Inclua a URL da Netlify nas Redirect URLs do projeto Auth.
