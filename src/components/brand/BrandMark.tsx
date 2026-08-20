export interface BrandMarkProps {
  size?: number;
  className?: string;
}

export function BrandMark({ size = 18, className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M16 3h5v5" />
      <path d="M8 21H3v-5" />
      <path d="M21 8v5a8 8 0 0 1-13.5 5.5L3 15" />
      <path d="M3 16v-5a8 8 0 0 1 13.5-5.5L21 8" />
    </svg>
  );
}