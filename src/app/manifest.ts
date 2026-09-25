import type { MetadataRoute } from "next";

// "Add to Home Screen": opens full-screen like an app, with the mask icon
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Imposter: who is lying?",
    short_name: "Imposter",
    description: "The party game where one of you is lying. One phone or every phone, in English, French and German.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef8f8",
    theme_color: "#0b132b",
    categories: ["games", "entertainment"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
