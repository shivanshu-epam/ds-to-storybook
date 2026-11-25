// ds-sync Figma plugin. Runs entirely inside Figma: no network access, no API rate limits, every plan.
//
// "Export for ds-sync" writes figma-export.zip: the file as the Figma REST API would return it (one JSON file per
// page), its components, styles and variables (REST shapes), and renders (SVG of icons and shapes, PNG of every
// variant). ds-sync reads it instead of the REST API (figma.export in ds-sync.config.json).
// "Export variables only" writes figma-variables.json, the older variables-only format (generate.variablesExport).

const PLUGIN_VERSION = '0.2.0';
const FORMAT = 'ds-sync/figma-export@1';
const SHAPES = new Set(['VECTOR', 'BOOLEAN_OPERATION', 'ELLIPSE', 'LINE', 'STAR', 'REGULAR_POLYGON', 'POLYGON']);

figma.showUI(__html__, { width: 440, height: 380 });
figma.ui.postMessage({ type: 'ready', fileName: figma.root.name, pages: figma.root.children.map((p) => ({ id: p.id, name: p.name })) });

let cancelled = false;
figma.ui.onmessage = async (msg) => {
  if (msg.type === 'cancel') { cancelled = true; return; }
  try {
    if (msg.type === 'export') { cancelled = false; await exportFile(msg.options || {}); }
    else if (msg.type === 'variables') figma.ui.postMessage({ type: 'variables', json: await variablesJson() });
    else if (msg.type === 'close') figma.closePlugin();
  } catch (err) {
    figma.ui.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) });
  }
};

// ---------------------------------------------------------------------------------------------
// REST-shaped serialisation. Defaults the REST API omits are omitted here too.

const round = (n) => Math.round(n * 1000) / 1000;
const box = (b) => (b ? { x: round(b.x), y: round(b.y), width: round(b.width), height: round(b.height) } : null);
const alias = (a) => (a && a.type === 'VARIABLE_ALIAS' ? { type: 'VARIABLE_ALIAS', id: a.id } : undefined);
const mixed = (v) => v === figma.mixed;

/** Affine inverse of a 2x3 transform. */
function invert(t) {
  const [[a, b, c], [d, e, f]] = t;
  const det = a * e - b * d;
  return [[e / det, -b / det, (b * f - c * e) / det], [-d / det, a / det, (c * d - a * f) / det]];
}
const apply = (t, x, y) => ({ x: round(t[0][0] * x + t[0][1] * y + t[0][2]), y: round(t[1][0] * x + t[1][1] * y + t[1][2]) });

function paint(p) {
  const out = { type: p.type };
  if (p.visible === false) out.visible = false;
  if (p.opacity !== undefined && p.opacity < 1) out.opacity = round(p.opacity);
  if (p.blendMode && p.blendMode !== 'NORMAL' && p.blendMode !== 'PASS_THROUGH') out.blendMode = p.blendMode;
  if (p.type === 'SOLID') {
    out.color = { r: p.color.r, g: p.color.g, b: p.color.b, a: 1 };
    const c = p.boundVariables && alias(p.boundVariables.color);
    if (c) out.boundVariables = { color: c };
  } else if (p.type.startsWith('GRADIENT_')) {
    // REST gives handle positions; the plugin gives the transform from node space to gradient space.
    const inv = invert(p.gradientTransform);
    out.gradientHandlePositions = [apply(inv, 0, 0.5), apply(inv, 1, 0.5), apply(inv, 0, 1)];
    out.gradientStops = p.gradientStops.map((s) => ({ position: round(s.position), color: { r: s.color.r, g: s.color.g, b: s.color.b, a: s.color.a } }));
  } else if (p.type === 'IMAGE') {
    out.scaleMode = p.scaleMode;
  }
  return out;
}

function effect(e) {
  const out = { type: e.type };
  if (e.visible === false) out.visible = false;
  if (e.color) out.color = { r: e.color.r, g: e.color.g, b: e.color.b, a: e.color.a };
  if (e.offset) out.offset = { x: e.offset.x, y: e.offset.y };
  if (e.radius !== undefined) out.radius = e.radius;
  if (e.spread !== undefined) out.spread = e.spread;
  return out;
}

