import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Warehouse Management",
  description: "Warehouse asset requests, approvals, usage, returns, and history.",
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
