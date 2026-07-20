/**
 * Auth Guard — Google OAuth via Supabase Auth.
 * Depende de window.supabase (UMD CDN), sem esm.sh.
 * Domínio obrigatório: @quartavia.com.br
 */
import {
  CORPORATE_EMAIL_DOMAIN,
  INVALID_DOMAIN_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
  isCorporateEmail,
  isQuartaviaEmail,
} from './corporateEmail.mjs';

export {
  isCorporateEmail,
  isQuartaviaEmail,
  CORPORATE_EMAIL_DOMAIN,
  INVALID_DOMAIN_MESSAGE,
  SESSION_EXPIRED_MESSAGE,
};

/** @type {'loading' | 'unauthenticated' | 'authenticated' | 'unauthorizedDomain' | 'error'} */
let authState = 'loading';
let authSupabase = null;
let session = null;
let authListenerBound = false;
let uiBound = false;
let bootOptions = {};
let portalShownOnce = false;

const els = {};
const isDev =
  location.hostname === 'localhost' ||
  location.hostname === '127.0.0.1' ||
  location.search.includes('authdebug=1');

function $(id) {
  return document.getElementById(id);
}

function debugAuth(extra = {}) {
  if (!isDev) return;
  console.debug('[Auth]', {
    hasSession: Boolean(session),
    email: session?.user?.email ?? null,
    authState,
    ...extra,
  });
}

function setAuthState(next) {
  authState = next;
  document.body.dataset.auth = next;
  debugAuth();
}

export function getAuthStatus() {
  return authState;
}

export function getSession() {
  return session;
}

export function getAccessToken() {
  return session?.access_token ?? null;
}

export function getUserEmail() {
  return session?.user?.email ?? null;
}

export function getSupabase() {
  return authSupabase;
}

export function getAuthSupabase() {
  return authSupabase;
}

export function isAuthenticated() {
  return authState === 'authenticated' && Boolean(session?.access_token);
}

