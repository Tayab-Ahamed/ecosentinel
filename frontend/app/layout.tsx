import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EcoSentinel | Environmental Intelligence Platform",
  manifest: "/manifest.json",
  description:
    "Full-stack environmental monitoring: real-time air quality, wildfire maps, AI waste analysis, voice assistant, and PM2.5 forecasting.",
  keywords: [
    "air quality",
    "environmental monitoring",
    "wildfire tracking",
    "waste classification",
    "PM2.5 forecast",
    "FastAPI",
    "Next.js",
    "EcoSentinel",
  ],
  authors: [{ name: "EcoSentinel" }],
  openGraph: {
    title: "EcoSentinel | Environmental Intelligence Platform",
    description:
      "Real-time air quality, fire intelligence, AI waste scanning, and pollution forecasting.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "EcoSentinel | Environmental Intelligence Platform",
    description: "Real-time environmental intelligence powered by satellite and sensor data.",
  },
};

export const viewport: Viewport = {
  themeColor: "#080f1c",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <meta name="color-scheme" content="dark" />
      </head>
      <body>{children}</body>
    </html>
  );
}
