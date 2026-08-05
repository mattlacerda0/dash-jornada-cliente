/**
 * Unit check: old overflow condition always tripped on a fresh page;
 * new condition must not addPage when pageHasContent=false.
 */
function oldWouldAddPage(y, need, pageH, footerH, margin, headerH) {
  return y + Math.min(need, pageH - footerH - margin - headerH) > pageH - footerH - 4;
}

function newWouldAddPage(need, remaining, pageHasContent) {
  return need > remaining && pageHasContent;
}

const cases = [
  { name: "fresh landscape after orient switch", y: 24, pageH: 210, need: 200, has: false },
  { name: "fresh portrait", y: 24, pageH: 297, need: 180, has: false },
  { name: "near bottom with content", y: 250, pageH: 297, need: 80, has: true },
  { name: "room left with content", y: 40, pageH: 297, need: 50, has: true },
];

let fail = 0;
for (const c of cases) {
  const footerH = 12, margin = 14, headerH = 10;
  const rem = Math.max(0, c.pageH - footerH - c.y - 4);
  const oldP = oldWouldAddPage(c.y, c.need, c.pageH, footerH, margin, headerH);
  const newP = newWouldAddPage(c.need, rem, c.has);
  const expectOldBlank = c.name.includes("landscape after orient");
  console.log(c.name, { oldP, newP, rem, expectOldBlank });
  if (expectOldBlank && !oldP) {
    console.error("expected old bug to fire on landscape fresh page");
    fail++;
  }
  if (expectOldBlank && newP) {
    console.error("new logic must NOT add page on empty fresh page");
    fail++;
  }
  if (c.name === "near bottom with content" && !newP) {
    console.error("should break near bottom");
    fail++;
  }
  if (c.name === "room left with content" && newP) {
    console.error("should NOT break when room left");
    fail++;
  }
}

if (fail) process.exit(1);
console.log("PAGINATION_LOGIC_OK");