async function loadPublicConfig() {
  const response = await fetch(`/api/auth-config?t=${Date.now()}`, { cache: 'no-store' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Não foi possível carregar a configuração de autenticação.');
  }
  const url = payload.authSupabaseUrl;
  const anonKey = payload.authSupabaseAnonKey;
  if (!url || !anonKey) {
    throw new Error('AUTH_SUPABASE_URL ou AUTH_SUPABASE_ANON_KEY ausentes no servidor.');
  }
  return { authSupabaseUrl: url, authSupabaseAnonKey: anonKey };
}

function resolveCreateClient() {
  const createClient = window.supabase?.createClient;
  if (typeof createClient !== 'function') {
    throw new Error('Biblioteca Supabase JS não carregou. Verifique a conexão com a CDN.');
  }
  return createClient;
}

function cacheElements() {
  els.gate = $('auth-root');
  els.app = $('portal-root');
  els.loading = $('auth-loading');
  els.login = $('auth-login');
  els.googleBtn = $('auth-google');
  els.message = $('auth-message');
  els.userEmail = $('auth-user-email');
  els.userName = $('auth-user-name');
  els.userAvatar = $('auth-user-avatar');
  els.signOut = $('auth-sign-out');
}

function showPanel(name) {
  if (els.loading) els.loading.hidden = name !== 'loading';
  if (els.login) els.login.hidden = name !== 'login';
}

function resetGoogleButton() {
  if (!els.googleBtn) return;
  els.googleBtn.disabled = false;
  els.googleBtn.innerHTML =
    '<span class="auth-google-icon" aria-hidden="true"></span> Continuar com Google';
}

function renderAuthLoading() {
  setAuthState('loading');
  if (els.gate) els.gate.hidden = false;
  if (els.app) els.app.hidden = true;
  showPanel('loading');
}

function renderLoginPage(message = '') {
  setAuthState('unauthenticated');
  clearHeaderUser();
  if (els.gate) els.gate.hidden = false;
  if (els.app) els.app.hidden = true;
  showPanel('login');
  setLoginMessage(message);
  resetGoogleButton();
}

function renderUnauthorizedDomain() {
  setAuthState('unauthorizedDomain');
  clearHeaderUser();
  if (els.gate) els.gate.hidden = false;
  if (els.app) els.app.hidden = true;
  showPanel('login');
  setLoginMessage(INVALID_DOMAIN_MESSAGE);
  resetGoogleButton();
}

function renderAuthError(message) {
  setAuthState('error');
  if (els.gate) els.gate.hidden = false;
  if (els.app) els.app.hidden = true;
  showPanel('login');
  setLoginMessage(message || 'Erro ao verificar o acesso.');
}

function userDisplayName(user) {
  const meta = user?.user_metadata || {};
  return meta.full_name || meta.name || meta.user_name || '';
}

function userAvatarUrl(user) {
  const meta = user?.user_metadata || {};
  return meta.avatar_url || meta.picture || '';
}

function updateHeaderUser(user) {
  const email = user?.email || '';
  const name = userDisplayName(user);
  const avatar = userAvatarUrl(user);

  if (els.userEmail) {
    els.userEmail.textContent = email;
    els.userEmail.title = email;
  }
  if (els.userName) {
    els.userName.textContent = name || email.split('@')[0] || '';
    els.userName.hidden = !(name || email);
  }
  if (els.userAvatar) {
    if (avatar) {
      els.userAvatar.src = avatar;
      els.userAvatar.alt = name || email || 'Avatar';
      els.userAvatar.hidden = false;
    } else {
      els.userAvatar.removeAttribute('src');
      els.userAvatar.hidden = true;
    }
  }
}

function clearHeaderUser() {
  if (els.userEmail) {
    els.userEmail.textContent = '';
    els.userEmail.title = '';
  }
  if (els.userName) {
    els.userName.textContent = '';
    els.userName.hidden = true;
  }
  if (els.userAvatar) {
    els.userAvatar.removeAttribute('src');
    els.userAvatar.hidden = true;
  }
}

function renderPortal() {
  setAuthState('authenticated');
  if (els.gate) els.gate.hidden = true;
  if (els.app) els.app.hidden = false;
  updateHeaderUser(session?.user);
}

function setLoginMessage(text, kind = 'error') {
  if (!els.message) return;
  if (!text) {
    els.message.hidden = true;
    els.message.textContent = '';
    els.message.dataset.kind = '';
    return;
  }
  els.message.hidden = false;
  els.message.textContent = text;
  els.message.dataset.kind = kind;
}

function friendlyAuthError(err) {
  const raw = err instanceof Error ? err.message : String(err || '');
  const lower = raw.toLowerCase();
  console.error('[auth]', err);

  if (lower.includes('popup') && (lower.includes('closed') || lower.includes('cancel'))) {
    return 'Login cancelado. Tente novamente.';
  }
  if (lower.includes('access_denied') || lower.includes('cancelled') || lower.includes('canceled')) {
    return 'Login cancelado. Tente novamente.';
  }
  if (lower.includes('provider') || (lower.includes('google') && lower.includes('not enabled'))) {
    return 'O login com Google ainda não está configurado. Contate o administrador.';
  }
  if (lower.includes('cdn') || lower.includes('biblioteca supabase')) {
    return 'Não foi possível carregar o cliente de autenticação. Verifique a rede e tente novamente.';
  }
  if (lower.includes('network') || lower.includes('fetch') || lower.includes('failed to fetch')) {
    return 'Erro de rede. Verifique sua conexão e tente novamente.';
  }
  if (lower.includes('redirect') || lower.includes('redirect_uri')) {
    return 'URL de redirecionamento não autorizada. Verifique a configuração do Supabase.';
  }
  return 'Não foi possível entrar com o Google. Tente novamente.';
}

function detectAuthCallbackError() {
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const query = new URLSearchParams(window.location.search);
  const error = hash.get('error') || query.get('error');
  const description =
    hash.get('error_description') ||
    query.get('error_description') ||
    hash.get('error_code') ||
    '';
  if (!error) return null;
  const lower = `${error} ${description}`.toLowerCase();
  if (lower.includes('access_denied')) {
    return 'Login cancelado. Tente novamente.';
  }
  return 'Não foi possível concluir o acesso com o Google. Tente novamente.';
}

function cleanAuthParamsFromUrl() {
  const url = new URL(window.location.href);
  let dirty = false;
  ['error', 'error_description', 'error_code', 'code', 'state', 'type'].forEach((key) => {
    if (url.searchParams.has(key)) {
      url.searchParams.delete(key);
      dirty = true;
    }
  });
  if (url.hash && /access_token|refresh_token|error|type=|provider_token/.test(url.hash)) {
    url.hash = '';
    dirty = true;
  }
  if (dirty) {
    window.history.replaceState({}, document.title, url.pathname + url.search);
  }
}

async function rejectInvalidDomainSession() {
  session = null;
  try {
    await authSupabase?.auth.signOut();
  } catch {
    /* ignore */
  }
  renderUnauthorizedDomain();
  bootOptions.onSignedOut?.();
}

/**
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
async function applySession(nextSession) {
  session = nextSession || null;
  const email = nextSession?.user?.email;
  debugAuth({ phase: 'applySession' });

  if (!nextSession || !email) {
    renderLoginPage('');
    return { ok: false };
  }
  if (!isQuartaviaEmail(email)) {
    await rejectInvalidDomainSession();
    return { ok: false, reason: 'unauthorizedDomain' };
  }
  renderPortal();
  return { ok: true };
}

function notifyAuthenticated() {
  if (!isAuthenticated()) return;
  bootOptions.onAuthenticated?.();
}

/**
 * Fetch autenticado — só com sessão válida.
 */
export async function authenticatedFetch(url, options = {}) {
  if (!authSupabase) {
    const err = new Error('AUTH_REQUIRED');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  const doFetch = async (token) => {
    const headers = new Headers(options.headers || {});
    headers.set('Authorization', `Bearer ${token}`);
    return fetch(url, { ...options, headers });
  };

  const { data: fresh, error: sessionError } = await authSupabase.auth.getSession();
  if (sessionError) console.error('[auth] getSession', sessionError);
  session = fresh?.session ?? null;

  if (!session?.access_token || !isQuartaviaEmail(session.user?.email)) {
    if (session && !isQuartaviaEmail(session.user?.email)) {
      await rejectInvalidDomainSession();
    } else {
      renderLoginPage(SESSION_EXPIRED_MESSAGE);
      bootOptions.onSignedOut?.();
    }
    const err = new Error('AUTH_REQUIRED');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  if (authState !== 'authenticated') {
    renderPortal();
  }

  let response = await doFetch(session.access_token);

  if (response.status === 401) {
    const { data, error } = await authSupabase.auth.refreshSession();
    if (!error && data?.session?.access_token) {
      session = data.session;
      response = await doFetch(data.session.access_token);
    }
  }

  if (response.status === 401) {
    console.error('[auth] API 401');
    try {
      await authSupabase.auth.signOut();
    } catch {
      /* ignore */
    }
    session = null;
    renderLoginPage(SESSION_EXPIRED_MESSAGE);
    bootOptions.onSignedOut?.();
    const err = new Error('AUTH_REQUIRED');
    err.code = 'AUTH_REQUIRED';
    throw err;
  }

  if (response.status === 403) {
    console.error('[auth] API 403');
    await rejectInvalidDomainSession();
    const err = new Error('AUTH_FORBIDDEN');
    err.code = 'AUTH_FORBIDDEN';
    throw err;
  }

  return response;
}

export async function apiFetch(url, options = {}) {
  return authenticatedFetch(url, options);
}

async function handleGoogleSignIn() {
  setLoginMessage('');
  if (!authSupabase) {
    setLoginMessage('Autenticação ainda não inicializada. Recarregue a página.');
    return;
  }

  if (els.googleBtn) {
    els.googleBtn.disabled = true;
    els.googleBtn.textContent = 'Redirecionando…';
  }

  const redirectTo = window.location.origin + window.location.pathname;
  console.debug('[OAuth]', {
    origin: window.location.origin,
    pathname: window.location.pathname,
    href: window.location.href,
    redirectTo,
    authProject: 'rckpuebaiswrxzmywllv',
  });

  try {
    const { data, error } = await authSupabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        queryParams: {
          prompt: 'select_account',
        },
      },
    });
    console.debug('[OAuth result]', {
      hasUrl: Boolean(data?.url),
      provider: data?.provider,
      error: error
        ? { message: error.message, status: error.status, code: error.code, name: error.name }
        : null,
    });
    if (error) {
      console.error('[OAuth error]', error);
      setLoginMessage(error.message || friendlyAuthError(error));
      setAuthState('error');
      showPanel('login');
      resetGoogleButton();
      return;
    }
    if (data?.url && !window.location.href.startsWith('https://accounts.google.com')) {
      console.debug('[OAuth] navegando manualmente para', data.url.slice(0, 120) + '…');
    }
  } catch (err) {
    console.error('[OAuth error]', err);
    const message = err instanceof Error ? err.message : String(err);
    setLoginMessage(message || friendlyAuthError(err));
    setAuthState('error');
    showPanel('login');
    resetGoogleButton();
  }
}

