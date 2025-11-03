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
  const base = process.env.APP_BASE_DOMAIN || process.env.NEXT_PUBLIC_APP_BASE_DOMAIN // e.g., example.com or 127.0.0.1.nip.io
  if (!base) return null
  // Remove port if present (e.g., ":3000") to allow local dev like 127.0.0.1.nip.io
  const lowerHostRaw = host.toLowerCase()
  const lowerHost = lowerHostRaw.split(':')[0]
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
  // Prefer forwarded host (prod behind proxy/CDN), then request URL hostname, then Host header
  const host = request.headers.get('x-forwarded-host') || request.nextUrl.host || request.headers.get('host')

  // Subdomain tenancy: if host is <slug>.<APP_BASE_DOMAIN>, rewrite to /<slug><pathname>
  // This preserves our existing path-based routing (e.g., /[slug]/login) without changing pages.
  // Safety guards: do not rewrite API or static assets, and avoid loops if path already starts with slug.
  try {
    const slugFromHost = getHostSlug(host)
    if (slugFromHost) {
      const isApi = pathname.startsWith('/api')
      const isNext = pathname.startsWith('/_next')
      const isStatic = /\.(?:ico|png|jpg|jpeg|svg|gif|webp|mp3|json|txt|xml|css|js|map)$/i.test(pathname)
      // Do not rewrite clinic routes — keep /clinic working as-is even on subdomains
      const isClinicRoute = pathname.startsWith('/clinic')
      if (isClinicRoute) {
        return NextResponse.next()
      }

      if (!isApi && !isNext && !isStatic) {
        const firstSeg = getPathSlug(pathname)
        const parts = pathname.split('/').filter(Boolean)
        const secondSeg = parts.length > 1 ? parts[1] : null

        // Canonicalize: if URL is /{slug}/forgot-password, redirect to clean /forgot-password
        if (firstSeg === slugFromHost && secondSeg === 'forgot-password') {
          const dest = new URL(`/forgot-password${url.search}`, request.url)
          return NextResponse.redirect(dest)
        }
        // Canonicalize: if URL is /{slug}/register, redirect to clean /register
        if (firstSeg === slugFromHost && secondSeg === 'register') {
          const dest = new URL(`/register${url.search}`, request.url)
          return NextResponse.redirect(dest)
        }
        // Keep clean URLs visible, but rewrite internally to the slugged routes so pages resolve
        if (firstSeg === 'forgot-password') {
          const rewriteUrl = new URL(`/${slugFromHost}/forgot-password${url.search}`, request.url)
          return NextResponse.rewrite(rewriteUrl)
        }
        if (firstSeg === 'register') {
          const rewriteUrl = new URL(`/${slugFromHost}/register${url.search}`, request.url)
          return NextResponse.rewrite(rewriteUrl)
        }
        if (firstSeg === 'login') {
          const rewriteUrl = new URL(`/${slugFromHost}/login${url.search}`, request.url)
          return NextResponse.rewrite(rewriteUrl)
        }
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

  // Canonical redirect ONLY for the exact /clinic root. Keep /clinic/* subpaths under /clinic.
  if (pathname === '/clinic') {
    return NextResponse.redirect(new URL('/doctor/clinic', request.url))
  }

  // Public API allowlist: do NOT require auth for doctor-link resolution
  if (pathname.startsWith('/api/v2/doctor-link')) {
    return NextResponse.next()
  }

  // Temporary route transition: redirect legacy doctor products to business products
  if (pathname.startsWith('/doctor/products')) {
    const destPath = pathname.replace(/^\/doctor\/(products.*)$/i, '/business/$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
  }

  // Temporary route transition: dashboard and patients
  if (pathname.startsWith('/doctor/dashboard')) {
    const destPath = pathname.replace(/^\/doctor\/dashboard(.*)$/i, '/business/dashboard$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
  }
  if (pathname.startsWith('/doctor/patients')) {
    const destPath = pathname.replace(/^\/doctor\/patients(.*)$/i, '/business/clients$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
  }
  if (pathname.startsWith('/doctor/clinic')) {
    const destPath = pathname.replace(/^\/doctor\/clinic(.*)$/i, '/business/clinic$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
  }
  if (pathname.startsWith('/doctor/purchases')) {
    const destPath = pathname.replace(/^\/doctor\/purchases(.*)$/i, '/business/payments$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
  }
  // Canonicalize old business purchases path
  if (pathname.startsWith('/business/purchases')) {
    const destPath = pathname.replace(/^\/business\/purchases(.*)$/i, '/business/payments$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
  }
  if (pathname.startsWith('/doctor/referrals')) {
    const destPath = pathname.replace(/^\/doctor\/referrals(.*)$/i, '/business/referrals$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
  }
  if (pathname.startsWith('/doctor/coupon-templates')) {
    const destPath = pathname.replace(/^\/doctor\/coupon-templates(.*)$/i, '/business/coupon-templates$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
  }
  if (pathname.startsWith('/doctor/rewards')) {
    const destPath = pathname.replace(/^\/doctor\/rewards(.*)$/i, '/business/rewards$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
  }
  if (pathname.startsWith('/doctor/integrations')) {
    const destPath = pathname.replace(/^\/doctor\/integrations(.*)$/i, '/business/integrations$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
  }
  if (pathname.startsWith('/doctor/events')) {
    const destPath = pathname.replace(/^\/doctor\/events(.*)$/i, '/business/events$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
  }
  if (pathname.startsWith('/doctor/broadcast')) {
    const destPath = pathname.replace(/^\/doctor\/broadcast(.*)$/i, '/business/broadcast$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
  }
  if (pathname.startsWith('/doctor/automation')) {
    const destPath = pathname.replace(/^\/doctor\/automation(.*)$/i, '/business/automation$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
  }
  if (pathname.startsWith('/doctor/profile')) {
    const destPath = pathname.replace(/^\/doctor\/profile(.*)$/i, '/business/profile$1')
    return NextResponse.redirect(new URL(destPath + url.search, request.url))
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
    '/clinic',
    '/business'
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

  // Redirect root to login when unauthenticated
  if (pathname === '/' && !isAuthenticated) {
    const redirectUrl = new URL('/auth/signin', request.url)
    redirectUrl.searchParams.set('callbackUrl', request.url)
    return NextResponse.redirect(redirectUrl)
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
    '/business/:path*',
    '/admin/:path*',
    '/auth/:path*',
    '/patient/:path*',
    '/courses/:path*',
    '/clinic/:path*',
    '/doctor-info/:path*',
    '/login/:path*',
    '/register',
    '/forgot-password',
    // Slugged roots (first segment as slug)
    '/:path*/doctor/:path*',
    '/:path*/patient/:path*',
    '/api/:path*'
  ]
}