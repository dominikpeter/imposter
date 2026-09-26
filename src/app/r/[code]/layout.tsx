import type { Metadata } from "next";
import { cleanCode } from "@/lib/game";

// shared room links get their own preview text ("Join room AB12C"); the picture comes from app/opengraph-image
export async function generateMetadata({ params }: { params: Promise<{ code: string }> }): Promise<Metadata> {
  const code = cleanCode((await params).code);
  const title = code ? `Join room ${code} · Imposter` : "Join a room · Imposter";
  const description = "You're invited to a round of Imposter: everyone gets the secret word, except the imposter. Tap to join.";
  // a segment's own openGraph replaces the parent's, image included: point back at the shared one
  const images = [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Imposter: the party game where one of you is lying" }];
  return { title, description, openGraph: { title, description, url: `/r/${code}`, images }, twitter: { card: "summary_large_image", images } };
}

export default function RoomLayout({ children }: { children: React.ReactNode }) {
  return children;
}
