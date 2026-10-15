// The WreckVault mark: a vault door. lucide-react 0.292 has no vault icon, so it is drawn here.
export default function VaultMark({ size = 16 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="12" cy="12" r="3.5" />
      <path d="M12 8.5V7M12 17v-1.5M15.5 12H17M7 12h1.5" />
    </svg>
  );
}
