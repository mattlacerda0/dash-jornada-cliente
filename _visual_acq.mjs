import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import puppeteer from "puppeteer";

const root = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(root, "_visual");
mkdirSync(outDir, { recursive: true });
const BASE = process.env.BASE_URL || "http://127.0.0.1:4173";

const browser = await puppeteer.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--window-size=1400,900"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });

const logs = [];
page.on("console", (msg) => {
  const text = msg.text();
  if (text.includes("acquisitionsByMonth")) logs.push(text);
});

await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("#gAcqChart", { timeout: 30000 });

// Force navigation to general if needed and wait for data
await page.evaluate(() => {
  const btn = document.querySelector('[data-nav="general"]');
  if (btn) btn.click();
});

await page.waitForFunction(() => {
  return document.querySelectorAll("#gAcqChart .acquisition-column").length >= 6;
}, { timeout: 180000 });

async function snap(name) {
  const panel = await page.$(".acquisition-panel") || await page.$("#gAcqChart");
  if (panel) await panel.screenshot({ path: resolve(outDir, name) });
  else await page.screenshot({ path: resolve(outDir, name) });
}

const check = async (label) => {
  const data = await page.evaluate(() => {
    const chart = document.querySelector("#gAcqChart");
    const grid = chart?.querySelector(".acquisition-chart-grid");
    const cols = [...(grid?.querySelectorAll(".acquisition-column") || [])];
    const hasHorizontal = !!(
      chart?.querySelector(".month-bars") ||
      chart?.querySelector(".month-row") ||
      chart?.querySelector(".month-track")
    );
    const values = cols.map((c) => ({
      month: c.dataset.month,
      value: Number(c.dataset.value),
      barH: Math.round(c.querySelector(".acquisition-column-bar")?.getBoundingClientRect().height || 0),
      hasValueText: !!(c.querySelector(".acquisition-column-value")?.textContent || "").trim(),
      hasLabel: !!(c.querySelector(".acquisition-column-label")?.textContent || "").trim(),
    }));
    const feb = values.find((v) => v.month === "2026-02");
    const maxBar = Math.max(...values.map((v) => v.barH), 0);
    const maxVal = Math.max(...values.map((v) => v.value), 0);
    return {
      colCount: cols.length,
      hasHorizontal,
      leftMonth: values[0]?.month || null,
      rightMonth: values[values.length - 1]?.month || null,
      values,
      feb,
      febIsTallestBar: feb ? feb.barH === maxBar && feb.value === maxVal : null,
      summary: document.querySelector("#gAcqSummary")?.innerText || "",
      gridClass: grid?.className || null,
    };
  });
  console.log(label, JSON.stringify(data, null, 2));
  writeFileSync(resolve(outDir, `${label}.json`), JSON.stringify(data, null, 2));
  return data;
};

const r6 = await check("range6");
await snap("acq-6m.png");
await page.screenshot({ path: resolve(outDir, "full-6m.png") });

await page.evaluate(() => {
  document.querySelector('#gAcqRangeSeg [data-acq-range="12"]')?.click();
});
await page.waitForFunction(() => document.querySelectorAll("#gAcqChart .acquisition-column").length === 12, { timeout: 30000 });
const r12 = await check("range12");
await snap("acq-12m.png");

await page.evaluate(() => {
  document.querySelector('#gAcqRangeSeg [data-acq-range="24"]')?.click();
});
await page.waitForFunction(() => document.querySelectorAll("#gAcqChart .acquisition-column").length === 24, { timeout: 30000 });
const r24 = await check("range24");
await snap("acq-24m.png");

writeFileSync(resolve(outDir, "console-logs.json"), JSON.stringify(logs, null, 2));
writeFileSync(
  resolve(outDir, "summary.json"),
  JSON.stringify(
    {
      apiLogSample: logs[0]?.slice(0, 300) || null,
      cols: { "6": r6.colCount, "12": r12.colCount, "24": r24.colCount },
      noHorizontal: !r6.hasHorizontal && !r12.hasHorizontal && !r24.hasHorizontal,
      febTallestOn6: r6.febIsTallestBar,
      order6: { left: r6.leftMonth, right: r6.rightMonth },
    },
    null,
    2,
  ),
);

await browser.close();
console.log("OK", outDir);
