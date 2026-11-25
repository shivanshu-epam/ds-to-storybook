// Code mode: map each Figma property of a component to the API of the same component in code. Code wins for API
// (prop names, value names, shapes); Figma keeps visuals and tokens. Every mapping says why it was made, and every
// Figma item without a code counterpart (and every code prop without a Figma one) is listed for review.
import type { IRComponentSet, IRProperty } from '../ir/types.ts';
import type { ApiProp, ComponentApi } from './api.ts';

/** Where one Figma value goes in code. */
export type ValueTarget =
  | { value: string }
  /** Another prop set to a value (Size=Expressive -> isExpressive: true). */
  | { prop: string; value: string | boolean }
  /** A separate component (State=Skeleton -> ButtonSkeleton). */
  | { component: string }
  /** Handled by the browser, not a prop (hover, focus, pressed). */
  | { css: string };

export interface PropMapping {
  figma: string;
  figmaType: IRProperty['type'];
  /** Code prop the Figma property becomes, when there is one. */
  code?: string;
  shape: 'enum' | 'boolean' | 'inverted' | 'axis-to-boolean' | 'text' | 'children' | 'slot' | 'state' | 'none';
  /** Figma value -> code. null: no counterpart in code. */
  values?: Record<string, ValueTarget | null>;
  confidence: 'high' | 'medium' | 'low';
  reason: string;
}

export interface CodeMapEntry {
  component: string;
  export: string;
  found: boolean;
  mappings: PropMapping[];
  /** Code props no Figma property maps to (documented from code only). */
  codeOnly: string[];
  /** Figma items with no code counterpart, and other points for review. */
  conflicts: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '');
const SIZE: Record<string, string> = { '2xlarge': '2xl', xxlarge: '2xl', '2xl': '2xl', xxl: '2xl', xlarge: 'xl', extralarge: 'xl', xl: 'xl', large: 'lg', lg: 'lg', l: 'lg', medium: 'md', md: 'md', m: 'md', small: 'sm', sm: 'sm', s: 'sm', xsmall: 'xs', extrasmall: 'xs', xs: 'xs', '2xsmall': '2xs', xxsmall: '2xs', '2xs': '2xs' };
const canon = (s: string) => SIZE[norm(s)] ?? norm(s);
const words = (s: string) => s.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const PREFIX = new Set(['has', 'is', 'show', 'with', 'enable', 'enabled', 'hide', 'should']);
const SYNONYM: Record<string, string> = { error: 'invalid', warning: 'warn', message: 'text', caption: 'text' };
const core = (s: string) => words(s).filter((w) => !PREFIX.has(w)).map((w) => SYNONYM[w] ?? w);
/** "Show label" vs hideLabel: the same words, opposite meaning. */
const NEGATIVE = new Set(['hide', 'hidden', 'disable', 'no', 'without']);
const inverted = (figma: string, code: string) => words(figma).some((w) => NEGATIVE.has(w)) !== words(code).some((w) => NEGATIVE.has(w));
const APPEARANCE = new Set(['kind', 'variant', 'style', 'type', 'appearance', 'emphasis', 'intent', 'hierarchy', 'color', 'colour', 'theme']);
const PSEUDO: Record<string, string> = { hover: 'hover', hovered: 'hover', focus: 'focus', focused: 'focus', active: 'pressed', pressed: 'pressed', focusvisible: 'focus' };
/** Figma state value -> usual code boolean names. */
const STATE_PROPS: Record<string, string[]> = {
  disabled: ['disabled'], error: ['invalid', 'error', 'hasError'], invalid: ['invalid'], warning: ['warn', 'warning'], warn: ['warn'],
  readonly: ['readOnly'], selected: ['isSelected', 'selected'], checked: ['checked'], open: ['open', 'isOpen'], expanded: ['open', 'expanded', 'isExpanded'],
  loading: ['loading', 'isLoading', 'busy'], indeterminate: ['indeterminate'], required: ['required'],
};

const sameWords = (a: string[], b: string[]) => a.length > 0 && a.length === b.length && a.every((w) => b.includes(w));
const nameScore = (figma: string, code: string) => {
  if (norm(figma) === norm(code)) return 1;
  if (sameWords(core(figma), core(code))) return 0.9;
  if (APPEARANCE.has(norm(figma)) && APPEARANCE.has(norm(code))) return 0.5;
  return 0;
};

function enumMatch(options: string[], code: string[]): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const o of options) out[o] = code.find((c) => canon(c) === canon(o)) ?? code.find((c) => sameWords(words(c), words(o)));
  return out;
}