export async function signOut() {
  try {
    await authSupabase?.auth.signOut();
  } catch {
    /* ignore */
  }
  session = null;
  portalShownOnce = false;
  renderLoginPage('');
  bootOptions.onSignedOut?.();
}

function bindUi() {
  if (uiBound) return;
  uiBound = true;

  els.googleBtn?.addEventListener('click', () => {
    void handleGoogleSignIn();
  });
  els.signOut?.addEventListener('click', () => {
    void signOut();
  });
}

function bindAuthListener() {
  if (authListenerBound || !authSupabase) return;
  authListenerBound = true;

  authSupabase.auth.onAuthStateChange(async (event, nextSession) => {
    debugAuth({ event });

    if (event === 'SIGNED_OUT') {
      session = null;
      if (authState !== 'unauthorizedDomain') {
        renderLoginPage('');
      }
      bootOptions.onSignedOut?.();
      return;
    }

    if (
      event === 'SIGNED_IN' ||
      event === 'TOKEN_REFRESHED' ||
      event === 'USER_UPDATED' ||
      event === 'INITIAL_SESSION'
    ) {
      if (!nextSession) {
        if (event === 'INITIAL_SESSION') renderLoginPage('');
        return;
      }
      const applied = await applySession(nextSession);
      if (applied.ok) notifyAuthenticated();
    }
  });
}

