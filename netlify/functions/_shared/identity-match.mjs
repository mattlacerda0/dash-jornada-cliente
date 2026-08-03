/**
 * Matching de identidade entre App Pharus e BASE QV.
 * Prioridade: id compartilhado > CPF > e-mail > telefone > nome exato.
 * Sem fuzzy. Ambíguos não são escolhidos arbitrariamente.
 */

function blankToNull(value) {
  if (value == null) return null;
  if (typeof value === "string" && !value.trim()) return null;
  return value;
}

export function foldName(raw) {
  return String(raw || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");
}

export function normalizeEmail(raw) {
  const s = String(blankToNull(raw) || "").trim().toLowerCase();
  if (!s || !s.includes("@")) return null;
  return s;
}

export function normalizeCpf(raw) {
  const digits = String(blankToNull(raw) || "").replace(/\D/g, "");
  if (digits.length !== 11) return null;
  if (/^(\d)\1{10}$/.test(digits)) return null;
  return digits;
}

export function normalizePhone(raw) {
  let digits = String(blankToNull(raw) || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  if (digits.length < 10 || digits.length > 11) return null;
  return digits;
}

function maskCpf(cpf) {
  if (!cpf || cpf.length !== 11) return null;
  return `***.***.***-${cpf.slice(-2)}`;
}

function indexBy(rows, keyFn) {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!key) continue;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
}

/**
 * @param {Array} qvClients — { id, codigo, name, email, cpf, phone, engineer }
 * @param {Array} pharusUsers — { userId, name, email, cpf, phone, mechanismCount }
 */
export function matchPharusToBaseQv(qvClients = [], pharusUsers = []) {
  const qv = (qvClients || []).map((c) => ({
    id: String(c.id || c.clientId),
    codigo: blankToNull(c.codigo || c.clientCode),
    name: blankToNull(c.name || c.clientName),
    email: normalizeEmail(c.email),
    cpf: normalizeCpf(c.cpf || c.cpf_digits || c.documento),
    phone: normalizePhone(c.phone || c.phone_digits || c.telefone),
    engineer: blankToNull(c.engineer || c.engenheiro_patrimonial),
    mechanismCount: Number(c.mechanismCount || c.available || 0) || 0,
  })).filter((c) => c.id);

  const byId = new Map(qv.map((c) => [c.id, c]));
  const byCpf = indexBy(qv, (c) => c.cpf);
  const byEmail = indexBy(qv, (c) => c.email);
  const byPhone = indexBy(qv, (c) => c.phone);
  const byName = indexBy(qv, (c) => foldName(c.name));

  const rows = [];
  const warningsAgg = {
    pharusMissingIdentity: 0,
    ambiguousMatches: 0,
    unmatched: 0,
    nameOnlyMatches: 0,
    emailDuplicates: [...byEmail.values()].filter((a) => a.length > 1).length,
    cpfDuplicates: [...byCpf.values()].filter((a) => a.length > 1).length,
    phoneDuplicates: [...byPhone.values()].filter((a) => a.length > 1).length,
    qvMultiUser: 0,
  };

  const matchedQvIds = new Set();
  const qvToUsers = new Map();

  for (const u of pharusUsers || []) {
    const userId = String(u.userId || u.user_id || u.id || "");
    if (!userId) continue;
    const email = normalizeEmail(u.email);
    const cpf = normalizeCpf(u.cpf || u.cpf_digits || u.document);
    const phone = normalizePhone(u.phone || u.phone_digits || u.telefone);
    const name = blankToNull(u.name);
    const nameKey = foldName(name);
    const mechCount = Number(u.mechanismCount || u.mechanismsCount || 0) || 0;

    if (!email && !cpf && !phone && !nameKey) warningsAgg.pharusMissingIdentity += 1;

    let method = null;
    let candidates = [];
    let confidence = "none";

    // 1) shared id
    if (byId.has(userId)) {
      candidates = [byId.get(userId)];
      method = "shared_id";
      confidence = "high";
    }
    // 2) CPF
    if (!candidates.length && cpf && byCpf.has(cpf)) {
      candidates = byCpf.get(cpf);
      method = "cpf";
      confidence = candidates.length === 1 ? "high" : "ambiguous";
    }
    // 3) email
    if (!candidates.length && email && byEmail.has(email)) {
      candidates = byEmail.get(email);
      method = "email";
      confidence = candidates.length === 1 ? "high" : "ambiguous";
    }
    // 4) phone
    if (!candidates.length && phone && byPhone.has(phone)) {
      candidates = byPhone.get(phone);
      method = "phone";
      confidence = candidates.length === 1 ? "high" : "ambiguous";
    }
    // 5) name exact (last resort)
    if (!candidates.length && nameKey && byName.has(nameKey)) {
      candidates = byName.get(nameKey);
      method = "name";
      confidence = candidates.length === 1 ? "low" : "ambiguous";
      if (candidates.length === 1) warningsAgg.nameOnlyMatches += 1;
    }

    let status = "unmatched";
    let matched = null;
    if (candidates.length === 1 && confidence !== "ambiguous") {
      matched = candidates[0];
      status = method === "name" ? "matched_name_only" : "matched";
      matchedQvIds.add(matched.id);
      if (!qvToUsers.has(matched.id)) qvToUsers.set(matched.id, new Set());
      qvToUsers.get(matched.id).add(userId);
    } else if (candidates.length > 1 || confidence === "ambiguous") {
      status = "ambiguous";
      warningsAgg.ambiguousMatches += 1;
    } else {
      warningsAgg.unmatched += 1;
    }

    rows.push({
      pharusUserId: userId,
      pharusName: name,
      pharusEmail: email,
      cpfMasked: maskCpf(cpf),
      foundInBaseQv: Boolean(matched),
      clientId: matched?.id || null,
      clientCode: matched?.codigo || null,
      engineer: matched?.engineer || null,
      matchMethod: method,
      matchStatus: status,
      matchConfidence: confidence,
      candidateCount: candidates.length,
      pharusMechanismCount: mechCount,
      qvMechanismCount: matched?.mechanismCount || 0,
    });
  }

  for (const [, users] of qvToUsers) {
    if (users.size > 1) warningsAgg.qvMultiUser += 1;
  }

  const matchedInBoth = matchedQvIds.size;
  const baseQvClients = qv.length;
  const appPharusUsers = (pharusUsers || []).length;
  const ambiguousMatches = warningsAgg.ambiguousMatches;
  const unmatchedAppPharus = warningsAgg.unmatched;
  const baseQvOnly = Math.max(0, baseQvClients - matchedInBoth);
  const appPharusOnly = unmatchedAppPharus;
  // Pessoas únicas estimadas: matched (1x) + só QV + Pharus sem match.
  // Ambíguos NÃO entram no consolidado (ficam separados).
  const consolidatedUniquePeople = matchedInBoth + baseQvOnly + unmatchedAppPharus;
  let consolidationMode = "deduplicated";
  if (ambiguousMatches > 0) consolidationMode = "partial";
  else if (unmatchedAppPharus > 0 && matchedInBoth === 0) consolidationMode = "partial";
  else if (unmatchedAppPharus > 0) consolidationMode = "partial";

  return {
    crossSourceCoverage: {
      baseQvClients,
      appPharusUsers,
      matchedInBoth,
      baseQvOnly,
      appPharusOnly,
      unmatchedAppPharus,
      ambiguousMatches,
      nameOnlyMatches: warningsAgg.nameOnlyMatches,
      consolidatedUniquePeople,
      consolidationMode,
      matchPriority: ["shared_id", "cpf", "email", "phone", "name"],
    },
    crossSourceRows: rows,
    warningsAgg,
  };
}
