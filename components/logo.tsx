// The Codewise mark: two hand-drawn code brackets around a small spark.
// Drawn as wobbly paths (not perfect geometry) so it reads as made by hand.
export function LogoMark({ size = 28, title }: { size?: number; title?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <path
        d="M10.5 5.2c-2.6.3-3.4 1.6-3.3 4 .1 2.1.4 3.9-1.9 5.4-.5.3-.5 1 0 1.3 2.4 1.5 2 3.4 1.9 5.6-.1 2.3.8 3.6 3.4 4"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M21.6 5.3c2.5.4 3.3 1.7 3.2 4-.1 2.1-.5 3.8 1.9 5.3.5.3.5 1 0 1.3-2.3 1.6-2 3.5-1.9 5.6.1 2.3-.8 3.5-3.3 4"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M16.1 9.6c.3 2.6 1.3 4.1 3.9 4.9-2.6.9-3.6 2.3-3.9 5.1-.4-2.7-1.4-4.2-4-5 2.6-.8 3.7-2.3 4-5Z"
        fill="currentColor"
        stroke="currentColor"
        strokeWidth="0.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}
