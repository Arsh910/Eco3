const PATHS = {
  send: <path d="M4.5 12 20 4l-8 15.5-2-6.5-5.5-1Z" />,
  upload: (
    <>
      <path d="M12 3v12" />
      <path d="m7 8 5-5 5 5" />
      <path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M20 16v3a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-3" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
    </>
  ),
  message: <path d="M21 14a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2Z" />,
  lock: (
    <>
      <rect x="4" y="10" width="16" height="10" rx="1" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </>
  ),
  plug: (
    <>
      <path d="M9 3v6M15 3v6" />
      <path d="M5 9h14v3a7 7 0 0 1-14 0V9Z" />
      <path d="M12 19v3" />
    </>
  ),
  chevron: <path d="m6 9 6 6 6-6" />,
};

export function Icon({ name, size = 16, className }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}
