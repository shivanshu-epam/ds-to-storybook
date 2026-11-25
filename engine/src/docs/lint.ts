// Docs lint: checks every generated component page against docs/fidelity/STANDARD.md (sections 3 and 4).
// It reads the generated project itself (MDX pages and component source), not the generator's data, so it checks
// what actually ships. Deterministic; no Figma or AI calls.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export type LintSeverity = 'error' | 'warning';

export interface LintFinding {
  component: string;
  rule: string;
  severity: LintSeverity;
  message: string;
}

export interface LintResult {
  dir: string;
  pages: number;
  findings: LintFinding[];
}

/** What each rule checks, for the report. */
export const RULES: Record<string, string> = {
  'required-section': 'Every public page has Overview, Preview, Accessibility and Code, and a Design reference (on its Design review page); Properties when the component has props; Behaviour and keyboard when its stories test interaction (STANDARD 3).',
  'empty-section': 'A section with nothing to say is omitted, not left empty (STANDARD 3).',
  'no-description': 'The Overview says what the component is for (STANDARD 3.1, Overview).',
  'plain-label': 'Property labels are plain language, not code or CSS selectors (STANDARD 3.2).',
  'props-columns': 'The properties table has name, type, default, description and Figma property (STANDARD 3.1, Properties).',
  'prop-missing': 'Every prop in the component source is in the properties table (STANDARD 3.1, Properties).',
  'prop-undescribed': 'Each property says what it does (STANDARD 3.2); flagged per page, as a count.',
  'code-example': 'The Code section shows a working example with content, not an empty tag (STANDARD 3.1, Code).',
  'figma-link': 'The Design reference links to the Figma component set (STANDARD 3.1, Design reference).',
  'visual-not-run': 'The Design reference reports the visual check for this Figma version (STANDARD 3.1, Design reference).',
  'broken-link': 'Links to other component pages point to pages that exist.',
};

interface Section { level: number; heading: string; body: string[] }

