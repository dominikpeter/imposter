import { expect, test } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import QRCode from "qrcode";

// Fake camera: Chromium plays a .y4m file as the webcam. We draw a real QR (join link for room TEST)
// into one grayscale frame, so the in-app scanner reads it exactly like a phone camera would.
const W = 640, H = 480;
const qr = QRCode.create("https://imposter.example/r/TEST", { errorCorrectionLevel: "M" });
const size = qr.modules.size, scale = 10, quiet = 4 * scale;
const y = Buffer.alloc(W * H, 235); // white
const x0 = (W - size * scale) / 2, y0 = (H - size * scale) / 2;
for (let r = -quiet; r < size * scale + quiet; r++)
  for (let c = -quiet; c < size * scale + quiet; c++) {
    const dark = r >= 0 && c >= 0 && r < size * scale && c < size * scale && qr.modules.get(Math.floor(r / scale), Math.floor(c / scale));
    y[(y0 + r) * W + x0 + c] = dark ? 16 : 235;
  }
const dir = join(process.cwd(), "test-results");
mkdirSync(dir, { recursive: true });
const file = join(dir, "fake-qr.y4m");
writeFileSync(
  file,
  Buffer.concat([
    Buffer.from(`YUV4MPEG2 W${W} H${H} F30:1 Ip A1:1 C420jpeg\nFRAME\n`),
    y,
    Buffer.alloc((W / 2) * (H / 2) * 2, 128), // no color
  ]),
);

test.use({
  permissions: ["camera"],
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", `--use-file-for-fake-video-capture=${file}`] },
});

test("join a room by scanning the host's QR code", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Every phone/ }).click();
  await page.getByRole("button", { name: /Join a room/ }).click();
  await expect(page.getByRole("button", { name: /Create room/ })).toHaveCount(0); // joining hides host settings
  await page.getByRole("button", { name: "Scan QR code" }).click();
  // no name yet → the scanned code is filled in, ready to join
  await expect(page.getByLabel("Room code")).toHaveValue("TEST", { timeout: 15_000 });
  await page.getByPlaceholder("Your name").fill("Beni");
  await page.getByRole("button", { name: "Join", exact: true }).click();
  await expect(page.getByText("Room not found. Check the code.")).toBeVisible(); // TEST isn't a live room
});
