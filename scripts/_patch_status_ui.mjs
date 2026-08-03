import { readFileSync, writeFileSync } from "fs";

const path = "index.html";
let s = readFileSync(path, "utf8");

s = s.replaceAll(
  '<option value="cancelled_no_date">Cancelados sem data confirmada</option>',
  '<option value="cancelled_no_date">Marcados como cancelados sem confirmação</option>',
);
s = s.replaceAll(
  '<option value="cancelled_no_date">Marcados como cancelados, sem data</option>',
  '<option value="cancelled_no_date">Marcados como cancelados sem confirmação</option>',
);

function isEff(st) {
  return `(${st} === 'Cancelado' || ${st} === 'Cancelado efetivado sem data' || ${st} === 'Cancelado confirmado')`;
}
function isMarked(st) {
  return `(${st} === 'Marcado como cancelado sem confirmação' || ${st} === 'Cancelado sem data confirmada')`;
}

// EP client-side filter
s = s.replace(
  `if (status === 'cancelled') clients = clients.filter((c) => c.analyticalStatus === 'Cancelado');
        if (status === 'cancelled_no_date') clients = clients.filter((c) => c.analyticalStatus === 'Cancelado sem data confirmada');`,
  `if (status === 'cancelled') clients = clients.filter((c) => c.cancelled || ${isEff("c.analyticalStatus")});
        if (status === 'cancelled_no_date') clients = clients.filter((c) => ${isMarked("c.analyticalStatus")});`,
);

// EP counts in recompute
s = s.replace(
  `const cancelledClients = clients.filter((c) => c.analyticalStatus === 'Cancelado').length;
        const cancelledWithoutConfirmedDate = clients.filter((c) => c.analyticalStatus === 'Cancelado sem data confirmada').length;`,
  `const cancelledClients = clients.filter((c) => c.cancelled || ${isEff("c.analyticalStatus")}).length;
        const cancelledWithoutConfirmedDate = clients.filter((c) => ${isMarked("c.analyticalStatus")}).length;`,
);

// General STATUS_ORDER and maps
s = s.replace(
  `{ value: 'cancelled_no_date', label: 'Cancelados sem data confirmada' }`,
  `{ value: 'cancelled_no_date', label: 'Marcados como cancelados sem confirmação' }`,
);
s = s.replace(
  `cancelled_no_date: 'Cancelado sem data confirmada',`,
  `cancelled_no_date: 'Marcado como cancelado sem confirmação',
      cancelled_effective_no_date: 'Cancelado efetivado sem data',`,
);
s = s.replace(
  `const STATUS_ORDER = ['Ativo', 'Congelado', 'Cancelado confirmado', 'Cancelado sem data confirmada', 'Não informado'];`,
  `const STATUS_ORDER = ['Ativo', 'Congelado', 'Cancelado confirmado', 'Cancelado efetivado sem data', 'Marcado como cancelado sem confirmação', 'Não informado'];`,
);

// Broad replace remaining exact status string checks for marked
s = s.replaceAll(
  `c.analyticalStatus === 'Cancelado sem data confirmada'`,
  `(c.analyticalStatus === 'Marcado como cancelado sem confirmação' || c.analyticalStatus === 'Cancelado sem data confirmada')`,
);
s = s.replaceAll(
  `r.analyticalStatus === 'Cancelado sem data confirmada'`,
  `(r.analyticalStatus === 'Marcado como cancelado sem confirmação' || r.analyticalStatus === 'Cancelado sem data confirmada')`,
);
s = s.replaceAll(
  `st === 'Cancelado sem data confirmada'`,
  `(st === 'Marcado como cancelado sem confirmação' || st === 'Cancelado sem data confirmada')`,
);
s = s.replaceAll(
  `status === 'Cancelado sem data confirmada'`,
  `(status === 'Marcado como cancelado sem confirmação' || status === 'Cancelado sem data confirmada')`,
);
s = s.replaceAll(
  `client?.status === 'Cancelado sem data confirmada'`,
  `(client?.status === 'Marcado como cancelado sem confirmação' || client?.status === 'Cancelado sem data confirmada')`,
);
s = s.replaceAll(
  `label === 'Cancelado sem data confirmada'`,
  `(label === 'Marcado como cancelado sem confirmação' || label === 'Cancelado sem data confirmada')`,
);
s = s.replaceAll(
  `key === 'Cancelado sem data confirmada'`,
  `(key === 'Marcado como cancelado sem confirmação' || key === 'Cancelado sem data confirmada')`,
);

// Expand cancelled filter in general to include effective without date
s = s.replaceAll(
  `st === 'Cancelado'`,
  `(st === 'Cancelado' || st === 'Cancelado efetivado sem data' || st === 'Cancelado confirmado')`,
);

// knownStatuses sets
s = s.replaceAll(
  `new Set(['Ativo', 'Congelado', 'Cancelado', 'Cancelado sem data confirmada', 'Não informado'])`,
  `new Set(['Ativo', 'Congelado', 'Cancelado', 'Cancelado efetivado sem data', 'Marcado como cancelado sem confirmação', 'Cancelado sem data confirmada', 'Não informado'])`,
);

writeFileSync(path, s);
console.log("index.html patched");
