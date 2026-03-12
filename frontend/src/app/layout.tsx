import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "InterviewBot - AI-Powered Interview Platform",
    template: "%s | InterviewBot",
  },
  description:
    "Streamline your hiring with AI-powered interviews. Automated screening, real-time scoring, and comprehensive candidate reports.",
  keywords: ["AI interview", "hiring platform", "automated screening", "interview bot", "recruitment"],
  authors: [{ name: "InterviewBot" }],
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://hire-with-giri.vercel.app",
    siteName: "InterviewBot",
    title: "InterviewBot - AI-Powered Interview Platform",
    description:
      "Streamline your hiring with AI-powered interviews. Automated screening, real-time scoring, and comprehensive candidate reports.",
  },
  twitter: {
    card: "summary_large_image",
    title: "InterviewBot - AI-Powered Interview Platform",
    description: "Streamline your hiring with AI-powered interviews.",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