const H = { MIN: 'LEFT', MAX: 'RIGHT', CENTER: 'CENTER', STRETCH: 'LEFT_RIGHT', SCALE: 'SCALE' };
const V = { MIN: 'TOP', MAX: 'BOTTOM', CENTER: 'CENTER', STRETCH: 'TOP_BOTTOM', SCALE: 'SCALE' };

function boundVariables(node) {
  const bv = node.boundVariables;
  if (!bv) return undefined;
  const out = {};
  for (const [k, v] of Object.entries(bv)) {
    if (Array.isArray(v)) out[k] = v.map(alias).filter(Boolean);
    else if (v && v.type === 'VARIABLE_ALIAS') out[k] = alias(v);
    else if (v && typeof v === 'object') { const o = {}; for (const [kk, vv] of Object.entries(v)) { const a = alias(vv); if (a) o[kk] = a; } out[k] = o; }
  }
  return Object.keys(out).length ? out : undefined;
}

/** REST "style" of a text node: the first styled segment (mixed text reports its first run). */
function textStyle(node) {
  const [seg] = node.getStyledTextSegments(['fontName', 'fontSize', 'fontWeight', 'letterSpacing', 'lineHeight', 'textCase', 'textDecoration', 'fills']);
  if (!seg) return { style: {}, fills: [] };
  const size = seg.fontSize;
  const style = { fontFamily: seg.fontName.family, fontStyle: seg.fontName.style, fontWeight: seg.fontWeight, fontSize: size, textAlignHorizontal: node.textAlignHorizontal };
  const lh = seg.lineHeight;
  if (lh.unit === 'PIXELS') style.lineHeightPx = round(lh.value);
  else if (lh.unit === 'PERCENT') style.lineHeightPx = round((size * lh.value) / 100);
  else {
    // AUTO: the font's own line height. One line of text is the node's height.
    const lines = Math.max(1, Math.round(node.height / (size * 1.2)));
    style.lineHeightPx = round(node.height / lines);
  }
  const ls = seg.letterSpacing;
  if (ls.value) style.letterSpacing = round(ls.unit === 'PERCENT' ? (size * ls.value) / 100 : ls.value);
  if (seg.textCase && seg.textCase !== 'ORIGINAL') style.textCase = seg.textCase;
  if (seg.textDecoration && seg.textDecoration !== 'NONE') style.textDecoration = seg.textDecoration;
  return { style, fills: seg.fills };
}

/** Collected while serialising: the REST "components" and "componentSets" maps, what to render, and layers Figma
 * could not read (a broken component set, for example). Those are noted and skipped, never fatal. */
const ctx = { components: {}, componentSets: {}, svg: new Set(), png: new Set(), warnings: [], layers: 0, page: '' };

/** Figma runs plugins on its main thread: give it back regularly so the app stays responsive. */
async function breathe() {
  ctx.layers++;
  if (ctx.layers % 150 === 0) await new Promise((r) => setTimeout(r, 0));
  if (ctx.layers % 2000 === 0) figma.ui.postMessage({ type: 'progress', text: `${ctx.page}: ${ctx.layers.toLocaleString()} layers read` });
  if (cancelled) throw new Error('Export cancelled.');
}

/** Reads one property; a Figma error (a broken set, an unloaded font) becomes a warning instead of stopping. */
function safely(node, what, read) {
  try { return read(); } catch (e) {
    if (ctx.warnings.length < 500) ctx.warnings.push({ id: node.id, name: node.name, what, error: String(e && e.message ? e.message : e) });
    return undefined;
  }
}

