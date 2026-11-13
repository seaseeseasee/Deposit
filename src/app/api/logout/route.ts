import { logout } from '@/lib/auth.ts';
import { sameOrigin, see } from '@/lib/http.ts';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return new Response('Forbidden', { status: 403 });
  await logout();
  return see('/login');
}
