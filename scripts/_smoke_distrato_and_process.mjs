/**
 * Unit checks — distrato Assinado vs Não assinado + processEntryDate.
 * Sem acesso a banco.
 */
import { isDistratoTextSigned } from '../netlify/functions/_shared/analytical-cancellation.mjs';
import {
  resolveProcessEntryDate,
  resolveAnalyticalProcessSituation,
} from '../netlify/functions/_shared/cancellation-process.mjs';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(isDistratoTextSigned('Assinado') === true, 'Assinado deve ser true');
assert(isDistratoTextSigned(' Não Assinado ') === false, 'Não assinado não pode ser efetivação');
assert(isDistratoTextSigned('Pendente') === false, 'Pendente não é Assinado');
assert(isDistratoTextSigned('') === false, 'vazio');

const pedido = new Date('2026-07-01T15:00:00-03:00');
const intencao = new Date('2026-06-01T15:00:00-03:00');
const stage = new Date('2026-05-01T15:00:00-03:00');
assert(resolveProcessEntryDate(pedido, intencao, stage).source === 'data_pedido', 'prio pedido');
assert(resolveProcessEntryDate(null, intencao, stage).source === 'intencao_registrada_at', 'prio intencao');
assert(resolveProcessEntryDate(null, null, stage).source === 'stage_entered_at', 'prio stage');

assert(
  resolveAnalyticalProcessSituation({
    hasEfetivado: true,
    hasConfirmedDate: false,
    hasIntentionOrPedido: true,
  }) === 'Cancelamento efetivado sem data',
  'efetivado sem data',
);
assert(
  resolveAnalyticalProcessSituation({
    hasEfetivado: false,
    hasIntentionOrPedido: true,
  }) === 'Intenção/pedido em andamento',
  'em processo',
);

console.log(JSON.stringify({ ok: true, checks: 8 }, null, 2));
