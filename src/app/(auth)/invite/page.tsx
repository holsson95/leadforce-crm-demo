import { redirect } from 'next/navigation'

// Public demo build: invites would let a visitor sign up as an arbitrary role
// with real metadata. Disabled for the demo — route everyone to the single
// "View Demo" entry point instead.
export default function InvitePage() {
  redirect('/sign-in')
}
