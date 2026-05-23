import type { Metadata, Viewport } from "next";
import { spaceGrotesk } from "@/theme/fonts";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Saadaa Creator Hub", template: "%s · Saadaa Creator Hub" },
  description: "Influencer management for Saadaa",
  applicationName: "Saadaa Creator Hub",
};

export const viewport: Viewport = {
  themeColor: "#FAF8F5",
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning className={spaceGrotesk.variable}>
      <body className="font-sans bg-bg-base text-text-primary min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
