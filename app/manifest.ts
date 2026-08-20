import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Cards Against Friends",
    short_name: "CAF",
    description: "Jogo de cartas multiplayer estilo Cards Against Humanity, com baralho próprio.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0b0b10",
    theme_color: "#0f0f14",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
