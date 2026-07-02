import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A3RO — Quiet machines. Loud results.",
  description: "A3RO is a Sydney software & automation studio. Custom software, AI automation, and rapid MVPs — systems that keep working long after launch.",
  openGraph: {
    title: "A3RO — Quiet machines. Loud results.",
    description: "Custom software, AI automation, and rapid MVPs — systems that keep working long after launch.",
    url: "https://a3ro.com.au",
    siteName: "A3RO",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}

