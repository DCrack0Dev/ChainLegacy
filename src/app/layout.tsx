import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { Web3Provider } from "@/components/auth/Web3Provider";

const inter = { className: "font-sans antialiased" };

export const metadata: Metadata = {
  title: "ChainLegacy | Secure Crypto Inheritance",
  description: "A secure web application for crypto inheritance with a dead man's switch logic.",
  icons: {
    icon: '/icon.png',
    shortcut: '/icon.png',
    apple: '/icon.png',
  },
};

// Main layout for ChainLegacy
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/icon.png" sizes="any" />
        <link rel="apple-touch-icon" href="/icon.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.addEventListener('error', (event) => {
                if (event.message && event.message.includes('ChunkLoadError')) {
                  window.location.reload();
                }
              }, true);
            `,
          }}
        />
      </head>
      <body className={`${inter.className} min-h-screen bg-background text-foreground`}>
        <Web3Provider>
          <AuthProvider>
            {children}
          </AuthProvider>
        </Web3Provider>
      </body>
    </html>
  );
}
