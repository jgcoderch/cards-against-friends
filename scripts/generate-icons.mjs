// Gera os ícones/favicon do app a partir de um SVG simples (duas cartinhas
// sobrepostas, sem texto — de propósito, pra não depender de nenhuma fonte).
// Roda uma vez, localmente: `node scripts/generate-icons.mjs`.
// Se quiser redesenhar o ícone, mexe no SVG abaixo e roda de novo.
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

const BG = "#111114";
const GOLD = "#f2c744";
const WHITE = "#fdfdfd";

/** Duas cartinhas sobrepostas e levemente rotacionadas, centralizadas num
 * canvas quadrado. `cardScale` encolhe as cartas (deixando mais margem) —
 * usado pro ícone "maskable", que o Android pode recortar num círculo. */
function cardsSvg(size, { rounded = false, cardScale = 1 } = {}) {
  const cx = size / 2;
  const cy = size / 2;
  const w = size * 0.34 * cardScale;
  const h = w * 1.4;
  const offset = size * 0.06 * cardScale;
  const rx = w * 0.16;

  const goldX = cx - offset - w / 2;
  const goldY = cy - h / 2;
  const whiteX = cx + offset - w / 2;
  const whiteY = cy - h / 2;

  const bg = rounded
    ? `<rect width="${size}" height="${size}" rx="${size * 0.22}" fill="${BG}"/>`
    : `<rect width="${size}" height="${size}" fill="${BG}"/>`;

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
  ${bg}
  <rect x="${goldX}" y="${goldY}" width="${w}" height="${h}" rx="${rx}" fill="${GOLD}" transform="rotate(-14 ${cx - offset} ${cy})"/>
  <rect x="${whiteX}" y="${whiteY}" width="${w}" height="${h}" rx="${rx}" fill="${WHITE}" transform="rotate(12 ${cx + offset} ${cy})"/>
</svg>`;
}

async function writeSvg(path, svg) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, svg, "utf-8");
  console.log("SVG  ", path);
}

async function writePng(path, svg, size) {
  await mkdir(dirname(path), { recursive: true });
  const buffer = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await writeFile(path, buffer);
  console.log("PNG  ", path);
}

async function main() {
  // Favicon: SVG estático, com fundo arredondado (fica bonito na aba do navegador).
  await writeSvg(join(rootDir, "app/icon.svg"), cardsSvg(64, { rounded: true }));

  // Apple touch icon (iOS não aceita SVG aqui, precisa ser PNG; o próprio iOS
  // aplica a máscara/arredondamento, então fundo full-bleed sem raio).
  await writePng(join(rootDir, "app/apple-icon.png"), cardsSvg(180), 180);

  // Ícones do manifest (Android/Chrome "Adicionar à tela inicial").
  await writePng(join(rootDir, "public/icon-192.png"), cardsSvg(192), 192);
  await writePng(join(rootDir, "public/icon-512.png"), cardsSvg(512), 512);
  await writePng(
    join(rootDir, "public/icon-512-maskable.png"),
    cardsSvg(512, { cardScale: 0.7 }),
    512
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
