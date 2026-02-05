import type { Metadata } from "next";
import "./globals.css";
import { AuthSessionProvider } from "@/components/providers/auth-session-provider";
import { PageBootLoader } from "@/components/page-boot-loader";

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
      <body>
        <AuthSessionProvider>
          <PageBootLoader />
          <div className="mk-page-root">{children}</div>
        </AuthSessionProvider>
      </body>
    </html>
  );
}
