import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hi Asuka",
  description: "Cute travel planner for Asuka"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-blush">{children}</body>
    </html>
  );
}
