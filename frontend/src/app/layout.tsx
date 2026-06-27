import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Antigravity PDF - Edit Any PDF Using AI",
  description: "Upload your PDF, tell the AI exactly what you want, review the changes, manually edit anything if needed, download your finished PDF, and leave. Complete privacy-first, session-only PDF editor.",
  keywords: ["PDF Editor", "AI PDF Editor", "Edit PDF with AI", "Private PDF Editor", "No Login PDF Editor", "OCR PDF", "Rotate PDF", "Merge PDF"],
  authors: [{ name: "Antigravity Team" }],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-dark-bg text-foreground font-sans">
        {children}
      </body>
    </html>
  );
}
