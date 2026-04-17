import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI code reviewers · live",
  description: "A pool of autonomous OpenHands agents reviewing pull requests. Wake on webhook, sleep otherwise.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
