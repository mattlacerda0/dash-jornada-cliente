/**
 * Smoke UX: modal tela cheia + seletor de variáveis (sem browser).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const html = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "index.html"), "utf8");

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
}

assert(/width:min\(92vw/.test(html) || /max-width:94vw/.test(html), "modal largura maior");
assert(/height:min\(90vh/.test(html) || /max-height:92vh/.test(html), "modal altura maior");
assert(html.includes("evt.target === fsModal") || html.includes("evt.target === fsModal"), "clique fora fecha FS");
assert(html.includes("sc-fs-btn-close"), "botão fechar destacado");
assert(html.includes("scMsBackdrop"), "backdrop seletor");
assert(html.includes("scMatrixSelectAll"), "selecionar todas");
assert(html.includes("scOpenMatrixVarsPanel"), "abrir painel");
assert(html.includes("scCloseMatrixVarsPanel"), "fechar painel");
assert(html.includes("sc-ms-chip"), "chips seleção");
assert(html.includes("Buscar variável"), "placeholder busca");
assert(html.includes("Financeiro") && html.includes("Reuniões") && html.includes("Permanência"), "categorias");
assert(!/<div class="sc-ms-panel" id="scMsPanel" hidden>\s*<input type="search"/.test(html), "painel antigo inline removido");
assert(html.includes("sc-ms-panel-foot"), "rodapé ações");

console.log("VERIFY_SC_UX_MODAL_MS_OK");
