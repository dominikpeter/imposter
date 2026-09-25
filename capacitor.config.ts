import type { CapacitorConfig } from "@capacitor/cli";

// Android/iOS apps that load the live site: rooms, AI and every deploy work without a store update, and the
// PWA service worker makes one-phone games work offline after the first launch. capacitor/www is only the
// fallback for a very first launch without internet.
const config: CapacitorConfig = {
  appId: "ch.whoislying.imposter",
  appName: "Imposter",
  webDir: "capacitor/www",
  server: { url: "https://whoislying.ch", cleartext: false },
  backgroundColor: "#0b132b",
};

export default config;
