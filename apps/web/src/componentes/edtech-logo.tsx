type EdtechLogoProps = {
  showName?: boolean
  compact?: boolean
  className?: string
}

const EdtechLogo = ({
  showName = true,
  compact = false,
  className = '',
}: EdtechLogoProps): JSX.Element => (
  <span
    className={`edtech-logo ${compact ? 'is-compact' : ''} ${className}`.trim()}
    aria-label="EdTech"
  >
    <svg className="edtech-logo-mark" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="5" y="5" width="17" height="17" rx="7" fill="#4285F4" />
      <rect x="26" y="5" width="17" height="17" rx="7" fill="#EA4335" />
      <rect x="5" y="26" width="17" height="17" rx="7" fill="#FBBC04" />
      <rect x="26" y="26" width="17" height="17" rx="7" fill="#34A853" />
      <path d="M16 14h16v5H21v5h9v5h-9v5h11v5H16V14Z" fill="#fff" />
    </svg>
    {showName && (
      <span className="edtech-logo-name">
        <b>Ed</b>Tech
      </span>
    )}
  </span>
)

export default EdtechLogo
