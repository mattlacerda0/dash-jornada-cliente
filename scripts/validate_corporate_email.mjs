import { isCorporateEmail, isQuartaviaEmail } from '../js/corporateEmail.mjs';

const cases = [
  ['ana@quartavia.com.br', true],
  ['  Ana@QuartaVia.com.br  ', true],
  ['ana@gmail.com', false],
  ['ana@quartavia.com', false],
  ['ana@quartavia.com.br.outrodominio.com', false],
  ['quartavia.com.br@gmail.com', false],
  ['@quartavia.com.br', true], // endsWith conforme especificação
  ['', false],
  [null, false],
];

let failed = 0;
for (const [email, expected] of cases) {
  const got = isQuartaviaEmail(email);
  const alias = isCorporateEmail(email);
  if (got !== expected || alias !== expected) {
    failed += 1;
    console.error('FAIL', email, 'expected', expected, 'got', got, 'alias', alias);
  }
}
if (failed) {
  console.error(`${failed} case(s) failed`);
  process.exit(1);
}
console.log(`ok ${cases.length} cases`);