function noteComponent(c) {
  if (!c || ctx.components[c.id]) return;
  const set = c.parent && c.parent.type === 'COMPONENT_SET' ? c.parent : null;
  ctx.components[c.id] = Object.assign({ key: c.key, name: c.name }, set ? { componentSetId: set.id } : {}, c.description ? { description: c.description } : {});
  if (set && !ctx.componentSets[set.id]) ctx.componentSets[set.id] = Object.assign({ key: set.key, name: set.name }, set.description ? { description: set.description } : {});
  // Icons (small, square, or named icon/...): ds-sync renders them as SVG.
  const b = c.absoluteBoundingBox;
  if (/^icons?\//i.test(c.name) || (b && b.width <= 48 && b.height <= 48 && Math.abs(b.width - b.height) <= 1)) ctx.svg.add(c.id);
}

async function serialize(node, inComponent) {
  await breathe();
  const out = { id: node.id, name: node.name, type: node.type };
  safely(node, 'properties', () => readProperties(node, out, inComponent));
  if (node.type === 'INSTANCE') {
    const main = await node.getMainComponentAsync().catch(() => null);
    if (main) { out.componentId = main.id; safely(main, 'component', () => noteComponent(main)); }
    safely(node, 'componentProperties', () => {
      const props = {};
      for (const [k, v] of Object.entries(node.componentProperties || {})) props[k] = { type: v.type, value: v.value };
      out.componentProperties = props;
    });
    safely(node, 'overrides', () => { if (node.overrides && node.overrides.length) out.overrides = node.overrides.map((o) => ({ id: o.id, overriddenFields: o.overriddenFields.slice() })); });
  }
  // ds-sync reads inside instances only within components (labels, icons, exposed properties). Elsewhere (doc pages,
  // example screens) an instance is kept without its contents: most of a large file, and none of it is used.
  const shallow = node.type === 'INSTANCE' && !inComponent;
  if ('children' in node && !shallow) {
    const inside = inComponent || node.type === 'COMPONENT' || node.type === 'COMPONENT_SET';
    out.children = [];
    for (const c of node.children) out.children.push(await serialize(c, inside));
  }
  return out;
}

/** Everything but children and instance links, synchronously, into out. */
function readProperties(node, out, inComponent) {
  if (node.visible === false) out.visible = false;
  if ('absoluteBoundingBox' in node) out.absoluteBoundingBox = box(node.absoluteBoundingBox);
  if ('absoluteRenderBounds' in node) out.absoluteRenderBounds = box(node.absoluteRenderBounds);
  if ('opacity' in node && node.opacity < 1) out.opacity = round(node.opacity);
  if ('rotation' in node && node.rotation) out.rotation = round((node.rotation * Math.PI) / 180);
  if ('description' in node && node.description && (node.type === 'COMPONENT' || node.type === 'COMPONENT_SET')) out.description = node.description;

  // Paints, strokes, effects
  if (node.type === 'TEXT') {
    const t = safely(node, 'text style', () => textStyle(node)) || { style: {}, fills: [] };
    out.characters = node.characters;
    out.style = t.style;
    out.fills = (t.fills || []).map(paint);
  } else if ('fills' in node && !mixed(node.fills)) out.fills = node.fills.map(paint);
  if ('strokes' in node) out.strokes = node.strokes.map(paint);
  if ('strokeWeight' in node) {
    if (!mixed(node.strokeWeight)) out.strokeWeight = node.strokeWeight;
    else if ('strokeTopWeight' in node) {
      out.strokeWeight = Math.max(node.strokeTopWeight, node.strokeRightWeight, node.strokeBottomWeight, node.strokeLeftWeight);
      out.individualStrokeWeights = { top: node.strokeTopWeight, right: node.strokeRightWeight, bottom: node.strokeBottomWeight, left: node.strokeLeftWeight };
    }
  }
  if ('strokeAlign' in node) out.strokeAlign = node.strokeAlign;
  if ('dashPattern' in node && node.dashPattern.length) out.strokeDashes = node.dashPattern.slice();
  if ('effects' in node && node.effects.length) out.effects = node.effects.map(effect);
  if ('cornerRadius' in node) {
    if (!mixed(node.cornerRadius)) { if (node.cornerRadius) out.cornerRadius = node.cornerRadius; }
    else if ('topLeftRadius' in node) out.rectangleCornerRadii = [node.topLeftRadius, node.topRightRadius, node.bottomRightRadius, node.bottomLeftRadius];
  }

  // Layout
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    out.layoutMode = node.layoutMode;
    out.itemSpacing = node.itemSpacing;
    out.paddingLeft = node.paddingLeft; out.paddingRight = node.paddingRight; out.paddingTop = node.paddingTop; out.paddingBottom = node.paddingBottom;
    out.primaryAxisAlignItems = node.primaryAxisAlignItems;
    out.counterAxisAlignItems = node.counterAxisAlignItems;
    if (node.layoutWrap === 'WRAP') out.layoutWrap = 'WRAP';
  }
  if ('layoutSizingHorizontal' in node) { try { out.layoutSizingHorizontal = node.layoutSizingHorizontal; out.layoutSizingVertical = node.layoutSizingVertical; } catch (e) { /* not in auto layout */ } }
  if ('layoutPositioning' in node && node.layoutPositioning === 'ABSOLUTE') out.layoutPositioning = 'ABSOLUTE';
  if ('constraints' in node && node.constraints) out.constraints = { horizontal: H[node.constraints.horizontal] || node.constraints.horizontal, vertical: V[node.constraints.vertical] || node.constraints.vertical };
  if ('clipsContent' in node && node.clipsContent) out.clipsContent = true;

  // Components
  if (node.type === 'COMPONENT_SET' || (node.type === 'COMPONENT' && !(node.parent && node.parent.type === 'COMPONENT_SET'))) {
    try { out.componentPropertyDefinitions = node.componentPropertyDefinitions; } catch (e) { /* broken set */ }
  }
  if (node.type === 'COMPONENT') { noteComponent(node); ctx.png.add(node.id); }
  if ('componentPropertyReferences' in node && node.componentPropertyReferences) out.componentPropertyReferences = node.componentPropertyReferences;
  if (node.type === 'INSTANCE' && node.isExposedInstance) out.isExposedInstance = true;
  if (inComponent && SHAPES.has(node.type)) ctx.svg.add(node.id);

  // Styles and variables
  const styles = {};
  for (const [field, key] of [['fillStyleId', 'fill'], ['strokeStyleId', 'stroke'], ['effectStyleId', 'effect'], ['textStyleId', 'text'], ['gridStyleId', 'grid']]) {
    if (field in node && node[field] && !mixed(node[field])) styles[key] = node[field];
  }
  if (Object.keys(styles).length) out.styles = styles;
  const bv = boundVariables(node);
  if (bv) out.boundVariables = bv;
}

