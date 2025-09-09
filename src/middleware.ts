import { NextResponse } from 'next/server'
import { getToken } from 'next-auth/jwt'
import { NextRequestWithAuth } from 'next-auth/middleware'

// Helper: extract first path segment as potential slug
function getPathSlug(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean)
  if (parts.length === 0) return null
  const first = parts[0]
  // Exclude known roots
  const excluded = new Set(['auth', 'api', 'assets', 'public', '_next', 'doctor', 'admin'])
  if (excluded.has(first)) return null
  return first
}

// Helper: resolve slug from subdomain (slug.example.com)
function getHostSlug(host?: string | null): string | null {
  if (!host) return null
  const base = process.env.APP_BASE_DOMAIN // e.g., app.example.com or example.com
  if (!base) return null
  const lowerHost = host.toLowerCase()
  const lowerBase = base.toLowerCase()
  if (!lowerHost.endsWith(lowerBase)) return null
  const sub = lowerHost.slice(0, -lowerBase.length).replace(/\.$/, '') // strip trailing dot
  if (!sub || sub === 'www') return null
  return sub
}

export default async function middleware(request: NextRequestWithAuth) {
  const token = await getToken({ req: request })
  const isAuthenticated = !!token
  const url = request.nextUrl
  const { pathname } = url
  const host = request.headers.get('host')

  // Subdomain tenancy: if host is <slug>.<APP_BASE_DOMAIN>, rewrite to /<slug><pathname>
  // This preserves our existing path-based routing (e.g., /[slug]/login) without changing pages.
  // Safety guards: do not rewrite API or static assets, and avoid loops if path already starts with slug.
  try {
    const slugFromHost = getHostSlug(host)
    if (slugFromHost) {
      const isApi = pathname.startsWith('/api')
      const isNext = pathname.startsWith('/_next')
      const isStatic = /\.(?:ico|png|jpg|jpeg|svg|gif|webp|mp3|json|txt|xml|css|js|map)$/i.test(pathname)
      if (!isApi && !isNext && !isStatic) {
        const firstSeg = getPathSlug(pathname)
        // Only rewrite if first path segment is absent or different from the host slug
        if (firstSeg !== slugFromHost) {
          const rewriteUrl = new URL(`/${slugFromHost}${pathname}${url.search}`, request.url)
          return NextResponse.rewrite(rewriteUrl)
        }
      }
    }
  } catch {
    // Fail open: if any error happens, continue normally
  }

  // Public API allowlist: do NOT require auth for doctor-link resolution
  if (pathname.startsWith('/api/v2/doctor-link')) {
    return NextResponse.next()
  }

  // Lista de rotas protegidas para pacientes
  const patientRoutes = [
    '/patient/protocols',
    '/patient/checklist',
    '/patient/oneweek', 
    '/patient/circles',
    '/patient/tasks',
    '/patient/thoughts',
    '/patient/checkpoints',
    '/patient/timeblocking',
    '/patient/profile',
    '/patient/courses',
    '/patient/ai-chat',
    '/patient/referrals',
    '/doctor-info'
  ]

  // Lista de rotas protegidas para médicos
  const doctorRoutes = [
    '/doctor',
    '/clinic'
  ]

  // Lista de rotas protegidas para administradores
  const adminRoutes = [
    '/admin'
  ]

  // Lista de rotas de autenticação
  const authRoutes = ['/auth/signin', '/auth/register']
  
  // Use startsWith to avoid substring collisions (e.g., '/doctor-link' triggering '/doctor')
  const isPatientRoute = patientRoutes.some(route => pathname.startsWith(route))
  const isDoctorRoute = doctorRoutes.some(route => pathname.startsWith(route))
  const isAdminRoute = adminRoutes.some(route => pathname.startsWith(route))
  
  const isProtectedRoute = isPatientRoute || isDoctorRoute || isAdminRoute
  
  const isAuthRoute = authRoutes.some(route => 
    request.nextUrl.pathname.startsWith(route)
  )

  // No canonicalization or subdomain normalization to avoid loops

  // Redirect clinic-specific login URLs to standard login
  if (pathname.startsWith('/login/')) {
    // Preserve slug if present: /login/{slug} -> /auth/signin?doctor={slug}
    const parts = pathname.split('/').filter(Boolean)
    const slug = parts[1]
    const dest = new URL('/auth/signin', request.url)
    if (slug) dest.searchParams.set('doctor', slug)
    return NextResponse.redirect(dest)
  }

  // Se for uma rota protegida e o usuário não está autenticado
  if (isProtectedRoute && !isAuthenticated) {
    const redirectUrl = new URL('/auth/signin', request.url)
    redirectUrl.searchParams.set('callbackUrl', request.url)
    return NextResponse.redirect(redirectUrl)
  }

  // Se for uma rota de auth e o usuário já está autenticado
  if (isAuthRoute && isAuthenticated) {
    return NextResponse.redirect(new URL('/', request.url))
  }

  // Legacy path handling (removed slugging for doctor): keep '/doctor/*' global. No automatic slug injection.

  // Note: Detailed role/tenant checks are done in route handlers (server runtime) to avoid DB in Edge.

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    // Legacy roots
    '/protocols/:path*',
    '/checklist/:path*',
    '/oneweek/:path*',
    '/circles/:path*',
    '/tasks/:path*',
    '/thoughts/:path*',
    '/checkpoints/:path*',
    '/timeblocking/:path*',
    '/profile/:path*',
    '/doctor/:path*',
    '/admin/:path*',
    '/auth/:path*',
    '/patient/:path*',
    '/courses/:path*',
    '/clinic/:path*',
    '/doctor-info/:path*',
    '/login/:path*',
    // Slugged roots (first segment as slug)
    '/:path*/doctor/:path*',
    '/:path*/patient/:path*',
    '/api/:path*'
  ]
}