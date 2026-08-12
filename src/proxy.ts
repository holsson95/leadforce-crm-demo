import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/invite(.*)',
  '/api/webhooks(.*)',
])

const isPortalRoute    = createRouteMatcher(['/client-portal(.*)'])
const isDashboardRoute = createRouteMatcher([
  '/',
  '/campaigns(.*)',
  '/contacts(.*)',
  '/calling(.*)',
  '/pipeline(.*)',
  '/schedule(.*)',
  '/reports(.*)',
  '/imports(.*)',
  '/clients(.*)',
  '/settings(.*)',
])

export default clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return

  await auth.protect()

  const { sessionClaims } = await auth()
  const role = (sessionClaims?.metadata as { role?: string } | undefined)?.role

  if (role === 'client' && isDashboardRoute(request)) {
    return NextResponse.redirect(new URL('/client-portal', request.url))
  }
  if (role && role !== 'client' && isPortalRoute(request)) {
    return NextResponse.redirect(new URL('/', request.url))
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
