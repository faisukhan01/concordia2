// Clean up the Concordia campus photograph for use as a login page background.
//
// The original photo is "messy" — flat overcast lighting, dull grey sky,
// cluttered details (billboard, parked cars, utility poles, patchy grass).
// This script applies a subtle aesthetic cleanup WITHOUT changing the
// building or the scene:
//   • Slight Gaussian blur (1.2px) — softens cluttered details (cars, poles,
//     patchy grass, billboard text) while keeping building shapes clean.
//   • Contrast +18% — adds depth and dimension (fixes the flat overcast look).
//   • Saturation +25% — enriches muted/desaturated colours (orange accents,
//     green grass/trees pop).
//   • Brightness -4% — slightly darker for a more refined, premium mood.
//   • Slight sharpening after blur — keeps architectural edges crisp.
//
// The result is a cleaner, more aesthetic background that looks polished
// behind the glassmorphism login card.

import sharp from 'sharp';
import { readFileSync, writeFileSync, statSync } from 'fs';

const SRC = 'public/concordia-campus.jpg';
const DST = 'public/concordia-campus-cleaned.jpg';
const BACKUP = 'public/concordia-campus-original.jpg';

async function main() {
  const before = statSync(SRC).size;
  console.log(`Processing ${SRC} (${(before / 1024).toFixed(1)} KB)...`);

  const buf = readFileSync(SRC);

  // First, back up the original (only once)
  try {
    statSync(BACKUP);
    console.log(`Backup already exists: ${BACKUP}`);
  } catch {
    writeFileSync(BACKUP, buf);
    console.log(`Backed up original to: ${BACKUP}`);
  }

  // Process: blur → modulate → sharpen
  const out = await sharp(buf)
    // Slight Gaussian blur to soften cluttered details (cars, poles, grass)
    .blur(1.2)
    // Aesthetic colour grading: richer colours + more depth + slightly darker
    .modulate({
      brightness: 0.96,   // -4% — slightly darker, more premium mood
      saturation: 1.25,   // +25% — enrich muted colours
    })
    .linear(1.18, -(0.18 * 128) / 255) // +18% contrast
    // Light sharpen to keep architectural edges crisp after the blur
    .sharpen({ sigma: 0.8, m1: 0.6, m2: 0.2 })
    // Output as high-quality JPEG
    .jpeg({ quality: 88, mozjpeg: true, chromaSubsampling: '4:4:4' })
    .toBuffer();

  writeFileSync(DST, out);
  const after = statSync(DST).size;
  console.log(`✓ Cleaned image saved: ${DST} (${(after / 1024).toFixed(1)} KB)`);
  console.log(`  Size change: ${(before / 1024).toFixed(1)} KB → ${(after / 1024).toFixed(1)} KB`);
}

main().catch(e => { console.error(e); process.exit(1); });
