import { ImageResponse } from "next/og";

// Link preview for whoislying.ch and every room link (WhatsApp, iMessage, Slack…): the start screen's dealt hand.
export const alt = "Imposter: the party game where one of you is lying";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#0b132b";
const ICE = "#6fffe9";
const IMP = "#6f89da";
const CARDS = [-2, -1, 0, 1, 2];
const TEXT = ["Pizza", "Imposter", "One of you is lying.", "whoislying.ch"];

// the app's font; if Google Fonts is unreachable at build time the default font is used instead
async function bricolage(): Promise<ArrayBuffer | null> {
  try {
    const glyphs = encodeURIComponent([...new Set(TEXT.join(""))].join("")); // only the letters we draw: a tiny font file
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@800&text=${glyphs}`)).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}

const Mask = ({ size }: { size: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={IMP} strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6a2 2 0 0 0-2 2v4a5 5 0 0 0 5 5 8 8 0 0 1 5 2 8 8 0 0 1 5-2 5 5 0 0 0 5-5V8a2 2 0 0 0-2-2h-3a8 8 0 0 0-5 2 8 8 0 0 0-5-2z" />
    <path d="M18 11c-1.5 0-2.5.5-3 2" />
    <path d="M6 11c1.5 0 2.5.5 3 2" />
  </svg>
);

export default async function Image() {
  const font = await bricolage();
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: `linear-gradient(180deg, #1c2541 0%, ${INK} 100%)`, fontFamily: font ? "Bricolage" : undefined }}>
        <div style={{ display: "flex", position: "relative", width: 620, height: 230 }}>
          {CARDS.map((c) => (
            <div
              key={c}
              style={{
                position: "absolute",
                left: 245 + c * 118,
                top: 20 + Math.abs(c) * 14,
                width: 130,
                height: 170,
                display: "flex",
                padding: 16,
                borderRadius: 22,
                background: "#1c2541",
                border: "2px solid #3a506b",
                boxShadow: "0 18px 40px rgba(0,0,0,0.45)",
                transform: `rotate(${c * 8}deg)`,
                color: "#e8f1f2",
                fontSize: 30,
                fontWeight: 800,
              }}
            >
              {c === 1 ? <Mask size={60} /> : TEXT[0]}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", fontSize: 150, fontWeight: 800, color: ICE, letterSpacing: -4, lineHeight: 1 }}>{TEXT[1]}</div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 40, color: "#b8c6d6" }}>{TEXT[2]}</div>
        <div style={{ display: "flex", marginTop: 26, fontSize: 28, color: "#5bc0be" }}>{TEXT[3]}</div>
      </div>
    ),
    { ...size, fonts: font ? [{ name: "Bricolage", data: font, weight: 800, style: "normal" }] : [] },
  );
}