function sections(mdx: string): Section[] {
  const out: Section[] = [];
  let cur: Section | undefined;
  for (const line of mdx.split('\n')) {
    const m = /^(#{2,3}) (.+)$/.exec(line);
    if (m) { cur = { level: m[1]!.length, heading: m[2]!.trim(), body: [] }; out.push(cur); continue; }
    if (cur && line.trim()) cur.body.push(line);
  }
  return out;
}

const text = (s: string) => s.replace(/<[^>]+>/g, ' ').replace(/\{"|"\}/g, ' ').trim();
const slug = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** Props a React component declares itself (its <Name>Props interface), or a Lit element's reactive properties. */
function sourceProps(dir: string, name: string): string[] | undefined {
  const tsx = join(dir, `${name}.tsx`);
  if (existsSync(tsx)) {
    const src = readFileSync(tsx, 'utf8');
    const body = new RegExp(`export interface ${name}Props[^{]*\\{([\\s\\S]*?)\\n\\}`).exec(src)?.[1];
    if (!body) return undefined;
    return [...body.matchAll(/^\s{2}'?([A-Za-z][\w-]*)'?\??:/gm)].map((m) => m[1]!).filter((p) => p !== 'data-force-state');
  }
  const wc = readdirSync(dir).find((f) => /^[a-z]+-[\w-]+\.ts$/.test(f) && !f.endsWith('.stories.ts'));
  if (!wc) return undefined;
  const body = /static override properties = \{([\s\S]*?)\n\s{2}\};/.exec(readFileSync(join(dir, wc), 'utf8'))?.[1];
  if (!body) return undefined;
  // { state: true } is a Lit element's private state, not part of its API.
  return [...body.matchAll(/^\s{4}(\w+): (\{[^\n]*\})/gm)].filter((m) => !/state: true/.test(m[2]!)).map((m) => m[1]!).filter((p) => p !== 'forceState');
}

export function lintDocs(projectDir: string): LintResult {
  const root = join(projectDir, 'src', 'components');
  const findings: LintFinding[] = [];
  if (!existsSync(root)) return { dir: projectDir, pages: 0, findings };
  const names = readdirSync(root).filter((n) => existsSync(join(root, n, `${n}.mdx`)));
  // Every page title, so links between pages can be checked.
  const titles = new Set<string>();
  for (const n of names) {
    const stories = readdirSync(join(root, n)).find((f) => /\.stories\.tsx?$/.test(f));
    const title = stories ? /title: "([^"]+)"|title: '([^']+)'/.exec(readFileSync(join(root, n, stories), 'utf8')) : null;
    if (title) titles.add(slug(title[1] ?? title[2]!));
    // The component's Design review page (fidelity diagnostics, kept off the developer page).
    const review = join(root, n, `${n}.review.mdx`);
    const rt = existsSync(review) ? /<Meta title=("[^"]+")/.exec(readFileSync(review, 'utf8')) : null;
    if (rt) titles.add(slug(JSON.parse(rt[1]!) as string));
  }
  let pages = 0;
  for (const name of names) {
    const dir = join(root, name);
    const mdx = readFileSync(join(dir, `${name}.mdx`), 'utf8');
    const add = (rule: string, severity: LintSeverity, message: string) => findings.push({ component: name, rule, severity, message });
    const buildingBlock = /tags=\{\['!dev'\]\}/.test(mdx);
    pages++;
    const secs = sections(mdx);
    // Design reference: on the component's Design review page when there is one (the developer page links to it).
    const reviewFile = join(dir, `${name}.review.mdx`);
    const reviewSecs = existsSync(reviewFile) ? sections(readFileSync(reviewFile, 'utf8')) : [];
    const has = (h: string) => [...secs, ...(h === 'Design reference' ? reviewSecs : [])].some((s) => s.level === 2 && s.heading === h);
    const props = sourceProps(dir, name) ?? [];
    const storiesFile = readdirSync(dir).find((f) => /\.stories\.tsx?$/.test(f));
    const stories = storiesFile ? readFileSync(join(dir, storiesFile), 'utf8') : '';

    // Structure (building blocks are documented more briefly: only the Overview and Design reference are required).
    const required = buildingBlock ? ['Overview', 'Design reference'] : ['Overview', 'Preview', 'Accessibility', 'Code', 'Design reference', ...(props.length ? ['Properties'] : []), ...(/play: async/.test(stories) ? ['Behaviour and keyboard'] : [])];
    for (const h of required) if (!has(h)) add('required-section', buildingBlock ? 'warning' : 'error', `No "${h}" section.`);
    secs.forEach((s, i) => {
      const next = secs.slice(i + 1).find((x) => x.level <= s.level);
      const children = secs.slice(i + 1, next ? secs.indexOf(next) : undefined).some((x) => x.level > s.level && x.body.length);
      if (!s.body.length && !children) add('empty-section', 'error', `"${s.heading}" has no content.`);
    });

    // Overview
    const overview = secs.find((s) => s.heading === 'Overview');
    if (overview && /No description in Figma/.test(overview.body.join(' '))) add('no-description', 'warning', 'No description: add one to the component set in Figma (or accept a decision).');

    // Properties
    const tables = secs.filter((s) => s.level === 3 && secs.some((p) => p.heading === 'Properties')).flatMap((s) => s.body.filter((l) => l.startsWith('<table><thead><tr><th scope="col">Property')));
    if (tables.length) {
      const head = /<thead>(.*?)<\/thead>/.exec(tables[0]!)?.[1] ?? '';
      const cols = [...head.matchAll(/<th[^>]*>([^<]*)<\/th>/g)].map((m) => m[1]!.toLowerCase());
      const missing = ['type', 'default', 'description'].filter((c) => !cols.some((x) => x.includes(c)));
      if (missing.length) add('props-columns', 'error', `The properties table has no ${missing.join(', ')} column.`);
      const rows = tables.flatMap((t) => [...t.matchAll(/<tr><td>(.*?)<\/tr>/g)].map((m) => [...m[0].matchAll(/<td>(.*?)<\/td>/g)].map((c) => text(c[1]!))));
      const codeCol = cols.indexOf('code');
      const descCol = cols.findIndex((c) => c.includes('description') || c === 'notes');
      // Case-insensitive: Lit declares native attributes in lower case (maxlength), React in camelCase (maxLength).
      const listed = new Set(rows.map((r) => (codeCol >= 0 ? r[codeCol] : '') ?? '').flatMap((c) => c.split(/\s*\/\s*|\s+/)).map((x) => x.toLowerCase()));
      const absent = props.filter((x) => !listed.has(x.toLowerCase()) && !/^(on[A-Z]|default[A-Z]|children$|checked$|value$|open$|selected$|accessible|name$|href$|className$|style$)/.test(x));
      if (absent.length) add('prop-missing', 'warning', `Props not in the table: ${absent.join(', ')}.`);
      const labels = rows.map((r) => r[0] ?? '');
      const code = labels.filter((l) => /^:|\(css\)|[a-z][A-Z]\w*$|^[a-z]+[A-Z]/.test(l));
      if (code.length) add('plain-label', 'warning', `Labels that read as code: ${code.slice(0, 4).join(', ')}${code.length > 4 ? ` and ${code.length - 4} more` : ''}.`);
      const undescribed = descCol >= 0 ? rows.filter((r) => !(r[descCol] ?? '').trim()).length : rows.length;
      if (undescribed) add('prop-undescribed', 'warning', `${undescribed} of ${rows.length} properties have no description.`);
    } else if (props.length && !buildingBlock) add('required-section', 'error', 'No properties table.');

    // Code
    const codeSec = secs.find((s) => s.heading === 'Code');
    if (codeSec && !buildingBlock) {
      const src = codeSec.body.join('\n');
      if (src.includes(`<${name} />`) || /<ds-[\w-]+><\/ds-[\w-]+>/.test(src)) add('code-example', 'warning', `The code example is an empty <${name} />: show it with its content and main props.`);
    }

    // Design reference
    const ref = [...secs, ...reviewSecs].find((s) => s.heading === 'Design reference');
    if (ref) {
      const body = ref.body.join(' ');
      if (!/figma\.com\/design\//.test(body)) add('figma-link', 'error', 'No link to the Figma component set.');
      if (/Visual check: not run/.test(body)) add('visual-not-run', 'warning', 'The visual check has not run for this Figma version.');
    }

    // Links between pages
    for (const m of mdx.matchAll(/\?path=\/docs\/([a-z0-9-]+)--docs/g)) if (!titles.has(m[1]!)) add('broken-link', 'error', `Link to a page that does not exist: ${m[1]}.`);
  }
  return { dir: projectDir, pages, findings };
}

export function lintMarkdown(results: LintResult[]): string {
  const out = ['# Docs lint', '', 'Each generated component page checked against docs/fidelity/STANDARD.md. Errors break the standard; warnings need a look.', ''];
  for (const r of results) {
    const by = (s: LintSeverity) => r.findings.filter((f) => f.severity === s).length;
    out.push(`## ${r.dir}`, '', `${r.pages} pages: ${by('error')} error(s), ${by('warning')} warning(s).`, '');
    const rules = [...new Set(r.findings.map((f) => f.rule))];
    if (rules.length) {
      out.push('| Rule | Pages | What it checks |', '| --- | --- | --- |');
      for (const rule of rules) out.push(`| ${rule} | ${new Set(r.findings.filter((f) => f.rule === rule).map((f) => f.component)).size} | ${RULES[rule] ?? ''} |`);
      out.push('', '| Component | Severity | Rule | Finding |', '| --- | --- | --- | --- |');
      for (const f of r.findings) out.push(`| ${f.component} | ${f.severity} | ${f.rule} | ${f.message.replace(/\|/g, '\\|')} |`);
    }
    out.push('');
  }
  return out.join('\n');
}
