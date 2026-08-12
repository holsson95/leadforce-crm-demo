import { SignIn } from '@clerk/nextjs'

const clerkAppearance = {
  variables: {
    colorBackground: '#ffffff',
    colorInputBackground: '#f8fafc',
    colorInputText: '#0f172a',
    colorText: '#0f172a',
    colorTextSecondary: '#64748b',
    colorPrimary: '#f59e0b',
    colorDanger: '#ef4444',
    borderRadius: '0.75rem',
    fontFamily: 'Outfit, sans-serif',
  },
  elements: {
    rootBox: { width: '100%', display: 'flex', justifyContent: 'center' },
    card: {
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      boxShadow: '0 4px 24px 0 rgba(0,0,0,0.08)',
      borderRadius: '1.5rem',
    },
    headerTitle: { color: '#0f172a', fontWeight: '600' },
    headerSubtitle: { color: '#64748b' },
    formFieldLabel: { color: '#475569', fontSize: '0.75rem' },
    formFieldInput: {
      background: '#f8fafc',
      border: '1px solid #e2e8f0',
      color: '#0f172a',
      borderRadius: '0.75rem',
    },
    formButtonPrimary: {
      background: 'linear-gradient(to right, #fbbf24, #f59e0b)',
      color: '#000000',
      fontWeight: '600',
      borderRadius: '0.75rem',
      boxShadow: '0 4px 12px rgba(245,158,11,0.3)',
    },
    footerActionLink: { color: '#f59e0b' },
    footerActionText: { color: '#64748b' },
    footer: { background: '#f8fafc', borderTop: '1px solid #e2e8f0', borderRadius: '0 0 1.5rem 1.5rem' },
    dividerLine: { background: '#e2e8f0' },
    dividerText: { color: '#94a3b8' },
    socialButtonsBlockButton: {
      background: '#ffffff',
      border: '1px solid #e2e8f0',
      borderRadius: '0.75rem',
    },
    socialButtonsBlockButtonText: { color: '#334155' },
    identityPreviewText: { color: '#334155' },
    identityPreviewEditButton: { color: '#f59e0b' },
  },
}

export default function SignInPage() {
  return <SignIn appearance={clerkAppearance} />
}
