export function doctorPath(slug: string, ...segments: Array<string | number>): string {
  const path = segments
    .map(s => String(s).replace(/^\/+|\/+$|/g, ''))
    .filter(Boolean)
    .join('/');
  return `/${slug}${path ? '/' + path : ''}`;
}

export function apiPath(slug: string, ...segments: Array<string | number>): string {
  const base = doctorPath(slug, 'api');
  const rest = segments
    .map(s => String(s).replace(/^\/+|\/+$|/g, ''))
    .filter(Boolean)
    .join('/');
  return `${base}${rest ? '/' + rest : ''}`;
}

export function withQuery(url: string, params?: Record<string, string | number | boolean | undefined | null>): string {
  if (!params) return url;
  const u = new URL(url, 'http://localhost');
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    u.searchParams.set(k, String(v));
  }
  // remove base
  return u.pathname + (u.search || '');
}
