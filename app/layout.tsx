import type { Metadata } from "next";
import "./globals.css";
import { AuthSessionProvider } from "@/components/providers/auth-session-provider";
import { PageBootLoader } from "@/components/page-boot-loader";

export const metadata: Metadata = {
  title: "MimicKit",
  description: "Behavioral transpiler for software systems. Extract architecture, intent, and executable plans from any codebase.",
  metadataBase: new URL("https://mimekit.vercel.app"),
  openGraph: {
    title: "MimicKit",
    description: "Behavioral transpiler for software systems. Extract architecture, intent, and executable plans from any codebase.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "MimicKit - Behavioral Transpiler"
      }
    ],
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "MimicKit",
    description: "Behavioral transpiler for software systems. Extract architecture, intent, and executable plans from any codebase.",
    images: ["/og-image.png"]
  }
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
