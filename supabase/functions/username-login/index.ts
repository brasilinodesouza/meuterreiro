import { createUsernameLogin } from '../_shared/username-login.ts';

// Chaves administrativas existem somente no ambiente da Edge Function.
Deno.serve(createUsernameLogin({
  url: Deno.env.get('SUPABASE_URL') ?? '',
  publicKey: Deno.env.get('SUPABASE_ANON_KEY') ?? '',
  serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  origins: (Deno.env.get('APP_ALLOWED_ORIGINS') ?? '').split(',').map(value=>value.trim()).filter(Boolean),
}));
