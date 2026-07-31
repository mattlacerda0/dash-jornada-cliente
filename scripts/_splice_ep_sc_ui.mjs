/**
 * Splice EP + Statistical Crosses UI into index.html
 */
import fs from "fs";

const path = "index.html";
let html = fs.readFileSync(path, "utf8");

if (html.includes('id="view-ep"') && html.includes('id="view-statistical-crosses"')) {
  console.log("UI already present");
  process.exit(0);
}

const menuInsert = `        <button type="button" data-nav="ep"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span>Performance do EP</button>
        <button type="button" data-nav="statistical-crosses"><span class="nav-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="7.5" cy="7.5" r="1.5"/><circle cx="16.5" cy="7.5" r="1.5"/><circle cx="7.5" cy="16.5" r="1.5"/><circle cx="16.5" cy="16.5" r="1.5"/><path d="M3 3v18h18"/><path d="m7.5 16.5 9-9"/><path d="m7.5 7.5 3 3"/><path d="m13.5 13.5 3 3"/></svg></span>Cruzamentos Estatísticos</button>
`;

if (!html.includes('data-nav="ep"')) {
  html = html.replace(
    /(<button type="button" data-nav="cancellations"[\s\S]*?<\/button>\s*)(<button type="button" data-nav="quality")/,
    `$1${menuInsert}$2`,
  );
}

const css = `
    #view-ep .summary.kpis-ep-primary,#view-statistical-crosses .summary.kpis-sc-primary{grid-template-columns:repeat(3,1fr);margin-bottom:10px}
    #view-ep .metric.kpi-primary,#view-statistical-crosses .metric.kpi-primary{border-color:rgba(244,121,32,.55);background:linear-gradient(180deg,rgba(244,121,32,.12),rgba(26,26,26,.9))}
    #view-ep .metric.kpi-primary .metric-label,#view-statistical-crosses .metric.kpi-primary .metric-label{color:#f0b07a}
    #view-ep .metric.kpi-primary .metric-value,#view-statistical-crosses .metric.kpi-primary .metric-value{color:#ffc796}
    #view-ep .charts.ep-charts,#view-statistical-crosses .charts.sc-charts{grid-template-columns:repeat(2,minmax(0,1fr))}
    #view-ep .chart-card.ep-span-all,#view-statistical-crosses .chart-card.sc-span-all{grid-column:1/-1}
    #view-ep .badge.sample-small{background:rgba(246,189,75,.15);color:#f6bd4b;border:1px solid rgba(246,189,75,.35)}
    #view-ep .pharus-section{margin-top:18px;padding-top:8px;border-top:1px solid var(--color-border)}
    @media(max-width:1100px){#view-ep .summary.kpis-ep-primary,#view-statistical-crosses .summary.kpis-sc-primary{grid-template-columns:repeat(2,1fr)}}
    @media(max-width:780px){#view-ep .summary.kpis-ep-primary,#view-statistical-crosses .summary.kpis-sc-primary,#view-ep .charts.ep-charts,#view-statistical-crosses .charts.sc-charts{grid-template-columns:1fr}}
`;

if (!html.includes("kpis-ep-primary")) {
  html = html.replace("</style>", `${css}\n    </style>`);
}

const viewsHtml = fs.readFileSync("scripts/_ui_ep_sc_views.html", "utf8");
if (!html.includes('id="view-ep"')) {
  html = html.replace(
    /(<section class="view" id="view-quality">)/,
    `${viewsHtml}\n\n      $1`,
  );
}

const jsBlock = fs.readFileSync("scripts/_ui_ep_sc_js.js", "utf8");
if (!html.includes("loadEpPerformance")) {
  // insert before quality or cancellations end / before assistant
  const marker = "    /* -------- Quality (existing behavior + descriptions) -------- */";
  if (html.includes(marker)) {
    html = html.replace(marker, `${jsBlock}\n\n${marker}`);
  } else {
    html = html.replace(
      "    /* -------- Cancelamento (BASE QV) -------- */",
      `${jsBlock}\n\n    /* -------- Cancelamento (BASE QV) -------- */`,
    );
  }
}

// wire views object
if (!html.includes("ep: document.querySelector('#view-ep')")) {
  html = html.replace(
    "cancellations: document.querySelector('#view-cancellations'),\n      quality: document.querySelector('#view-quality')",
    "cancellations: document.querySelector('#view-cancellations'),\n      ep: document.querySelector('#view-ep'),\n      'statistical-crosses': document.querySelector('#view-statistical-crosses'),\n      quality: document.querySelector('#view-quality')",
  );
}

if (!html.includes("ep: 'ep_performance'")) {
  html = html.replace(
    "cancellations: 'cancellations',\n        quality: 'quality',",
    "cancellations: 'cancellations',\n        ep: 'ep_performance',\n        'statistical-crosses': 'statistical_crosses',\n        quality: 'quality',",
  );
  html = html.replace(
    "support: 'support', cancellations: 'cancellations', quality: 'quality',",
    "support: 'support', cancellations: 'cancellations', ep: 'ep_performance', 'statistical-crosses': 'statistical_crosses', quality: 'quality',",
  );
}

if (!html.includes("loadEpPerformance()")) {
  html = html.replace(
    "if (btn.dataset.nav === 'cancellations' && !cancellationsState.payload) loadCancellations();\n      if (btn.dataset.nav === 'quality' && !qualityData.length) loadQuality();",
    "if (btn.dataset.nav === 'cancellations' && !cancellationsState.payload) loadCancellations();\n      if (btn.dataset.nav === 'ep' && !epState.payload) loadEpPerformance();\n      if (btn.dataset.nav === 'statistical-crosses' && !scState.payload) loadStatisticalCrosses();\n      if (btn.dataset.nav === 'quality' && !qualityData.length) loadQuality();",
  );
}

// hash restore on load
if (!html.includes("portalHashNav")) {
  const hashBoot = `
    (function portalHashNav(){
      const map = { ep:'ep', 'performance-ep':'ep', 'statistical-crosses':'statistical-crosses', sc:'statistical-crosses' };
      const apply = () => {
        const key = map[(location.hash||'').replace(/^#/, '')];
        if (!key) return;
        const btn = document.querySelector('[data-nav="'+key+'"]');
        if (btn && isPortalAuthenticated()) btn.click();
      };
      window.addEventListener('hashchange', apply);
      setTimeout(apply, 0);
      document.querySelectorAll('[data-nav]').forEach(btn => btn.addEventListener('click', () => {
        const id = btn.dataset.nav;
        if (id === 'ep' || id === 'statistical-crosses') {
          const next = '#'+id;
          if (location.hash !== next) history.replaceState(null, '', next);
        }
      }));
    })();
`;
  html = html.replace(
    "window.__portalCurrentPage = document.querySelector('[data-nav].active')?.dataset?.nav || 'general';",
    `window.__portalCurrentPage = document.querySelector('[data-nav].active')?.dataset?.nav || 'general';\n${hashBoot}`,
  );
}

fs.writeFileSync(path, html, "utf8");
console.log("spliced UI into index.html", {
  hasEp: html.includes('id="view-ep"'),
  hasSc: html.includes('id="view-statistical-crosses"'),
  hasNavEp: html.includes('data-nav="ep"'),
  hasLoad: html.includes("loadEpPerformance"),
});
