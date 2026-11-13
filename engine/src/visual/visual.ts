/**
 * Visual check: each Figma variant, rendered by Figma, against the same variant rendered by the
 * generated Storybook ("Figma Variants" story), pixel by pixel.
 *
 * Figma renders come from the file version the code was generated from (visual-manifest.json).
 * Storybook renders are element screenshots from a running Storybook, taken with the Playwright
 * install of the generated project, on a white page (a transparent page drops semi-transparent
 * elements in Chromium). Figma's transparent PNG is drawn on white too, then both are compared with pixelmatch.
 */
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

export interface VisualManifest {
  fileKey: string;
  version: string;
  components: { name: string; story: string; variants: { nodeId: string; name: string; width: number; height: number; paintBox?: [number, number, number, number] }[] }[];
  notCovered: string[];
}

export interface VisualSource {
  images(fileKey: string, ids: string[], format: 'svg' | 'png', version?: string, scale?: number): Promise<{ images: Record<string, string | null> }>;
  fetchBinary(url: string): Promise<Buffer>;
}

export interface VisualOptions {
  /** Generated React Storybook folder (holds visual-manifest.json and node_modules/playwright). */
  dir: string;
  /** Running Storybook, e.g. http://localhost:6006. */
  url: string;
  /** Where the report and images go. */
  outDir: string;
  scale?: number;
  /** Only these components. */
  only?: string[];
  log: (m: string) => void;
}

export interface VariantResult {
  component: string;
  nodeId: string;
  name: string;
  /** Percentage of pixels that differ (0-100). */
  diff: number;
  figmaSize: [number, number];
  codeSize: [number, number];
  files?: { figma: string; code: string; diff: string };
  error?: string;
}

/**
 * Below 2% and the same size (±1px), the renders match (anti-aliasing and font hinting). Up to 10%, or a size
 * difference alone (a fixed-size Figma specimen frame around content that sizes itself), worth a look.
 * Above 10% of the pixels, a real difference.
 */
export const verdict = (r: VariantResult) => (r.error ? 'error' : r.diff <= 2 && sizeOk(r) ? 'match' : r.diff <= 10 ? 'check' : 'differs');
const sizeOk = (r: VariantResult) => Math.abs(r.figmaSize[0] - r.codeSize[0]) <= 1 && Math.abs(r.figmaSize[1] - r.codeSize[1]) <= 1;

/** Draws a PNG on white at the top left of a w×h canvas. */
function onWhite(img: PNG, w: number, h: number): PNG {
  const out = new PNG({ width: w, height: h });
  out.data.fill(255);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const i = (y * img.width + x) * 4;
      const o = (y * w + x) * 4;
      const a = img.data[i + 3]! / 255;
      for (let c = 0; c < 3; c++) out.data[o + c] = Math.round(img.data[i + c]! * a + 255 * (1 - a));
      out.data[o + 3] = 255;
    }
  }
  return out;
}

export function compare(figmaPng: Buffer, codePng: Buffer): { diff: number; diffPng: Buffer; figma: PNG; code: PNG } {
  const figma = PNG.sync.read(figmaPng);
  const code = PNG.sync.read(codePng);
  const w = Math.max(figma.width, code.width);
  const h = Math.max(figma.height, code.height);
  const a = onWhite(figma, w, h);
  const b = onWhite(code, w, h);
  const out = new PNG({ width: w, height: h });
  const n = pixelmatch(a.data, b.data, out.data, w, h, { threshold: 0.1 });
  return { diff: Math.round((n / (w * h)) * 10000) / 100, diffPng: PNG.sync.write(out), figma, code };
}

