// Lucide icon with the app's default size and stroke; decorative unless a label is given.
export default function Icon({ icon: Glyph, size = 16, label, className = '', ...rest }) {
  if (!Glyph) return null;
  return (
    <Glyph
      size={size}
      strokeWidth={1.75}
      className={`i ${className}`}
      aria-hidden={label ? undefined : 'true'}
      aria-label={label}
      role={label ? 'img' : undefined}
      focusable="false"
      {...rest}
    />
  );
}