/** A boolean prop whose name holds the value's words: "Icon only" -> hasIconOnly, "Expressive" -> isExpressive. */
const booleanFor = (value: string, props: ApiProp[], used: Set<string>) => {
  const v = core(value);
  return props.find((p) => p.type.kind === 'boolean' && !used.has(p.name) && v.length > 0 && sameWords(v, core(p.name)));
};

export function mapComponent(component: string, sets: IRComponentSet[], api: ComponentApi, exportsList: string[] = []): CodeMapEntry {
  const entry: CodeMapEntry = { component, export: api.export, found: api.found, mappings: [], codeOnly: [], conflicts: [] };
  if (!api.found) { entry.conflicts.push(`No export "${api.export}" in code: the Figma API is kept.`); return entry; }
  const props = api.props;
  const used = new Set<string>();
  const take = (m: PropMapping) => { entry.mappings.push(m); if (m.code) used.add(m.code); for (const t of Object.values(m.values ?? {})) if (t && 'prop' in t) used.add(t.prop); };
  const all = sets.flatMap((s) => s.properties);
  // Variant properties first (their values decide the most), then booleans, text and slots.
  const order = (p: IRProperty) => ({ VARIANT: 0, TEXT: 1, BOOLEAN: 2, INSTANCE_SWAP: 3 })[p.type];
  for (const p of [...all].sort((a, b) => order(a) - order(b))) {
    const base = { figma: p.name, figmaType: p.type };
    if (p.type === 'VARIANT') {
      const opts = p.options ?? [];
      if (opts.length === 2 && opts.every((o) => /^(true|false)$/i.test(o))) {
        const b = props.find((c) => c.type.kind === 'boolean' && !used.has(c.name) && nameScore(p.name, c.name) >= 0.9);
        if (b && inverted(p.name, b.name)) take({ ...base, code: b.name, shape: 'inverted', confidence: 'medium', reason: `Opposite of ${b.name}.` });
        else if (b) take({ ...base, code: b.name, shape: 'boolean', confidence: 'high', reason: `Same name, both true/false.` });
        else take({ ...base, shape: 'none', confidence: 'low', reason: 'No boolean prop with this name in code.' });
        continue;
      }
      const isState = opts.some((o) => PSEUDO[norm(o)] || norm(o) === 'disabled');
      // Best enum prop: values in common first, then the name.
      let best: { prop: ApiProp; matched: Record<string, string | undefined>; score: number } | undefined;
      for (const c of props) {
        if (c.type.kind !== 'enum' || used.has(c.name)) continue;
        const matched = enumMatch(opts, c.type.options);
        const share = opts.filter((o) => matched[o]).length / Math.max(1, opts.filter((o) => !PSEUDO[norm(o)] && norm(o) !== 'disabled').length);
        const score = share + nameScore(p.name, c.name);
        if ((share >= 0.5 || (share > 0 && nameScore(p.name, c.name) >= 0.9)) && (!best || score > best.score)) best = { prop: c, matched, score };
      }
      const values: Record<string, ValueTarget | null> = {};
      const stateValue = (o: string): ValueTarget | null => {
        const n = norm(o);
        if (PSEUDO[n]) return { css: PSEUDO[n]! };
        const names = STATE_PROPS[n] ?? [];
        const b = props.find((c) => c.type.kind === 'boolean' && names.includes(c.name)) ?? (n === 'disabled' && api.inherited.includes('disabled') ? { name: 'disabled' } : undefined);
        if (b) return { prop: b.name, value: true };
        const own = booleanFor(o, props, used);
        if (own) return { prop: own.name, value: true };
        const comp = exportsList.find((e) => e === `${api.export}${o.replace(/[^A-Za-z0-9]/g, '')}`);
        return comp ? { component: comp } : null;
      };
      if (best) {
        for (const o of opts) {
          const m = best.matched[o];
          values[o] = m ? { value: m } : isState ? stateValue(o) : booleanFor(o, props, used) ? { prop: booleanFor(o, props, used)!.name, value: true } : null;
        }
        take({ ...base, code: best.prop.name, shape: 'enum', values, confidence: best.score >= 1.5 ? 'high' : 'medium', reason: `${opts.filter((o) => best!.matched[o]).length}/${opts.length} values match ${best.prop.name}${nameScore(p.name, best.prop.name) >= 0.9 ? ', same name' : ''}.` });
        continue;
      }
      if (isState) {
        for (const o of opts) values[o] = String(p.default) === o ? { value: 'base' } : stateValue(o);
        take({ ...base, shape: 'state', values, confidence: 'medium', reason: 'State property: hover, focus and pressed come from CSS; other values map to props or components.' });
        continue;
      }
      if (opts.length === 2) {
        for (const o of opts) {
          const b = booleanFor(o, props, used);
          if (!b) continue;
          const other = opts.find((x) => x !== o)!;
          take({ ...base, code: b.name, shape: 'axis-to-boolean', values: { [o]: { value: 'true' }, [other]: { value: 'false' } }, confidence: 'medium', reason: `"${o}" is the boolean ${b.name}.` });
          break;
        }
        if (entry.mappings.at(-1)?.figma === p.name) continue;
      }
      take({ ...base, shape: 'none', confidence: 'low', reason: 'No code prop has these values.' });
      continue;
    }
    if (p.type === 'BOOLEAN') {
      const b = props.find((c) => c.type.kind === 'boolean' && !used.has(c.name) && nameScore(p.name, c.name) >= 0.9);
      if (b && inverted(p.name, b.name)) { take({ ...base, code: b.name, shape: 'inverted', confidence: 'medium', reason: `Opposite of ${b.name}: Figma on is ${b.name}={false}.` }); continue; }
      if (b) { take({ ...base, code: b.name, shape: 'boolean', confidence: 'high', reason: 'Same name.' }); continue; }
      // A Figma toggle that shows a slot: the slot prop's presence in code ("Icon" -> renderIcon).
      const shares = (c: ApiProp) => core(c.name).some((w) => w !== 'text' && core(p.name).includes(w));
      const s = props.find((c) => (c.type.kind === 'node' || (c.type.kind === 'other' && c.type.text === 'component')) && shares(c)) ?? props.find((c) => c.type.kind === 'string' && shares(c));
      if (s) { take({ ...base, code: s.name, shape: 'slot', confidence: 'medium', reason: `Shown when ${s.name} is set.` }); continue; }
      take({ ...base, shape: 'none', confidence: 'low', reason: 'No code prop with this name: a Figma construction toggle, or missing in code.' });
      continue;
    }
    if (p.type === 'TEXT') {
      const texty = (c: ApiProp) => (c.type.kind === 'string' || c.type.kind === 'node') && !used.has(c.name);
      // "Tag text" on Tag is its `text`: the component's own name is not part of the property's name.
      const ownWords = new Set(words(api.export));
      const bare = core(p.name).filter((w) => !ownWords.has(w));
      const t = props.find((c) => texty(c) && nameScore(p.name, c.name) >= 0.9) ?? props.find((c) => texty(c) && sameWords(bare, core(c.name))) ?? props.find((c) => texty(c) && core(c.name).some((w) => core(p.name).includes(w) && w !== 'text'));
      if (t) { take({ ...base, code: t.name, shape: 'text', confidence: nameScore(p.name, t.name) >= 0.9 ? 'high' : 'medium', reason: 'Text prop with a matching name.' }); continue; }
      // Inputs and toggles hold a value, not content (a button inherits `value` too, so only these count).
      const formControl = props.some((c) => ['value', 'checked', 'toggled', 'defaultValue'].includes(c.name)) || api.inherited.some((n) => ['placeholder', 'checked', 'readOnly'].includes(n));
      if (api.accepts.children && !formControl && !used.has('children')) { take({ ...base, code: 'children', shape: 'children', confidence: 'medium', reason: 'The component takes children; the Figma text is its content.' }); continue; }
      take({ ...base, shape: 'none', confidence: 'low', reason: 'No text prop in code.' });
      continue;
    }
    // A swap whose visibility toggle already maps to a slot prop is that same slot.
    const slotOf = new Set(entry.mappings.filter((m) => m.shape === 'slot' && m.figmaType === 'BOOLEAN').map((m) => m.code));
    const s = props.find((c) => (!used.has(c.name) || slotOf.has(c.name)) && (c.type.kind === 'node' || (c.type.kind === 'other' && c.type.text === 'component')) && core(c.name).some((w) => core(p.name).includes(w)));
    if (s) take({ ...base, code: s.name, shape: 'slot', confidence: 'medium', reason: 'Slot prop with a matching name.' });
    else take({ ...base, shape: 'none', confidence: 'low', reason: 'No slot prop in code.' });
  }
  entry.codeOnly = props.map((p) => p.name).filter((n) => !used.has(n));
  for (const m of entry.mappings) {
    if (m.shape === 'none') entry.conflicts.push(`Figma "${m.figma}" has no counterpart in code (${m.reason})`);
    for (const [v, t] of Object.entries(m.values ?? {})) if (t === null) entry.conflicts.push(`Figma ${m.figma}=${v} has no counterpart in code${m.code ? ` (${m.code})` : ''}.`);
  }
  return entry;
}

