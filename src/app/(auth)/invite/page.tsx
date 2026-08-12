import { SignUp } from '@clerk/nextjs'

const clerkAppearance = {
  variables: {
    colorBackground: '#161c26',
    colorInputBackground: 'rgba(255,255,255,0.05)',
    colorInputText: '#e2e8f0',
    colorText: '#e2e8f0',
    colorTextSecondary: '#94a3b8',
    colorPrimary: '#fbbf24',
    colorDanger: '#ef4444',
    borderRadius: '0.75rem',
    fontFamily: 'Inter, sans-serif',
  },
  elements: {
    rootBox: 'w-full',
    card: 'glass-panel rounded-3xl !shadow-none',
    headerTitle: 'text-[var(--text-primary)] font-semibold',
    headerSubtitle: 'text-[var(--text-secondary)]',
    formFieldInput: 'bg-[var(--panel-border)] border border-[var(--panel-border)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] rounded-xl focus:border-[var(--lf-accent)]/50',
    formButtonPrimary: 'bg-gradient-to-r from-[var(--lf-accent)] to-amber-600 text-black font-semibold rounded-xl shadow-xl hover:opacity-90',
    footerActionLink: 'text-[var(--lf-accent)] hover:opacity-80',
    formFieldLabel: 'text-[var(--text-secondary)] text-xs',
  },
}

interface InvitePageProps {
  searchParams: Promise<{ role?: string; tenantId?: string }>
}

export default async function InvitePage({ searchParams }: InvitePageProps) {
  const params = await searchParams
  return (
    <div className="w-full max-w-md">
      {params.role && (
        <p className="text-center text-sm text-[var(--text-secondary)] mb-6">
          You&apos;ve been invited as a{' '}
          <span className="text-[var(--lf-accent)] font-medium">{params.role}</span>
        </p>
      )}
      <SignUp
        appearance={clerkAppearance}
        unsafeMetadata={{
          role: params.role ?? 'sdr',
          tenantId: params.tenantId ?? null,
        }}
      />
    </div>
  )
}
