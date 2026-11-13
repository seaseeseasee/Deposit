/** CSRF guard for cookie-authenticated POSTs: a present Origin must match the Host the client used. */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return true; // same-origin form posts from old clients; SameSite=Lax cookies still apply
  try {
    return new URL(origin).host === req.headers.get('host');
  } catch {
    return false;
  }
}

/** 303 redirect with a relative Location, so it works behind any port mapping or proxy. */
export function see(location: string): Response {
  return new Response(null, { status: 303, headers: { Location: location } });
}
