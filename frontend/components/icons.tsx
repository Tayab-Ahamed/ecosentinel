import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function BaseIcon({ className, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      {children}
    </svg>
  );
}

export function DashboardIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="11" width="7" height="10" rx="1.5" />
      <rect x="3" y="13" width="7" height="8" rx="1.5" />
    </BaseIcon>
  );
}

export function AirIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 9c1.5-2.2 4.2-2.7 6.1-1.2 1.2.9 2.8 1 4 .3 1.4-.8 3.4-.6 4.9.9" />
      <path d="M3 13h13c2.2 0 4 1.3 5 3" />
      <path d="M5 17h8" />
    </BaseIcon>
  );
}

export function FireIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 3c2.1 2 3.6 4 3.6 6.4 0 1.8-1 3-2.1 4.1" />
      <path d="M10.3 9.7c-2.2 1.5-3.8 3.7-3.8 6.1A5.5 5.5 0 0 0 12 21a5.5 5.5 0 0 0 5.5-5.2c0-2.5-1.5-4.8-4.6-6.8" />
      <path d="M12 13.3c-1.4 1-2.2 2-2.2 3.3A2.2 2.2 0 0 0 12 18.8a2.2 2.2 0 0 0 2.2-2.2c0-1.2-.7-2.2-2.2-3.3Z" />
    </BaseIcon>
  );
}

export function WasteIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 7h16" />
      <path d="M9 3h6l1 2H8l1-2Z" />
      <path d="m6 7 1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </BaseIcon>
  );
}

export function MicIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11a6 6 0 0 0 12 0" />
      <path d="M12 17v4" />
      <path d="M9 21h6" />
    </BaseIcon>
  );
}

export function ForecastIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 17 9 12l3 3 7-7" />
      <path d="M19 8h-4" />
      <path d="M19 8v4" />
    </BaseIcon>
  );
}

export function LeafIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20 4c-8 0-13 4-13 10a5 5 0 0 0 5 5c6 0 8-5 8-15Z" />
      <path d="M7 17c2.5-2.5 5.7-4.4 10-6" />
    </BaseIcon>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 4 3 20h18L12 4Z" />
      <path d="M12 10v4" />
      <circle cx="12" cy="17" r="0.8" fill="currentColor" stroke="none" />
    </BaseIcon>
  );
}

export function RefreshIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M20 11a8 8 0 0 0-14.7-4" />
      <path d="M4 4v5h5" />
      <path d="M4 13a8 8 0 0 0 14.7 4" />
      <path d="M20 20v-5h-5" />
    </BaseIcon>
  );
}

export function CameraIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4 8h4l1.4-2h5.2L16 8h4v11H4Z" />
      <circle cx="12" cy="13.5" r="3.3" />
    </BaseIcon>
  );
}

export function UploadIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 20h16" />
    </BaseIcon>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M3 11.5 21 4l-6.8 16-2.5-6-8.9-2.5Z" />
    </BaseIcon>
  );
}

export function MapIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2Z" />
      <path d="M9 4v14" />
      <path d="M15 6v14" />
    </BaseIcon>
  );
}

export function PinIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M12 21s6-5.2 6-10a6 6 0 1 0-12 0c0 4.8 6 10 6 10Z" />
      <circle cx="12" cy="11" r="2.2" />
    </BaseIcon>
  );
}
