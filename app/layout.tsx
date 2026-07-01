import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A3RO — Built Different",
  description: "A3RO is a Sydney tech & automation studio. Custom software, AI automation, and products engineered to be sharp, fast, and built to last.",
  openGraph: {
    title: "A3RO — Built Different",
    description: "Custom software, AI automation, and products engineered to be sharp, fast, and built to last.",
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
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Instrument+Serif:ital@0;1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
