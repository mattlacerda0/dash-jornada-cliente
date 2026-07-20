/** Domínio corporativo Quarta Via — validação única do portal. */
export const CORPORATE_EMAIL_DOMAIN = 'quartavia.com.br';

/**
 * Aceita somente e-mails terminados em @quartavia.com.br.
 */
export function isQuartaviaEmail(email) {
  if (typeof email !== 'string') return false;
  return email.trim().toLowerCase().endsWith('@' + CORPORATE_EMAIL_DOMAIN);
}

/** Alias usado no backend e scripts. */
export function isCorporateEmail(email) {
  return isQuartaviaEmail(email);
}

export const INVALID_DOMAIN_MESSAGE =
  'O acesso é permitido somente para contas @quartavia.com.br.';

export const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre novamente.';