// ---------------------------------------------------------------------------------------------
// Styles and variables

async function stylesAndNodes() {
  const styles = {};
  const nodes = {};
  const add = (s, type, node) => { styles[s.id] = Object.assign({ key: s.key, name: s.name, styleType: type, remote: false }, s.description ? { description: s.description } : {}); nodes[s.id] = Object.assign({ id: s.id, name: s.name }, node); };
  for (const s of await figma.getLocalPaintStylesAsync()) add(s, 'FILL', { type: 'RECTANGLE', fills: s.paints.map(paint) });
  for (const s of await figma.getLocalTextStylesAsync()) {
    const lh = s.lineHeight;
    const style = { fontFamily: s.fontName.family, fontStyle: s.fontName.style, fontSize: s.fontSize };
    if (lh.unit === 'PIXELS') style.lineHeightPx = lh.value;
    else if (lh.unit === 'PERCENT') style.lineHeightPx = round((s.fontSize * lh.value) / 100);
    if (s.letterSpacing.value) style.letterSpacing = round(s.letterSpacing.unit === 'PERCENT' ? (s.fontSize * s.letterSpacing.value) / 100 : s.letterSpacing.value);
    const weight = /thin|hairline/i.test(s.fontName.style) ? 100 : /extra ?light|ultra ?light/i.test(s.fontName.style) ? 200 : /light/i.test(s.fontName.style) ? 300 : /semi ?bold|demi ?bold/i.test(s.fontName.style) ? 600 : /extra ?bold|ultra ?bold/i.test(s.fontName.style) ? 800 : /bold/i.test(s.fontName.style) ? 700 : /black|heavy/i.test(s.fontName.style) ? 900 : /medium/i.test(s.fontName.style) ? 500 : 400;
    style.fontWeight = weight;
    add(s, 'TEXT', { type: 'TEXT', style });
  }
  for (const s of await figma.getLocalEffectStylesAsync()) add(s, 'EFFECT', { type: 'RECTANGLE', effects: s.effects.map(effect) });
  return { styles, nodes };
}

