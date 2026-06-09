import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Stock Management System",
  description: "Serialized asset stock management for Server and Network items.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

