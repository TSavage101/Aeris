import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Aeris | Commerce-ready storefronts for African merchants",
  description: "Launch a polished storefront with payments, orders, payouts, and merchant operations in minutes."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
