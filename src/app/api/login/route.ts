import { login } from '@/lib/auth.ts';
import { sameOrigin, see } from '@/lib/http.ts';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  const f = await req.formData();
  const r = await login(String(f.get('username') ?? ''), String(f.get('password') ?? ''));
  return see(r === 'ok' ? '/staff' : `/login?error=${r}`);
}
