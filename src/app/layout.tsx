import { Viewport } from "next/dist/types";
import "./globals.css";
import Script from "next/script";

export const metadata = {
  title: "AR TV Viewer",
  description: "Augmented reality TV demo in Next.js",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <Script
          src="https://aframe.io/releases/1.5.0/aframe.min.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://cdn.jsdelivr.net/gh/AR-js-org/AR.js/aframe/build/aframe-ar.js"
          strategy="beforeInteractive"
        />
        <Script
          src="https://cdn.jsdelivr.net/npm/aframe-extras@6.1.1/dist/aframe-extras.min.js"
          strategy="beforeInteractive"
        />
      </head>
      <body className="bg-black text-white">{children}</body>
    </html>
  );
}
