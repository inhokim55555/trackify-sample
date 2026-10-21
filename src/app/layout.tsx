import type { Metadata } from "next";

import "./globals.css";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Trackify",
  description: "Campaign management and tracked short-form video metrics.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" >
      <body className="font-sans">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