/** The Variables REST API response (GET /v1/files/:key/variables/local). */
async function variablesRest() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  const meta = { variables: {}, variableCollections: {} };
  for (const c of collections) meta.variableCollections[c.id] = { id: c.id, name: c.name, modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })), defaultModeId: c.defaultModeId, variableIds: c.variableIds.slice() };
  const add = (v) => {
    const valuesByMode = {};
    for (const [mode, val] of Object.entries(v.valuesByMode)) valuesByMode[mode] = val && typeof val === 'object' && val.type === 'VARIABLE_ALIAS' ? { type: 'VARIABLE_ALIAS', id: val.id } : val;
    meta.variables[v.id] = { id: v.id, name: v.name, variableCollectionId: v.variableCollectionId, resolvedType: v.resolvedType, codeSyntax: Object.assign({}, v.codeSyntax), valuesByMode, scopes: (v.scopes || []).slice(), remote: Boolean(v.remote) };
  };
  for (const v of variables) add(v);
  // Aliases can point to variables the local list leaves out (from a library, or hidden): follow them, so every alias
  // resolves. A target Figma no longer has stays missing; ds-sync then keeps the layer's own value.
  const pending = Object.values(meta.variables).flatMap((v) => Object.values(v.valuesByMode)).filter((x) => x && x.type === 'VARIABLE_ALIAS').map((x) => x.id);
  const tried = new Set();
  while (pending.length) {
    const id = pending.pop();
    if (meta.variables[id] || tried.has(id)) continue;
    tried.add(id);
    const v = await figma.variables.getVariableByIdAsync(id).catch(() => null);
    if (!v) continue;
    add(v);
    if (!meta.variableCollections[v.variableCollectionId]) {
      const c = await figma.variables.getVariableCollectionByIdAsync(v.variableCollectionId).catch(() => null);
      if (c) meta.variableCollections[c.id] = { id: c.id, name: c.name, modes: c.modes.map((m) => ({ modeId: m.modeId, name: m.name })), defaultModeId: c.defaultModeId, variableIds: (c.variableIds || []).slice(), remote: Boolean(c.remote) };
    }
    for (const val of Object.values(v.valuesByMode)) if (val && val.type === 'VARIABLE_ALIAS') pending.push(val.id);
  }
  return { status: 200, error: false, meta };
}

// ---------------------------------------------------------------------------------------------
// The export: pages one at a time, then renders, then the manifest. The UI zips and downloads.