/** Mappings the generator applies today: the generated component takes the code prop and value names. Children, slots,
 * inverted toggles and state props are listed for review; the generated component keeps Figma's shape for them. */
export const applied = (m: PropMapping) => Boolean(m.code) && ((m.shape === 'enum' || m.shape === 'axis-to-boolean') || (m.shape === 'boolean' && (m.figmaType === 'BOOLEAN' || m.figmaType === 'VARIANT')));

/** CODE-MAP.md: for review in the pull request. */
export function codeMapReport(entries: CodeMapEntry[], from: string): string {
  const fmt = (t: ValueTarget | null) => (!t ? '—' : 'value' in t && !('prop' in t) ? `\`${t.value}\`` : 'prop' in t ? `\`${t.prop}={${JSON.stringify(t.value)}}\`` : 'component' in t ? `<\`${t.component}\`>` : `CSS :${t.css}`);
  const found = entries.filter((e) => e.found);
  const lines = [
    '# Figma to code map',
    '',
    `Code mode: the API of each component comes from \`${from}\` (code wins for prop names, value names and shapes); visuals and tokens come from Figma. Review the mappings below; anything wrong can be corrected in ds-sync.decisions.json. "Applied": the generated component uses the code name; "listed": noted for review, Figma's shape is kept.`,
    '',
    `- Components with a code counterpart: ${found.length}/${entries.length}`,
    `- Figma properties mapped: ${found.reduce((n, e) => n + e.mappings.filter((m) => m.shape !== 'none').length, 0)}/${found.reduce((n, e) => n + e.mappings.length, 0)}`,
    `- Code-only props (documented from code): ${found.reduce((n, e) => n + e.codeOnly.length, 0)}`,
    '',
  ];
  if (entries.length > found.length) lines.push(`Not in code (Figma API kept): ${entries.filter((e) => !e.found).map((e) => e.component).join(', ')}`, '');
  for (const e of found) {
    lines.push(`## ${e.component} → \`${e.export}\``, '', '| Figma | Code | How | Values | Confidence | Applied |', '| --- | --- | --- | --- | --- | --- |');
    for (const m of e.mappings) lines.push(`| ${m.figma} | ${m.code ? `\`${m.code}\`` : '—'} | ${m.reason} | ${m.values ? Object.entries(m.values).map(([v, t]) => `${v} → ${fmt(t)}`).join('<br>') : ''} | ${m.confidence} | ${applied(m) ? 'yes' : m.code ? 'listed' : ''} |`);
    lines.push('');
    if (e.codeOnly.length) lines.push(`Only in code: ${e.codeOnly.map((n) => `\`${n}\``).join(', ')}`, '');
    if (e.conflicts.length) lines.push('For review:', '', ...e.conflicts.map((c) => `- ${c}`), '');
  }
  return lines.join('\n') + '\n';
}

// The map applied to generation: set name -> Figma property -> mapping. Code wins for the API; a reviewed decision
// (ds-sync.decisions.json) still wins over code, so a wrong mapping can be corrected.
let ACTIVE = new Map<string, Map<string, PropMapping>>();

export function setActiveCodeMap(entries: { sets: IRComponentSet[]; entry: CodeMapEntry }[]): void {
  ACTIVE = new Map();
  for (const { sets, entry } of entries) {
    if (!entry.found) continue;
    for (const s of sets) ACTIVE.set(s.name, new Map(entry.mappings.filter((m) => s.properties.some((p) => p.name === m.figma)).map((m) => [m.figma, m])));
  }
}

/** How a Figma variant property appears in code: its prop, each Figma value's code value, and whether it is a boolean. */
export function codeAxis(set: Pick<IRComponentSet, 'name'>, figma: string): { prop: string; value: (figmaValue: string) => string | undefined; boolean: boolean } | undefined {
  const m = ACTIVE.get(set.name)?.get(figma);
  if (!m?.code || !(m.shape === 'enum' || m.shape === 'axis-to-boolean' || m.shape === 'boolean')) return undefined;
  const direct = Object.fromEntries(Object.entries(m.values ?? {}).flatMap(([k, t]) => (t && 'value' in t && !('prop' in t) ? [[k, t.value]] : [])));
  // Two Figma values on one code value would merge two designs: keep Figma's names then.
  if (new Set(Object.values(direct)).size !== Object.values(direct).length) return undefined;
  return { prop: m.code, value: (v) => direct[v], boolean: m.shape !== 'enum' };
}

/** Code name of a Figma boolean property, when code has the same boolean. */
export function codeBoolean(set: Pick<IRComponentSet, 'name'>, figma: string): string | undefined {
  const m = ACTIVE.get(set.name)?.get(figma);
  return m?.shape === 'boolean' && m.figmaType === 'BOOLEAN' ? m.code : undefined;
}