/**
 * @param {{ onAuthenticated?: () => void, onSignedOut?: () => void }} options
 */
export async function bootAuth(options = {}) {
  bootOptions = options;
  cacheElements();
  bindUi();
  renderAuthLoading();

  const callbackError = detectAuthCallbackError();

  try {
    const config = await loadPublicConfig();
    const createClient = resolveCreateClient();
    authSupabase = createClient(config.authSupabaseUrl, config.authSupabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });

    bindAuthListener();

    const { data, error } = await authSupabase.auth.getSession();
    if (error) throw error;

    cleanAuthParamsFromUrl();
    debugAuth({ phase: 'boot getSession', authUrl: config.authSupabaseUrl });

    if (callbackError && !data.session) {
      renderLoginPage(callbackError);
      return;
    }

    const applied = await applySession(data.session);
    if (applied.ok) notifyAuthenticated();
  } catch (err) {
    console.error('[auth] boot failed:', err);
    renderAuthError(friendlyAuthError(err));
  }
}

window.PortalAuth = {
  bootAuth,
  apiFetch,
  authenticatedFetch,
  signOut,
  getSession,
  getAccessToken,
  getUserEmail,
  getAuthStatus,
  getSupabase,
  getAuthSupabase,
  isAuthenticated,
  isCorporateEmail,
  isQuartaviaEmail,
};
