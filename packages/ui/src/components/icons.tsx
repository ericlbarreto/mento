import type { ComponentPropsWithRef, ReactNode } from "react";

// Inline icons in the Lucide style (24px grid, 2px round stroke, currentColor). No icon font, no dependency.
// Decorative by default (aria-hidden); size them with CSS (`size-5`) or the parent's `[&_svg]:size-*`.

export type IconProps = Omit<ComponentPropsWithRef<"svg">, "children">;

function make(name: string, paths: ReactNode) {
  function Icon({ className, ...rest }: IconProps) {
    return (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        focusable="false"
        className={className ?? "size-5"}
        {...rest}
      >
        {paths}
      </svg>
    );
  }
  Icon.displayName = name;
  return Icon;
}

export const IconArrowLeft = make("IconArrowLeft", <path d="M19 12H5M12 19l-7-7 7-7" />);
export const IconArrowRight = make("IconArrowRight", <path d="M5 12h14M12 5l7 7-7 7" />);
export const IconChevronLeft = make("IconChevronLeft", <path d="m15 18-6-6 6-6" />);
export const IconChevronRight = make("IconChevronRight", <path d="m9 18 6-6-6-6" />);
export const IconX = make("IconX", <path d="M18 6 6 18M6 6l12 12" />);
export const IconPlus = make("IconPlus", <path d="M12 5v14M5 12h14" />);
export const IconCheck = make("IconCheck", <path d="M20 6 9 17l-5-5" />);
export const IconMoreVertical = make(
  "IconMoreVertical",
  <>
    <circle cx="12" cy="5" r="1" />
    <circle cx="12" cy="12" r="1" />
    <circle cx="12" cy="19" r="1" />
  </>,
);
export const IconPower = make("IconPower", <path d="M12 2v10M18.4 6.6a9 9 0 1 1-12.77.04" />);
export const IconPause = make(
  "IconPause",
  <>
    <rect x="6" y="4" width="4" height="16" rx="1" />
    <rect x="14" y="4" width="4" height="16" rx="1" />
  </>,
);
export const IconPlay = make("IconPlay", <path d="M6 3.5v17a.5.5 0 0 0 .77.42l13.2-8.5a.5.5 0 0 0 0-.84L6.77 3.08A.5.5 0 0 0 6 3.5Z" />);
export const IconRotateCcw = make(
  "IconRotateCcw",
  <>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
  </>,
);
export const IconHistory = make(
  "IconHistory",
  <>
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5M12 7v5l4 2" />
  </>,
);
export const IconSliders = make(
  "IconSliders",
  <path d="M21 4h-7M10 4H3M21 12h-9M8 12H3M21 20h-5M12 20H3M14 2v4M8 10v4M16 18v4" />,
);
export const IconHelpCircle = make(
  "IconHelpCircle",
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01" />
  </>,
);
export const IconInfo = make(
  "IconInfo",
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 16v-4M12 8h.01" />
  </>,
);
export const IconCheckCircle = make(
  "IconCheckCircle",
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" />
  </>,
);
export const IconCircle = make("IconCircle", <circle cx="12" cy="12" r="9" />);
export const IconClock = make(
  "IconClock",
  <>
    <circle cx="12" cy="12" r="10" />
    <path d="M12 6v6l4 2" />
  </>,
);
export const IconMessage = make("IconMessage", <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />);
export const IconSearch = make(
  "IconSearch",
  <>
    <circle cx="11" cy="11" r="8" />
    <path d="m21 21-4.3-4.3" />
  </>,
);
export const IconKeyboard = make(
  "IconKeyboard",
  <>
    <rect x="2" y="5" width="20" height="14" rx="2" />
    <path d="M6 9h.01M10 9h.01M14 9h.01M18 9h.01M6 13h.01M18 13h.01M8 16h8" />
  </>,
);
export const IconVolume = make(
  "IconVolume",
  <>
    <path d="M11 5 6 9H2v6h4l5 4V5Z" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
  </>,
);
export const IconCaptions = make(
  "IconCaptions",
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7 15h4M15 15h2M7 11h2M13 11h4" />
  </>,
);
export const IconMic = make(
  "IconMic",
  <>
    <rect x="9" y="2" width="6" height="12" rx="3" />
    <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
  </>,
);
export const IconBookOpen = make(
  "IconBookOpen",
  <path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z" />,
);
export const IconBook = make(
  "IconBook",
  <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />,
);
export const IconFileText = make(
  "IconFileText",
  <>
    <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
    <path d="M14 2v5h6M16 13H8M16 17H8M10 9H8" />
  </>,
);
export const IconLandmark = make(
  "IconLandmark",
  <path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2l8 5H4z" />,
);
export const IconRuler = make(
  "IconRuler",
  <>
    <path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z" />
    <path d="m14.5 12.5 2-2M11.5 9.5l2-2M8.5 6.5l2-2M17.5 15.5l2-2" />
  </>,
);
export const IconLeaf = make(
  "IconLeaf",
  <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10ZM2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />,
);
export const IconZap = make(
  "IconZap",
  <path d="M13 2 3 14h9l-1 8 10-12h-9z" />,
);
export const IconLightbulb = make(
  "IconLightbulb",
  <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5M9 18h6M10 22h4" />,
);
export const IconPencil = make(
  "IconPencil",
  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />,
);
export const IconSparkles = make(
  "IconSparkles",
  <path d="M9.94 14.06 8 20l-1.94-5.94L0 12l6.06-1.94L8 4l1.94 6.06L16 12zM19 2v4M21 4h-4M19 16v4M21 18h-4" />,
);
export const IconEye = make(
  "IconEye",
  <>
    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </>,
);
