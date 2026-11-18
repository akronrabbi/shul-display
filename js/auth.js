import { AUTH_URL, jwtExpiry } from './cloud.js';

// Google is a full-page redirect. The session cookie is on neon.tech, which
// Safari may refuse to send back to github.io. The client also accepts a
// session verifier on the return URL, and we keep the short-lived editor
// JWT in this tab so Save still works when that cookie is blocked.

const JWT_KEY = 'shul-editor-jwt';
const EMAIL_KEY = 'shul-editor-email';

let neon = null;
let auth = null;
let ready = null;

function client() {
  if (!ready) {
    ready = import('https://esm.sh/@neondatabase/auth@0.7.0-beta').then((mod) => {
      const create = mod.createInternalNeonAuth || mod.createAuthClient;
      neon = create(AUTH_URL);
      auth = neon.adapter?.signIn ? neon.adapter : (neon.adapter?.getBetterAuthInstance?.() || neon.adapter || neon);
      return auth;
    });
  }
  return ready;
}

function remember(token, email) {
  try {
    if (token && String(token).split('.').length === 3) sessionStorage.setItem(JWT_KEY, token);
    if (email) sessionStorage.setItem(EMAIL_KEY, email);
  } catch { /* private mode */ }
}

function rememberedToken() {
  try {
    const token = sessionStorage.getItem(JWT_KEY);
    if (!token || jwtExpiry(token) < Date.now() + 15000) return null;
    return token;
  } catch {
    return null;
  }
}

function forget() {
  try {
    sessionStorage.removeItem(JWT_KEY);
    sessionStorage.removeItem(EMAIL_KEY);
  } catch { /* ignore */ }
}

export async function authReady() {
  try {
    await client();
    return true;
  } catch {
    return false;
  }
}

export async function currentUser() {
  try {
    await client();
    const session = await auth.getSession();
    const user = session?.data?.user || session?.data?.session?.user || null;
    if (user?.email) {
      remember(session?.data?.session?.token, user.email);
      return user;
    }
  } catch { /* fall through to the token kept in this tab */ }
  try {
    const email = sessionStorage.getItem(EMAIL_KEY);
    if (email && rememberedToken()) return { email };
  } catch { /* ignore */ }
  return null;
}

export async function editorToken() {
  try {
    await client();
    const session = await auth.getSession();
    const user = session?.data?.user || session?.data?.session?.user || null;
    if (user) {
      if (typeof auth.token === 'function') {
        const result = await auth.token();
        const token = result?.data?.token;
        if (token && String(token).split('.').length === 3) {
          remember(token, user.email);
          return token;
        }
      }
      if (neon && typeof neon.getJWTToken === 'function') {
        const token = await neon.getJWTToken();
        if (token && String(token).split('.').length === 3) {
          remember(token, user.email);
          return token;
        }
      }
      const sessionToken = session?.data?.session?.token;
      if (sessionToken && String(sessionToken).split('.').length === 3) {
        remember(sessionToken, user.email);
        return sessionToken;
      }
    }
  } catch { /* cookie blocked; use the token from the redirect */ }
  return rememberedToken();
}

export async function signInWithGoogle() {
  await client();
  const callbackURL = new URL('./editor.html', location.href).href;
  const result = await auth.signIn.social({ provider: 'google', callbackURL });
  if (result?.error) {
    const detail = result.error.message || '';
    if (/403|forbidden/i.test(detail)) {
      throw new Error('Google did not start from this address. Open the editor on the shul website and try again.');
    }
    throw new Error(detail || 'Google sign-in did not start.');
  }
}

export async function sendEmailCode(email) {
  await client();
  const result = await auth.emailOtp.sendVerificationOtp({ email, type: 'sign-in' });
  if (result?.error) throw new Error(result.error.message || 'The code could not be sent.');
}

export async function signInWithCode(email, otp) {
  await client();
  const result = await auth.signIn.emailOtp({ email, otp });
  if (result?.error) throw new Error(result.error.message || 'That code did not work.');
  const user = result?.data?.user || null;
  const token = await editorToken();
  remember(token, user?.email || email);
  return user;
}

export async function signOut() {
  forget();
  try {
    await client();
    await auth.signOut();
  } catch { /* the name is already cleared */ }
}
