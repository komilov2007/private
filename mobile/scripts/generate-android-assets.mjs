// Generates TEMPORARY Android launcher icons and splash images from the existing web icon
// (public/icon.svg heart). Swap BG/HEART/heartPath for final brand artwork later and re-run:
//   node mobile/scripts/generate-android-assets.mjs
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = path.join(root, "android/app/src/main/res");
const BG = "#fffaf8";
const HEART = "#dd6b7f";
const heartPath = "M256 370s-126-74-126-160c0-46 34-78 76-78 25 0 42 12 50 28 8-16 25-28 50-28 42 0 76 32 76 78 0 86-126 160-126 160z";

// Heart spans x 130..382, y 132..370 in the 512 box: centre it and scale to `fraction` of the canvas.
function heartSvg(size, { fraction, background, shape }) {
  const scale = (size * fraction) / 252;
  const tx = size / 2 - 256 * scale;
  const ty = size / 2 - 251 * scale;
  const bg = background === "none" ? "" : shape === "circle"
    ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${background}"/>`
    : shape === "rounded" ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${background}"/>`
    : `<rect width="${size}" height="${size}" fill="${background}"/>`;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">${bg}<path transform="translate(${tx} ${ty}) scale(${scale})" d="${heartPath}" fill="${HEART}"/></svg>`);
}

async function write(file, svg, width, height) {
  const image = width && height ? sharp(svg).resize(width, height, { fit: "cover" }) : sharp(svg);
  await image.png().toFile(file);
}

const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
for (const [density, factor] of Object.entries(densities)) {
  const dir = path.join(res, `mipmap-${density}`);
  const legacy = Math.round(48 * factor);
  const adaptive = Math.round(108 * factor);
  await write(path.join(dir, "ic_launcher.png"), heartSvg(legacy, { fraction: 0.56, background: BG, shape: "rounded" }));
  await write(path.join(dir, "ic_launcher_round.png"), heartSvg(legacy, { fraction: 0.56, background: BG, shape: "circle" }));
  // Adaptive foreground: keep the heart inside the 66dp safe zone of the 108dp layer.
  await write(path.join(dir, "ic_launcher_foreground.png"), heartSvg(adaptive, { fraction: 0.42, background: "none" }));
}

// Pre-Android-12 splash images: regenerate every existing splash.png at its own size.
for (const entry of await readdir(res, { withFileTypes: true })) {
  if (!entry.isDirectory() || !entry.name.startsWith("drawable")) continue;
  const file = path.join(res, entry.name, "splash.png");
  const meta = await sharp(file).metadata().catch(() => null);
  if (!meta?.width || !meta.height) continue;
  const side = Math.max(meta.width, meta.height);
  const icon = Math.min(meta.width, meta.height) * 0.28;
  await write(file, heartSvg(side, { fraction: icon / side, background: BG, shape: "square" }), meta.width, meta.height);
}

console.log("Android icons and splash images generated from the temporary heart artwork.");
