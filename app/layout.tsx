import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MimicKit",
  description: "Behavioral transpiler for software systems"
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
