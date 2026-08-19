import type { Metadata, Viewport } from "next";
import { Fredoka } from "next/font/google";
import { GameProvider } from "./providers";
import "./globals.css";

const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["500", "600", "700"],
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Cards Against Friends",
  description: "Jogo de cartas multiplayer estilo Cards Against Humanity, com baralho próprio.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#0f0f14",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={fredoka.variable}>
      <body className="relative min-h-screen overflow-x-hidden safe-bottom">
        <div className="blob-field" aria-hidden="true">
          <span className="blob blob-amber" />
          <span className="blob blob-pink" />
          <span className="blob blob-violet" />
        </div>
        <GameProvider>{children}</GameProvider>
      </body>
    </html>
  );
}
