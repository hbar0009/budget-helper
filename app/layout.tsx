import type { Metadata } from "next";
import EnvBanner from "@/components/EnvBanner";
import { PROFILE } from "@/lib/config/paths";
import "./globals.css";

export const metadata: Metadata = {
  title: "budget-helper",
  description:
    "Categorize bank transactions and push them into a budget spreadsheet",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <EnvBanner profile={PROFILE} />
        {children}
      </body>
    </html>
  );
}
