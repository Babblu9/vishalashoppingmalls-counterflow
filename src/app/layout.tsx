import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Daily Counter Closing Management System",
  description: "Secure spreadsheet closing portal for Vishala Shopping Mall counter collections, bookkeeping, and audit logging.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
      </head>
      <body className="antialiased min-h-screen text-[#1A0A0A] bg-[#FDF6EE]" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
