import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClerkProvider } from "@/providers/convex-clerk-provider";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800", "900"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "VoIP CRM",
    template: "%s | VoIP CRM",
  },
  description: "Multi-tenant VoIP CRM with real-time calling dashboard",
  icons: {
    icon: [
      { url: "/globe.svg", type: "image/svg+xml" },
    ],
  },
  openGraph: {
    title: "VoIP CRM",
    description: "Multi-tenant VoIP CRM with real-time calling dashboard",
    type: "website",
    siteName: "VoIP CRM",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${inter.variable} ${geistMono.variable} font-sans antialiased`}
      >
        <ConvexClerkProvider>{children}</ConvexClerkProvider>
      </body>
    </html>
  );
}