export async function runVisual(source: VisualSource, o: VisualOptions): Promise<{ results: VariantResult[]; report: string }> {
  const scale = o.scale ?? 2;
  const manifest = JSON.parse(readFileSync(join(o.dir, 'visual-manifest.json'), 'utf8')) as VisualManifest;
  const components = manifest.components.filter((c) => !o.only?.length || o.only.includes(c.name));
  if (!components.length) throw new Error(`No components to check${o.only?.length ? ` (asked for ${o.only.join(', ')})` : ''}. Run "ds-sync generate" first.`);

  // 1. Figma renders (cached), in batches.
  const ids = components.flatMap((c) => c.variants.map((v) => v.nodeId));
  const urls: Record<string, string | null> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    Object.assign(urls, (await source.images(manifest.fileKey, batch, 'png', manifest.version, scale)).images);
    o.log(`Figma renders: ${Math.min(i + 50, ids.length)}/${ids.length}`);
  }

  // 2. Storybook renders, with the generated project's Playwright.
  let chromium: { launch: (o?: object) => Promise<any> };
  try {
    ({ chromium } = createRequire(join(o.dir, 'package.json'))('playwright') as { chromium: typeof chromium });
  } catch {
    throw new Error(`Playwright is not installed in ${o.dir}. Run "npm install" there first.`);
  }
  const browser = await chromium.launch();
  const results: VariantResult[] = [];
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, deviceScaleFactor: scale });
    for (const c of components) {
      const storyUrl = `${o.url.replace(/\/$/, '')}/iframe.html?id=${c.story}&viewMode=story`;
      try {
        await page.goto(storyUrl, { waitUntil: 'networkidle' });
      } catch {
        throw new Error(`Cannot open ${storyUrl}. Start the Storybook first (npm run storybook in ${o.dir}) or pass --url.`);
      }
      try {
        await page.waitForSelector('[data-figma-variant]', { timeout: 15000 });
      } catch {
        for (const v of c.variants) results.push({ component: c.name, nodeId: v.nodeId, name: v.name, diff: 100, figmaSize: [v.width, v.height], codeSize: [0, 0], error: 'Story did not render (regenerate, then restart Storybook).' });
        continue;
      }
      await page.evaluate('document.fonts.ready');
      await page.addStyleTag({ content: 'html, body, #storybook-root { background: #ffffff !important; } *, *::before, *::after { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
      const dir = join(o.outDir, c.name);
      mkdirSync(dir, { recursive: true });
      for (const v of c.variants) {
        const base: VariantResult = { component: c.name, nodeId: v.nodeId, name: v.name, diff: 100, figmaSize: [v.width, v.height], codeSize: [0, 0] };
        try {
          const url = urls[v.nodeId];
          if (!url) throw new Error('Figma did not render this variant.');
          const figmaPng = await source.fetchBinary(url);
          const el = page.locator(`[data-figma-variant="${v.nodeId}"] > *`).first();
          await el.scrollIntoViewIfNeeded();
          const box = (await el.boundingBox()) as { x: number; y: number; width: number; height: number } | null;
          if (!box) throw new Error('The variant has no box in the story (hidden or not rendered).');
          // Figma's PNG includes effects outside the frame (shadows, focus rings). Capture the same margin
          // around the element, assuming the effects spread evenly; the frame size is compared separately.
          // Figma's PNG includes effects outside the frame. Use Figma's exact render bounds when known
          // (a shadow falls downward), else assume the effects spread evenly.
          const fig = PNG.sync.read(figmaPng);
          // Figma's render bounds and its PNG export do not always agree: trust them only when the sizes match.
          const pb = v.paintBox && Math.abs(v.paintBox[2] - fig.width / scale) <= 0.5 && Math.abs(v.paintBox[3] - fig.height / scale) <= 0.5 ? v.paintBox : undefined;
          const dx = pb ? pb[0] : Math.max(0, (fig.width / scale - v.width) / 2);
          const dy = pb ? pb[1] : Math.max(0, (fig.height / scale - v.height) / 2);
          // Clip of the Figma frame's size on whole device pixels: a fractional position would smear edges over an extra pixel.
          // A code element larger or smaller than the frame shows up in the size check instead.
          const codePng: Buffer = await page.screenshot({ animations: 'disabled', clip: { x: Math.round((box.x - dx) * scale) / scale, y: Math.round((box.y - dy) * scale) / scale, width: fig.width / scale, height: fig.height / scale } });
          const r = compare(figmaPng, codePng);
          const file = v.nodeId.replace(/[^\w-]/g, '_');
          writeFileSync(join(dir, `${file}-figma.png`), figmaPng);
          writeFileSync(join(dir, `${file}-code.png`), codePng);
          writeFileSync(join(dir, `${file}-diff.png`), r.diffPng);
          results.push({
            ...base,
            diff: r.diff,
            figmaSize: [v.width, v.height],
            codeSize: [Math.round(box.width), Math.round(box.height)],
            files: { figma: `${c.name}/${file}-figma.png`, code: `${c.name}/${file}-code.png`, diff: `${c.name}/${file}-diff.png` },
          });
        } catch (err) {
          results.push({ ...base, error: err instanceof Error ? err.message : String(err) });
        }
      }
      const mine = results.filter((r) => r.component === c.name);
      o.log(`${c.name}: ${mine.filter((r) => verdict(r) === 'match').length}/${mine.length} match, worst ${Math.max(...mine.map((r) => r.diff))}%`);
    }
  } finally {
    await browser.close();
  }

  const report = join(o.outDir, 'report.html');
  writeFileSync(report, reportHtml(manifest, results));
  writeFileSync(join(o.outDir, 'summary.json'), JSON.stringify({ fileKey: manifest.fileKey, version: manifest.version, results: results.map(({ files: _f, ...r }) => ({ ...r, verdict: verdict(r) })) }, null, 2) + '\n');
  o.log(`Report → ${relative(process.cwd(), report)}`);
  return { results, report };
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

function reportHtml(m: VisualManifest, results: VariantResult[]): string {
  const counts: Record<'match' | 'check' | 'differs' | 'error', number> = { match: 0, check: 0, differs: 0, error: 0 };
  for (const r of results) counts[verdict(r)]++;
  const byComponent = [...new Set(results.map((r) => r.component))].map((name) => {
    const rs = results.filter((r) => r.component === name).sort((a, b) => b.diff - a.diff);
    return { name, rs, worst: rs[0]?.diff ?? 0, matching: rs.filter((r) => verdict(r) === 'match').length };
  }).sort((a, b) => b.worst - a.worst);
  const row = (r: VariantResult) => `<tr class="${verdict(r)}">
  <td><b>${esc(r.name)}</b><br><code>${esc(r.nodeId)}</code></td>
  <td class="num">${r.error ? '—' : `${r.diff}%`}<br><span class="badge">${verdict(r)}</span></td>
  <td class="num">Figma ${r.figmaSize.join('×')}<br>Code ${r.codeSize.join('×')}</td>
  ${r.files ? `<td><img src="${r.files.figma}" alt="Figma render"></td><td><img src="${r.files.code}" alt="Storybook render"></td><td><img src="${r.files.diff}" alt="Difference"></td>` : `<td colspan="3">${esc(r.error ?? '')}</td>`}
</tr>`;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visual check</title>
<style>
:root { color-scheme: light dark; --bg: #fff; --fg: #111; --muted: #666; --line: #ddd; --match: #1a7f37; --check: #9a6700; --differs: #cf222e; }
@media (prefers-color-scheme: dark) { :root { --bg: #111; --fg: #eee; --muted: #aaa; --line: #333; --match: #3fb950; --check: #d29922; --differs: #f85149; } }
body { margin: 0; padding: 24px 16px; font: 14px/1.5 system-ui, sans-serif; background: var(--bg); color: var(--fg); }
h1 { margin: 0 0 4px; } p { color: var(--muted); margin: 0 0 16px; }
.summary { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 24px; } .summary div { border: 1px solid var(--line); border-radius: 8px; padding: 8px 12px; }
details { border-top: 1px solid var(--line); padding: 8px 0; } summary { cursor: pointer; font-weight: 600; }
.wrap { overflow-x: auto; } table { border-collapse: collapse; margin-top: 8px; } td { border-top: 1px solid var(--line); padding: 8px; vertical-align: top; }
td img { max-width: 360px; background: #fff; border: 1px solid var(--line); } .num { white-space: nowrap; }
.badge { font-size: 12px; font-weight: 600; } .match .badge { color: var(--match); } .check .badge { color: var(--check); } .differs .badge, .error .badge { color: var(--differs); }
</style></head><body>
<h1>Visual check: Figma vs Storybook</h1>
<p>Figma file <code>${esc(m.fileKey)}</code>, version ${esc(m.version)}. Each Figma variant rendered by Figma (left) and by the generated React Storybook (middle), compared pixel by pixel (right: differences in red). <b>match</b> ≤ 2% and the same size (±1px); <b>check</b> ≤ 10% or a size difference only; <b>differs</b> above 10%. Not covered yet: ${m.notCovered.map(esc).join(', ') || 'none'}.</p>
<div class="summary"><div><b>${results.length}</b> variants</div><div class="match"><b>${counts.match}</b> <span class="badge">match</span></div><div class="check"><b>${counts.check}</b> <span class="badge">check</span></div><div class="differs"><b>${counts.differs + counts.error}</b> <span class="badge">differ</span></div></div>
${byComponent.map((c) => `<details${c.worst > 10 ? ' open' : ''}><summary>${esc(c.name)}: ${c.matching}/${c.rs.length} match, worst ${c.worst}%</summary><div class="wrap"><table>${c.rs.map(row).join('')}</table></div></details>`).join('\n')}
</body></html>
`;
}
