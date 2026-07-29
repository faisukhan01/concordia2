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
  title: "Concordia College — Portal",
  description: "Concordia College portal for students, teachers, parents, and staff. Admissions, attendance, fees, academics, results, timetable & more — all in one place.",
  keywords: ["Concordia College", "School Management", "Education Portal", "Admissions", "Attendance", "Fees", "Academics", "ERP"],
  authors: [{ name: "Concordia College" }],
  icons: {
    icon: "/concordia-logo.png",
  },
  openGraph: {
    title: "Concordia College — Portal",
    description: "Your campus, one tap away. For students, teachers, parents, and staff.",
    siteName: "Concordia College",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Concordia College — Portal",
    description: "Your campus, one tap away. For students, teachers, parents, and staff.",
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
