import { readFileSync, writeFileSync } from "fs";

const CANCEL_RULE =
  "churn_efetivado_at OU distrato_assinado_at OU distrato='Assinado' OU clients.data_churn (união distinta por client_id; não arquivado)";
const DATE_PRIORITY =
  "prioridade: churn_efetivado_at > distrato_assinado_at > clients.data_churn; distrato Assinado sem data = efetivado sem data confirmada";

const DATA_CHURN_SRC = '{ schema: SUPABASE, table: "clients", column: "data_churn" }';
const DISTRATO_SRC = '{ schema: SUPABASE, table: "cancellations", column: "distrato" }';

function patchFile(path) {
  let s = readFileSync(path, "utf8");

  // Fix Assinado-without-date false claim
  s = s.replaceAll(
    "Não contam como cancelamento efetivado.",
    "Contam como cancelamento efetivado sem data confirmada (fora do gráfico mensal).",
  );
  s = s.replaceAll(
    "Não conta como cancelamento confirmado.",
    "Não conta como cancelamento efetivado; categoria 'Marcado como cancelado sem confirmação'.",
  );

  // Broaden cancelled definitions
  s = s.replaceAll(
    "possui churn efetivado ou distrato assinado em registro não arquivado.",
    `possui evidência consolidada: ${CANCEL_RULE}. ${DATE_PRIORITY}.`,
  );
  s = s.replaceAll(
    "sem churn_efetivado_at nem distrato_assinado_at (registro não arquivado).",
    `sem a regra consolidada (${CANCEL_RULE}).`,
  );
  s = s.replaceAll(
    "sem churn_efetivado_at nem distrato_assinado_at.",
    `sem a regra consolidada (${CANCEL_RULE}).`,
  );
  s = s.replaceAll(
    "sem churn efetivado ou distrato assinado.",
    `sem a regra consolidada (${CANCEL_RULE}).`,
  );
  s = s.replaceAll(
    "Status bruto Cancelado/Churn sem churn_efetivado_at nem distrato_assinado_at.",
    "Status bruto Cancelado/Churn sem evidência da regra consolidada (churn/distrato/data_churn).",
  );
  s = s.replaceAll(
    "churn_efetivado_at ?? distrato_assinado_at",
    "churn_efetivado_at ?? distrato_assinado_at ?? clients.data_churn | distrato Assinado",
  );
  s = s.replaceAll(
    "churn_efetivado_at ou distrato_assinado_at",
    "churn_efetivado_at ou distrato_assinado_at ou distrato Assinado ou clients.data_churn",
  );
  s = s.replaceAll(
    "com churn_efetivado_at ou distrato_assinado_at",
    "com churn_efetivado_at ou distrato_assinado_at ou distrato Assinado ou clients.data_churn",
  );

  // Inject data_churn source next to distrato_assinado_at sources when missing nearby
  s = s.replaceAll(
    `{ schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },\n    ],`,
    `{ schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },\n      ${DISTRATO_SRC},\n      ${DATA_CHURN_SRC},\n    ],`,
  );
  s = s.replaceAll(
    `{ schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },\n      ],`,
    `{ schema: SUPABASE, table: "cancellations", column: "distrato_assinado_at" },\n        ${DISTRATO_SRC},\n        ${DATA_CHURN_SRC},\n      ],`,
  );

  // Rename label for cancelled without evidence
  s = s.replaceAll(
    'label: "Cancelados sem data confirmada"',
    'label: "Marcados como cancelados sem confirmação"',
  );

  writeFileSync(path, s);
  console.log("patched", path);
}

patchFile("netlify/functions/_shared/portal-metric-catalog.mjs");
patchFile("netlify/functions/_shared/portal-metric-registry.mjs");
