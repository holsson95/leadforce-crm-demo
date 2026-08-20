import { redirect } from 'next/navigation'

// Public demo build: real signup is disabled so a visitor can never create a
// real account or trigger a real invite email. Everyone goes through the
// single "View Demo" entry point on the sign-in page instead.
export default function SignUpPage() {
  redirect('/sign-in')
}
