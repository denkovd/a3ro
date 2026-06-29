import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "A3RO",
  description: "A3RO — Built for the future.",
  openGraph: {
    title: "A3RO",
    description: "A3RO — Built for the future.",
    url: "https://a3ro.com.au",
    siteName: "A3RO",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
