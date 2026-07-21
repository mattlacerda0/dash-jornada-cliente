import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const root = dirname(fileURLToPath(import.meta.url));
for (const name of [".env", "exemplo.env"]) {
  const path = resolve(root, name);
  if (!existsSync(path)) continue;
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim().replace(/^(['"])(.*)\1$/, "$2");
    if (key && !process.env[key]) process.env[key] = value;
  }
}

const { resolvePortalContext } = await import("./netlify/functions/_shared/portal-query.mjs");

const QUESTIONS = [
  "Quantos clientes ativos temos?",
  "Quantos clientes APEX ativos do EP Gabriel temos?",
  "Qual a renda típica dos clientes PRIVATE?",
  "Quantos clientes foram contratados no mês passado?",
  "Quantos no-shows a carteira da Elenice teve nos últimos 30 dias?",
  "Qual foi a taxa de comparecimento do Gabriel este ano?",
  "Quantos mecanismos concluídos os clientes APEX possuem?",
  "Qual a taxa de implementação do EP Tales?",
  "Quantos clientes ativos atualizaram os dados nos últimos 30 dias?",
  "Quantos clientes estão há mais de 90 dias sem atualização?",
  "Quantos chamados abertos tivemos este mês?",
  "Quantos chamados de prioridade média foram solicitados pelo cliente?",
  "Qual o preenchimento da renda mensal?",
  "Quais campos de Reuniões estão com alerta?",
  "Dados recentes do Gabriel",
];

for (let i = 0; i < QUESTIONS.length; i += 1) {
  const q = QUESTIONS[i];
  try {
    const { intent, dados_contexto } = await resolvePortalContext(q);
    const c = dados_contexto;
    console.log(`\n[${i + 1}] ${q}`);
    console.log(`   intent=${intent} domain=${c?.domain ?? "-"} metric=${c?.metric ?? "-"} value=${c?.value ?? "null"} realtime=${c?.realtime_database ?? false}`);
    if (c?.filter_labels?.length) console.log(`   filtros: ${c.filter_labels.join(" | ")}`);
    if (c?.warnings?.length) console.log(`   warnings: ${c.warnings.join(" | ")}`);
    if (c?.ambiguities?.length) console.log(`   ambiguidades: ${c.ambiguities.join(" | ")}`);
  } catch (err) {
    console.log(`\n[${i + 1}] ${q}`);
    console.log(`   ERRO: ${err?.message || err}`);
  }
}
