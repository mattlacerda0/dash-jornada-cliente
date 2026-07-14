---
name: quarta-via-design-system
description: >-
  Aplica o design system dark-first do Grupo Quarta Via em dashboards, páginas
  internas e novos projetos. Use quando o usuário pedir interfaces Quarta Via,
  mencionar quarta-via-design-system, ou solicitar UI no padrão visual do grupo
  (fundo #0D0D0D, cards #1A1A1A, laranja #F47920, Inter, tokens qv-*).
disable-model-invocation: true
---

# Quarta Via Design System

Skill reutilizável de **padrões visuais** do Grupo Quarta Via. Extrai apenas UI/UX — **não** inclui regras de negócio, consultas, autenticação ou código específico de dashboards.

**Fonte da verdade:** `packages/design-system/tokens.json` → `theme.css`, `tailwind.preset.js`, `charts-theme.ts`.

---

## 1. Objetivo

- Criar interfaces internas da Quarta Via (portais, dashboards, páginas operacionais).
- Manter consistência visual entre projetos e times.
- Aplicar o design **dark-first** atual em qualquer stack.

---

## 2. Princípios visuais

| Princípio | Regra |
|-----------|-------|
| Fundo principal | `#0D0D0D` (`--color-bg`) |
| Superfícies / cards | `#1A1A1A` (`--color-surface`) |
| Laranja | `#F47920` (`--color-primary`) **apenas** em ações e destaques |
| Tipografia | **Inter** (`--font-sans`); mono: `--font-mono` |
| Espaçamento | Múltiplos de 8px (`--space-1`…`--space-8`) |
| Bordas | Discretas: 1px `--color-border` |
| Contraste | WCAG AA mínimo; texto branco/cinza sobre dark |
| Hierarquia | Dado > gráfico > KPI > metadados; UI neutra |
| Responsivo | Grid 12 colunas; breakpoints 640 / 1024 / 1280 |

**Nunca:** fundo claro, laranja em blocos grandes ou texto corrido, hex fora dos tokens.

---

## 3. Tokens

Preferir **variáveis CSS** de `theme.css`. Não duplicar valores.

### Cores

```css
/* Marca */
--color-primary, --color-primary-hover, --color-primary-active
--color-primary-soft, --color-primary-tint

/* Fundo / superfície */
--color-bg, --color-surface, --color-surface-2, --color-overlay

/* Bordas */
--color-border, --color-border-strong, --color-border-focus

/* Texto */
--color-text, --color-text-muted, --color-text-subtle
--color-text-on-primary, --color-link

/* Semânticas */
--color-success, --color-warning, --color-danger, --color-info
--color-success-soft, --color-warning-soft, --color-danger-soft, --color-info-soft

/* Gráficos */
--chart-1 … --chart-8, --chart-grid, --chart-axis, --chart-tooltip-bg
```

### Tipografia

```css
--font-sans, --font-mono
--fs-xs (12px) … --fs-2xl (32px), --fs-kpi (40px)
--fw-regular (400) … --fw-bold (700)
--lh-tight (1.2), --lh-normal (1.5), --lh-relaxed (1.7)
```

### Espaçamento

`--space-1` (4px) · `--space-2` (8px) · `--space-3` (12px) · `--space-4` (16px) · `--space-5` (24px) · `--space-6` (32px) · `--space-7` (48px) · `--space-8` (64px)

### Raios, sombras, bordas

```css
--radius-sm (4px), --radius-md (8px), --radius-lg (12px), --radius-xl (16px), --radius-full
--shadow-sm, --shadow-md, --shadow-lg, --shadow-card, --shadow-card-hover
--shadow-btn-primary, --shadow-header
--gradient-card, --gradient-primary, --gradient-hero
--header-bg, --header-blur
```

### Estados interativos

| Estado | Padrão |
|--------|--------|
| Hover (primário) | `--shadow-btn-primary-hover`, `translateY(-1px)` |
| Hover (secundário) | borda `--color-primary`, fundo `--color-primary-tint` |
| Focus | borda `--color-primary` + `box-shadow: 0 0 0 3px var(--color-primary-tint)` |
| Focus-visible global | `outline: 2px solid var(--color-border-focus)` |
| Disabled | `opacity: 0.4`, `cursor: not-allowed` |
| Linha de tabela hover | `background: var(--color-surface-2)` |

---

## 4. Componentes padrão

Importar `@import '.../packages/design-system/theme.css'` (ou caminho equivalente) antes de usar classes `qv-*`.

### Página / dashboard

```astro
---
import BaseLayout from "../layouts/BaseLayout.astro";
---
<BaseLayout title="Meu Dashboard" subtitle="Área · Contexto">
  <div class="qv-dash-shell">
    <!-- eyebrow + título + filtros globais + KPIs + conteúdo -->
  </div>
</BaseLayout>
```

Shell: `max-width: 1400px`, padding `--space-6` (mobile: `--space-4`). Stack vertical com gap `--space-5`.

### Header

Sticky, `--header-bg` + `backdrop-filter: var(--header-blur)`, altura ~56px, logo laranja (`--gradient-primary`), nav ghost. Subtítulo em `--color-text-subtle`. Ver `BaseLayout.astro`.

### KPI card

Classe global `.qv-kpi` ou componente `KpiCard.astro`:

```astro
<div class="qv-kpi qv-kpi--highlight">
  <p class="qv-kpi__label">Receita</p>
  <p class="qv-kpi__value">R$ 1,2M</p>
  <span class="qv-kpi__trend qv-kpi__trend--up">▲ 12%</span>
</div>
```

- Label: uppercase, `--fs-xs`, `--color-text-subtle`
- Valor: `--fs-kpi`, `--fw-bold`
- Destaque principal: `qv-kpi--highlight` (linha laranja no topo) ou valor em `--color-primary`
- Tendência: `qv-kpi__trend--up|down|none` (semânticas success/danger)

### Filtros globais

Card `--color-surface`, borda `--color-border`, padding `--space-4`, grid responsivo. Labels `--color-text-muted`, `--fw-semibold`. Inputs/selects: `--color-surface-2`, altura 40px, `color-scheme: dark`.

```html
<section class="comercial-filters" aria-label="Filtros do dashboard">
  <label>
    Período
    <select>...</select>
  </label>
</section>
```

**Afetam KPIs e gráficos** — não a tabela operacional.

### Filtros locais de tabela

Fundo `--color-surface-2`, hint uppercase: *"Filtros locais da tabela"*. Inputs menores (36px). Botão ghost "Limpar" quando houver filtros ativos.

**Afetam apenas a tabela** — incluir texto explicativo no header da seção.

### Tabela operacional

```html
<div class="comercial-table-wrap">
  <table class="qv-table">
    <thead><tr><th>Coluna</th><th style="text-align:right">Valor</th></tr></thead>
    <tbody>...</tbody>
  </table>
</div>
```

- Cabeçalho: uppercase, `--fs-xs`, `--color-text-subtle`
- Números alinhados à direita; IDs em `--font-mono`
- `overflow-x: auto` no wrapper; `min-width` quando necessário
- Início com **até 30 registros**; paginar com botão "Exibir mais"

### Badges de status

```html
<span class="qv-badge qv-badge--success">Realizada</span>
<span class="qv-badge qv-badge--warning">Pendente</span>
<span class="qv-badge qv-badge--danger">No-show</span>
<span class="qv-badge qv-badge--info">Agendada</span>
<span class="qv-badge qv-badge--neutral">—</span>
```

Variantes: `--success`, `--warning`, `--danger`, `--info`, `--primary`, `--neutral`. Fundo soft + texto da cor semântica.

### Gráfico em tema escuro

Usar `charts-theme.ts`:

```tsx
import { qvCategorical, rechartsTheme, qvColors } from "../../packages/design-system/charts-theme";

<BarChart data={data}>
  <CartesianGrid stroke={rechartsTheme.grid.stroke} strokeDasharray="3 3" vertical={false} />
  <XAxis tick={{ fill: qvColors.textMuted, fontSize: 12 }} axisLine={false} tickLine={false} />
  <YAxis tick={{ fill: qvColors.textMuted, fontSize: 12 }} axisLine={false} tickLine={false} />
  <Tooltip contentStyle={rechartsTheme.tooltip.contentStyle} />
  <Legend wrapperStyle={rechartsTheme.legend.wrapperStyle} />
  <Bar dataKey="valor" fill={qvCategorical[0]} radius={[4,4,0,0]} />
</BarChart>
```

- 1ª série sempre laranja (`qvCategorical[0]`)
- Legenda obrigatória com 2+ séries
- Labels nos eixos/barras quando melhorar leitura
- Não usar verde/vermelho como categorias (reservados a status)

### Botões

```html
<button class="qv-btn qv-btn--primary">Salvar</button>
<button class="qv-btn qv-btn--secondary">Exibir mais</button>
<button class="qv-btn qv-btn--ghost">Limpar</button>
```

Altura 40px; 1 primário por contexto.

### Inputs e selects

Classe `.qv-input` ou padrão equivalente:

```html
<input class="qv-input" type="text" placeholder="Buscar…" />
<select class="qv-input" style="color-scheme: dark">...</select>
```

### Loading

Opções (escolher uma por tela):

1. Skeleton: `.qv-skeleton` com altura do bloco
2. Spinner: borda `--color-border-strong`, topo `--color-primary`, `animation: spin`
3. Placeholder textual: `…` ou "Carregando…" em card `--color-surface`

### Erro

Card com borda `--color-danger`, texto danger, botão secundário "Tentar novamente":

```html
<div class="comercial-notice comercial-notice--error" role="alert">{mensagem}</div>
```

Ou padrão `.error-box` (Produtos).

### Empty state

Centralizado, borda tracejada ou card muted, ícone SVG opacity ~0.4:

```html
<div class="portal-empty">
  <p class="portal-empty__title">Nenhum registro encontrado</p>
  <p class="portal-empty__sub">Ajuste os filtros ou <button class="portal-empty__link">limpe a busca</button></p>
</div>
```

Alternativa inline: `.comercial-empty` ou `.empty-state`.

### Paginação / "Exibir mais"

Preferir **"Exibir mais"** (incremento de 30) a paginação numérica:

```html
<div class="comercial-meetings-table__more">
  <button type="button" class="qv-btn qv-btn--secondary">Exibir mais</button>
</div>
```

Mostrar contador: *"Exibindo X de Y registros"*.

### Modal

Padrão recomendado (tokens existentes):

```html
<div class="qv-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
  <div class="qv-modal__backdrop" style="background: var(--color-overlay)"></div>
  <div class="qv-modal__panel qv-card">
    <h2 id="modal-title" class="qv-section-title">Título</h2>
    <!-- conteúdo -->
    <div style="display:flex; gap: var(--space-3); justify-content: flex-end">
      <button class="qv-btn qv-btn--ghost">Cancelar</button>
      <button class="qv-btn qv-btn--primary">Confirmar</button>
    </div>
  </div>
</div>
```

Backdrop `--color-overlay`; painel `.qv-card` centralizado; fechar com Esc e foco preso.

---

## 5. Regras para dashboards

1. **Filtros globais** → KPIs + gráficos + agregações principais.
2. **Filtros locais** → somente tabela operacional (com hint visível).
3. Tabelas começam com **até 30 registros** (`MEETINGS_PAGE_SIZE = 30`).
4. Usar **"Exibir mais"** quando houver mais linhas.
5. Valores numéricos legíveis: `Intl.NumberFormat('pt-BR')`, moeda BRL, percentuais com 1 casa quando aplicável.
6. Gráficos com labels quando melhorar leitura (eixos, totais, bar labels).
7. Evitar excesso de cores — máx. ~7 séries categóricas; agrupar "Outros".
8. Evitar cards redundantes (1 KPI = 1 métrica; não duplicar o mesmo número).
9. Ao remover componentes, **colapsar o grid** — não deixar colunas vazias.

---

## 6. Regras de implementação

- Não hardcodar estilos se existir token ou classe `qv-*`.
- Não introduzir biblioteca visual sem necessidade (preferir `theme.css` + Recharts/ECharts com `charts-theme.ts`).
- Não alterar design system global para resolver caso local.
- Preferir componentes reutilizáveis (`KpiCard`, `.qv-table`, `.qv-badge`).
- Manter acessibilidade: `aria-label`, `role="alert|status"`, foco visível, alvos ≥ 40px.
- Manter responsividade: grid colapsa 3→6→12 colunas.
- Separar lógica de negócio de componentes visuais.
- **Não copiar secrets, `.env` ou credenciais.**

---

## 7. Exemplos de uso

### Card KPI (Astro)

```astro
<div class="qv-col-3">
  <KpiCard label="Clientes ativos" value="1.842" highlight />
</div>
```

### Filtro global (React)

```tsx
<section className="filter-bar" aria-label="Filtros do dashboard">
  <label>
    Data início
    <input type="date" value={start} onChange={...} />
  </label>
</section>
```

### Tabela com badge (React)

```tsx
<table className="qv-table">
  <tbody>
    <tr>
      <td>{nome}</td>
      <td><span className="qv-badge qv-badge--success">Ativo</span></td>
    </tr>
  </tbody>
</table>
```

### Card de gráfico (Astro + React)

```astro
<div class="qv-col-6 qv-card">
  <h2 class="qv-section-title">Receita mensal</h2>
  <SalesChart client:load />
</div>
```

### Estado vazio

```html
<div class="comercial-empty">Sem dados no período selecionado.</div>
```

### Adaptar para outros frameworks

| Stack | Como aplicar |
|-------|--------------|
| **Astro + React** | Importar `theme.css` no layout; ilhas React com classes `qv-*` |
| **React / Next.js** | Copiar `packages/design-system/`; importar CSS global; usar tokens via `var(--...)` |
| **Vue / Nuxt** | Mesmo CSS global; scoped styles referenciando tokens |
| **Tailwind** | Estender com `tailwind.preset.js` (`bg-bg`, `bg-surface`, `text-primary`…) |
| **HTML estático** | Linkar `theme.css`; markup com classes `qv-*` |

Princípios (dark-first, tokens, laranja só em destaque) são **independentes de framework**.

---

## 8. Checklist de aceite

- [ ] Segue tokens Quarta Via (`var(--color-*)`, classes `qv-*`)
- [ ] Funciona em dark mode (`color-scheme: dark` no `<head>`)
- [ ] Responsivo (640px / 1024px testados)
- [ ] Sem cores arbitrárias (nenhum hex solto no componente)
- [ ] Sem estilos duplicados desnecessários
- [ ] Loading, error e empty implementados
- [ ] Acessibilidade básica (labels, roles, foco, contraste)
- [ ] Build passa (`npm run build`)

---

## 9. Uso da skill

Colegas devem solicitar explicitamente:

> **"Use a skill quarta-via-design-system para criar esta página."**

Ou incluir no prompt:

> Construa seguindo o design system Quarta Via: dark-first, tokens de `theme.css`, laranja só em ação/destaque, Inter, escala 8px.

**Arquivos de referência no repositório:**

- `packages/design-system/theme.css` — tokens + classes `qv-*`
- `packages/design-system/charts-theme.ts` — gráficos
- `src/layouts/BaseLayout.astro` — header + shell
- `src/components/KpiCard.astro` — KPI reutilizável
- `templates/dashboard-starter/dashboard.astro` — ponto de partida
- `docs/quarta-via-design-system.md` — guia humano resumido

**Documentação completa:** `docs/design-system.md` · `docs/AI-GUIDELINES.md`
