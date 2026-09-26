import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { ServiceWorker } from "@/components/Pwa";

const bricolage = Bricolage_Grotesque({ variable: "--font-bricolage", subsets: ["latin", "latin-ext"] });

export const metadata: Metadata = {
  metadataBase: new URL("https://whoislying.ch"), // absolute URLs for link previews (WhatsApp, iMessage, Slack)
  title: "Imposter",
  description: "The party game where one of you is lying.",
  openGraph: { siteName: "Imposter", type: "website", url: "/" },
  appleWebApp: { capable: true, title: "Imposter", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6ff" },
    { media: "(prefers-color-scheme: dark)", color: "#070f35" },
  ],
};

// applies saved light/dark + color theme before first paint; "auto" leaves light/dark to the system
const themeScript = `try{var d=document.documentElement,t=localStorage.getItem("theme"),p=localStorage.getItem("palette");if(t==="light"||t==="dark")d.dataset.theme=t;if(p)d.dataset.palette=p}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bricolage.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
      </head>
      <body className="min-h-full flex flex-col font-sans">
        {children}
        <ServiceWorker />
      </body>
    </html>
  );
}
