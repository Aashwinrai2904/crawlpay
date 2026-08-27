import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const interBody = Inter({ subsets: ["latin"], variable: "--font-inter" });
const interDisplay = Inter_Tight({ subsets: ["latin"], weight: ["500", "600"], variable: "--font-inter-tight" });

export const metadata: Metadata = {
  title: "Crawlpay Dashboard",
  description: "Publisher dashboard for Crawlpay",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${interBody.variable} ${interDisplay.variable}`}>
      <body>{children}</body>
    </html>
  );
}
