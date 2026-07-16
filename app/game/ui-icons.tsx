export type UiIconName =
  | "extract"
  | "fabricate"
  | "defend"
  | "ore"
  | "ammo"
  | "city"
  | "pause"
  | "play"
  | "sound-on"
  | "sound-off"
  | "match"
  | "warning"
  | "jam";

export interface UiIconProps {
  name: UiIconName;
  label?: string;
  className?: string;
}

function accessibility(label?: string) {
  return label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);
}

export function UiIcon({ name, label, className }: UiIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
      data-ui-icon={name}
      {...accessibility(label)}
    >
      {name === "extract" && (
        <>
          <path d="m3.5 9 4-4h5l3 3-4 4h-5Z" />
          <path d="m11.5 12 3.2 3.2" />
          <path d="m14 16 2.1-2.1 4.4 6.6Z" fill="currentColor" stroke="none" />
          <path d="m15.4 15.1 3.1 3.1M17.1 16.8l1-1" />
        </>
      )}

      {name === "fabricate" && (
        <>
          <path d="M4 21V3h16v18M7 3v4h10V3" />
          <path d="M12 7v5" strokeWidth="3" />
          <path d="M7 12h10v3H7ZM6 18h12M8 21h8" />
        </>
      )}

      {name === "defend" && (
        <>
          <path d="M3.5 4.5 10 2l6.5 2.5v5.2c0 4.7-2.5 8.5-6.5 10.3-4-1.8-6.5-5.6-6.5-10.3Z" />
          <circle cx="10" cy="10" r="2.2" />
          <path d="m11.8 8.8 7.7-4.2 1.3 2.5-7.6 4.1M8 15h4l1.5 4H6.5Z" />
        </>
      )}

      {name === "ore" && (
        <>
          <path d="m7 3 10 1 4 7-5 9H7l-4-8Z" />
          <path d="m7 3 3 7-3 10M17 4l-7 6 6 10M3 12l7-2 11 1" />
        </>
      )}

      {name === "ammo" && (
        <>
          <path d="M7 8V5.5L9 3h6l2 2.5V8" />
          <path d="M6 8h12v13H6Z" />
          <path d="M9 11v7M12 11v7M15 11v7" />
        </>
      )}

      {name === "city" && (
        <>
          <path d="M2 21V9h4V6h4V3h4v3h4v3h4v12" />
          <path d="M2 21h20M8 21v-7l4-3 4 3v7" />
          <path d="M12 14v4" strokeWidth="2.5" />
        </>
      )}

      {name === "pause" && (
        <>
          <rect x="5" y="3" width="5" height="18" rx="1" fill="currentColor" stroke="none" />
          <rect x="14" y="3" width="5" height="18" rx="1" fill="currentColor" stroke="none" />
        </>
      )}

      {name === "play" && (
        <path d="m7 3 14 9L7 21Z" fill="currentColor" stroke="none" />
      )}

      {name === "sound-on" && (
        <>
          <path d="M3 9v6h4l5 4V5L7 9Z" />
          <path d="M15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14" />
        </>
      )}

      {name === "sound-off" && (
        <>
          <path d="M3 9v6h4l5 4V5L7 9Z" />
          <path d="m16 9 5 6M21 9l-5 6" />
        </>
      )}

      {name === "match" && (
        <>
          <path d="m6 3 4 4-4 4-4-4ZM18 13l4 4-4 4-4-4Z" />
          <path d="M10 7h3a5 5 0 0 1 5 5v1" />
          <path d="m15.5 11.5 2.5 2.5 2.5-2.5" />
        </>
      )}

      {name === "warning" && (
        <>
          <path d="M12 2.5 22 21H2Z" />
          <path d="M12 8v6" strokeWidth="2.4" />
          <circle cx="12" cy="17.5" r="1.2" fill="currentColor" stroke="none" />
        </>
      )}

      {name === "jam" && (
        <>
          <path d="M5 16a9 9 0 0 1 0-8M8 13a5 5 0 0 1 0-2M19 8a9 9 0 0 1 .8 6.2M16 11a5 5 0 0 1 .2 1.4" />
          <circle cx="12" cy="12" r="2" fill="currentColor" stroke="none" />
          <path d="M3 3 21 21" strokeWidth="2.6" />
        </>
      )}
    </svg>
  );
}
