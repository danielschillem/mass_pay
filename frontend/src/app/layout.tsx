import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MynaPay BF | Plateforme de virement en masse",
  description: "Disbursement mobile money B2B · Orange Money + Moov Africa · Burkina Faso",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