async function exportFile(options) {
  const chosen = new Set(options.pages || figma.root.children.map((p) => p.id));
  const pages = figma.root.children.filter((p) => chosen.has(p.id));
  const scale = options.scale || 2;
  ctx.components = {}; ctx.componentSets = {}; ctx.svg = new Set(); ctx.png = new Set(); ctx.warnings = []; ctx.layers = 0;
  figma.ui.postMessage({ type: 'begin', total: pages.length });
  const pageList = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    ctx.page = `Page ${i + 1} of ${pages.length} (${page.name})`;
    figma.ui.postMessage({ type: 'progress', text: `${ctx.page}: loading` });
    // One page at a time: loading all pages of a large file at once holds them all in memory.
    await page.loadAsync();
    const children = [];
    for (const c of page.children) children.push(await serialize(c, false));
    const file = `pages/${i}.json`;
    figma.ui.postMessage({ type: 'entry', name: file, text: JSON.stringify({ id: page.id, name: page.name, type: 'CANVAS', children }) });
    pageList.push({ id: page.id, name: page.name, file });
  }

  const renders = { svg: [], png: { scale, ids: [] } };
  const safe = (id) => id.replace(/:/g, '-').replace(/;/g, '_');
  const render = async (ids, kind) => {
    let n = 0;
    for (const id of ids) {
      if (cancelled) throw new Error('Export cancelled.');
      if (++n % 25 === 0) figma.ui.postMessage({ type: 'progress', text: `Rendering ${kind.toUpperCase()} ${n} of ${ids.length}` });
      const node = await figma.getNodeByIdAsync(id);
      if (!node || !('exportAsync' in node)) continue;
      try {
        if (kind === 'svg') {
          const bytes = await node.exportAsync({ format: 'SVG', svgOutlineText: true, svgIdAttribute: false });
          figma.ui.postMessage({ type: 'entry', name: `svg/${safe(id)}.svg`, bytes });
          renders.svg.push(id);
        } else {
          const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: scale } });
          figma.ui.postMessage({ type: 'entry', name: `png/${safe(id)}@${scale}x.png`, bytes });
          renders.png.ids.push(id);
        }
      } catch (e) {
        // A node Figma cannot render: ds-sync treats it as "no render", like the API.
        if (ctx.warnings.length < 500) ctx.warnings.push({ id, name: node.name, what: `${kind} render`, error: String(e && e.message ? e.message : e) });
      }
    }
  };
  await render([...ctx.svg], 'svg');
  if (options.renders !== false) await render([...ctx.png], 'png');

  figma.ui.postMessage({ type: 'progress', text: 'Reading styles and variables' });
  const { styles, nodes } = await stylesAndNodes();
  const variables = await variablesRest();
  const manifest = {
    format: FORMAT, plugin: PLUGIN_VERSION, fileKey: figma.fileKey || '', fileName: figma.root.name, exportedAt: new Date().toISOString(),
    pages: pageList, components: ctx.components, componentSets: ctx.componentSets, styles, styleNodes: nodes, variables, renders,
    warnings: ctx.warnings,
  };
  figma.ui.postMessage({ type: 'entry', name: 'export.json', text: JSON.stringify(manifest) });
  figma.ui.postMessage({ type: 'done', summary: { pages: pageList.length, components: Object.keys(ctx.components).length, sets: Object.keys(ctx.componentSets).length, styles: Object.keys(styles).length, variables: Object.keys(variables.meta.variables).length, svg: renders.svg.length, png: renders.png.ids.length, layers: ctx.layers, warnings: ctx.warnings.length } });
}

// ---------------------------------------------------------------------------------------------
// The older variables-only format (generate.variablesExport).

function hex(c) {
  const ch = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + ch(c.r) + ch(c.g) + ch(c.b) + (c.a !== undefined && c.a < 1 ? ch(c.a) : '');
}

async function variablesJson() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  const collectionById = new Map(collections.map((c) => [c.id, c]));
  const variableById = new Map(variables.map((v) => [v.id, v]));
  const TYPES = { COLOR: 'C', FLOAT: 'F', STRING: 'S' };
  const out = {};
  async function convert(raw) {
    if (raw && typeof raw === 'object' && raw.type === 'VARIABLE_ALIAS') {
      const target = variableById.get(raw.id) || (await figma.variables.getVariableByIdAsync(raw.id));
      if (!target) return null;
      const col = collectionById.get(target.variableCollectionId) || (await figma.variables.getVariableCollectionByIdAsync(target.variableCollectionId));
      return col ? '@' + col.name + ':' + target.name : null;
    }
    if (raw && typeof raw === 'object' && 'r' in raw) return hex(raw);
    return raw;
  }
  for (const v of variables) {
    const col = collectionById.get(v.variableCollectionId);
    const type = TYPES[v.resolvedType];
    if (!col || !type) continue;
    let value;
    if (col.modes.length > 1) { value = {}; for (const m of col.modes) value[m.name] = await convert(v.valuesByMode[m.modeId]); }
    else value = await convert(v.valuesByMode[col.modes[0].modeId]);
    (out[col.name] = out[col.name] || []).push([v.name, type, value, (v.codeSyntax && v.codeSyntax.WEB) || '']);
  }
  return JSON.stringify({ _source: 'Figma file "' + figma.root.name + '", exported by the ds-sync plugin on ' + new Date().toISOString().slice(0, 10) + '. Re-export rather than editing by hand.', variables: out }, null, 2);
}
