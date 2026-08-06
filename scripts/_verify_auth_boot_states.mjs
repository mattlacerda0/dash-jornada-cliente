import { readFileSync } from "fs";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
try {
  require("child_process").execSync("node --check js/auth.mjs", { stdio: "inherit" });
  require("child_process").execSync("node --check netlify/functions/auth-config.mjs", { stdio: "inherit" });
} catch {
  process.exit(1);
}

const h = readFileSync("index.html", "utf8");
const a = readFileSync("js/auth.mjs", "utf8");
const checks = {
  btnDisabled: /id="auth-google"[^>]*\bdisabled\b/.test(h),
  initializing: a.includes("'initializing'"),
  authenticating: a.includes("'authenticating'"),
  bootReady: a.includes("bootReady"),
  timeout: a.includes("GET_SESSION_TIMEOUT"),
  diag: a.includes("[AuthDiag]"),
  blocksServiceRole: a.includes("service_role"),
  configMissingMsg: a.includes("Configuração de autenticação ausente."),
  persistSession: a.includes("persistSession: true"),
  autoRefresh: a.includes("autoRefreshToken: true"),
  detectUrl: a.includes("detectSessionInUrl: true"),
};
console.log(JSON.stringify(checks, null, 2));
if (Object.values(checks).some((v) => !v)) {
  console.error("SOME_CHECKS_FAILED");
  process.exit(1);
}
console.log("AUTH_AUDIT_OK");
