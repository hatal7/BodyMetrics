// Edge Function login-by-username; deploy with Verify JWT = OFF.
// service_role remains on Supabase servers; never deploy it to GitHub Pages.
import { createClient } from 'npm:@supabase/supabase-js@2';

const URL = Deno.env.get('SUPABASE_URL')!;
const PUBLIC_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SECRET_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const allowedOrigins = new Set(['https://hatal7.github.io']);
function headers(origin: string | null) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin && allowedOrigins.has(origin) ? origin : 'https://hatal7.github.io',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'apikey, content-type, authorization, x-client-info',
    'Cache-Control': 'no-store',
    'Vary': 'Origin',
  };
}
Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const h = headers(origin);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
  if (request.method !== 'POST' || (origin && !allowedOrigins.has(origin)))
    return new Response(JSON.stringify({ error: 'Niedozwolone żądanie.' }), { status: 403, headers: h });
  try {
    const body = await request.json();
    const username = String(body.username ?? '').trim().toLowerCase();
    const password = body.password;
    const generic = () => new Response(JSON.stringify({ error: 'Nieprawidłowy login lub hasło.' }), { status: 401, headers: h });
    if (!/^[a-z0-9_]{3,30}$/.test(username) || typeof password !== 'string' || password.length > 1024 || !password) return generic();
    const admin = createClient(URL, SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: found, error: lookupError } = await admin.from('account_logins').select('user_id').eq('username', username).maybeSingle();
    if (lookupError) throw lookupError;
    if (!found) return generic();
    const { data: userResult, error: userError } = await admin.auth.admin.getUserById(found.user_id);
    if (userError || !userResult?.user?.email) return generic();
    const auth = createClient(URL, PUBLIC_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: session, error: signInError } = await auth.auth.signInWithPassword({ email: userResult.user.email, password });
    if (signInError || !session.session) return generic();
    return new Response(JSON.stringify({ access_token: session.session.access_token, refresh_token: session.session.refresh_token }), { status: 200, headers: h });
  } catch (error) {
    console.error('login-by-username server error', error);
    return new Response(JSON.stringify({ error: 'Błąd logowania. Spróbuj ponownie później.' }), { status: 500, headers: h });
  }
});
