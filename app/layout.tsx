import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jobify Analytics",
  description: "Ask natural-language questions on Mixpanel data",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
