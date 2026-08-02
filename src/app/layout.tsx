import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Concordia College — Management Portal",
  description: "Concordia College management portal for administration, staff, teachers, and students. Admissions, attendance, fees, academics, HR, finance, library, transport & more — all in one place.",
  keywords: ["Concordia College", "School Management", "Education Portal", "Admissions", "Attendance", "Fees", "Academics", "ERP"],
  authors: [{ name: "Concordia College" }],
  icons: {
    icon: "/concordia-logo.png",
  },
  openGraph: {
    title: "Concordia College — Management Portal",
    description: "Manage your entire institution from a single platform.",
    siteName: "Concordia College",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Concordia College — Management Portal",
    description: "Manage your entire institution from a single platform.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
