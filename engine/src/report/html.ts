import type { ComponentDrift, Finding } from '../diff/diff.ts';
import type { FigmaIR } from '../ir/types.ts';

const esc = (s: unknown) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

const ORDER: Record<Finding['severity'], number> = { error: 0, warning: 1, info: 2 };

export interface ReportInput {
  ir: FigmaIR;
  drifts: ComponentDrift[];
  generatedAt: string;
  repoLabel: string;
}

function count(f: Finding[], s: Finding['severity']) {
  return f.filter((x) => x.severity === s).length;
}

export function renderReport({ ir, drifts, generatedAt, repoLabel }: ReportInput): string {
  const summaryRows = drifts
    .map((d) => `<tr>
      <td><a href="#${esc(d.componentId)}">${esc(d.name)}</a><div class="sub">${esc(d.codeExport)}</div></td>
      <td class="num"><span class="pill error">${count(d.findings, 'error')}</span></td>
      <td class="num"><span class="pill warning">${count(d.findings, 'warning')}</span></td>
      <td class="num"><span class="pill info">${count(d.findings, 'info')}</span></td>
      <td class="num">${d.metrics.mappedProps}/${d.metrics.figmaProps}</td>
      <td class="num">${d.metrics.codeOnlyProps.length}</td>
      <td class="num">${pct(d.metrics.tokenBindingRate)}</td>
      <td class="num">${d.metrics.axesWithStory}/${d.metrics.axesTotal}</td>
    </tr>`)
    .join('');

  const sections = drifts
    .map((d) => {
      const mappings = d.mappings
        .map((m) => `<tr><td>${esc(m.figmaProperty)}</td><td>${m.codeProp ? `<code>${esc(m.codeProp)}</code>` : '<span class="muted">none</span>'}</td><td class="muted">${esc(m.mappedBy)}</td></tr>`)
        .join('');
      const findings = [...d.findings]
        .sort((a, b) => ORDER[a.severity] - ORDER[b.severity] || a.category.localeCompare(b.category))
        .map((f) => `<tr><td><span class="pill ${f.severity}">${f.severity}</span></td><td class="muted">${esc(f.category)}</td><td>${esc(f.title)}${f.detail ? `<div class="sub">${esc(f.detail)}</div>` : ''}</td></tr>`)
        .join('');
      return `<section id="${esc(d.componentId)}">
        <h2>${esc(d.name)} <span class="muted">→ ${esc(d.codeExport)}</span></h2>
        <h3>Property mapping</h3>
        <div class="scroll"><table><thead><tr><th>Figma property</th><th>Code prop</th><th>Mapped by</th></tr></thead><tbody>${mappings || '<tr><td colspan="3" class="muted">No properties</td></tr>'}</tbody></table></div>
        <h3>Findings</h3>
        <div class="scroll"><table><thead><tr><th>Severity</th><th>Category</th><th>Finding</th></tr></thead><tbody>${findings || '<tr><td colspan="3" class="muted">No findings</td></tr>'}</tbody></table></div>
      </section>`;
    })
    .join('');

  const missing = ir.missing.length
    ? `<section><h2>Not found in Figma</h2><ul>${ir.missing.map((m) => `<li><code>${esc(m.targetId)}</code>: ${esc(m.reason)}</li>`).join('')}</ul></section>`
    : '';

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Design System Health</title>
<style>
:root { --bg:#ffffff; --fg:#1b1d21; --muted:#5c6370; --line:#e3e6ea; --card:#f6f7f9;
  --error:#b42318; --error-bg:#fde8e7; --warning:#8a5a00; --warning-bg:#fff3d6; --info:#2f5b9a; --info-bg:#e6eefb; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg:#14161a; --fg:#e7e9ec; --muted:#9aa2ad; --line:#2b2f36; --card:#1c1f24;
  --error:#ff8a80; --error-bg:#3a1714; --warning:#f2c36b; --warning-bg:#33270e; --info:#9cc0ff; --info-bg:#16243a; } }
:root[data-theme="dark"] { --bg:#14161a; --fg:#e7e9ec; --muted:#9aa2ad; --line:#2b2f36; --card:#1c1f24;
  --error:#ff8a80; --error-bg:#3a1714; --warning:#f2c36b; --warning-bg:#33270e; --info:#9cc0ff; --info-bg:#16243a; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 1080px; margin: 0 auto; padding: 24px 16px 64px; }
h1 { font-size: 24px; margin: 0 0 4px; } h2 { font-size: 19px; margin: 40px 0 8px; } h3 { font-size: 15px; margin: 20px 0 8px; color: var(--muted); }
.meta { color: var(--muted); font-size: 13px; }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--line); vertical-align: top; }
th { font-weight: 600; color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .03em; }
td.num, th.num { text-align: right; white-space: nowrap; }
.sub { color: var(--muted); font-size: 13px; margin-top: 2px; word-break: break-word; }
.muted { color: var(--muted); }
code { font: 13px ui-monospace, SFMono-Regular, Menlo, monospace; }
.pill { display:inline-block; min-width: 24px; padding: 1px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; text-align:center; }
.pill.error { color: var(--error); background: var(--error-bg); } .pill.warning { color: var(--warning); background: var(--warning-bg); } .pill.info { color: var(--info); background: var(--info-bg); }
.note { background: var(--card); border: 1px solid var(--line); border-radius: 8px; padding: 10px 12px; font-size: 13px; color: var(--muted); margin-top: 12px; }
a { color: inherit; }
</style>
</head>
<body>
<main>
<h1>Design system health report</h1>
<div class="meta">Figma “${esc(ir.fileName)}” (${esc(ir.fileKey)}) · version ${esc(ir.version)} · last modified ${esc(ir.lastModified)}<br>
Repo ${esc(repoLabel)} · generated ${esc(generatedAt)} · read-only: nothing was changed</div>
<div class="note">Variables: <strong>${esc(ir.variables.source)}</strong>${ir.variables.note ? ` — ${esc(ir.variables.note)}` : ''}</div>
<h2>Summary</h2>
<div class="scroll"><table>
<thead><tr><th>Component</th><th class="num">Errors</th><th class="num">Warnings</th><th class="num">Info</th><th class="num">Props mapped</th><th class="num">Code-only props</th><th class="num">Figma token binding</th><th class="num">Axes with a story</th></tr></thead>
<tbody>${summaryRows}</tbody>
</table></div>
${missing}
${sections}
</main>
</body>
</html>
`;
}
