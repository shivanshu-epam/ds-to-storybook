// ds-sync: export this file's local variables in the format ds-sync reads
// (variables[collection] = [[name, type C|F|S, value | {mode: value}, WEB code syntax]], aliases as "@collection:name").
// Runs entirely inside Figma: no network access.

figma.showUI(__html__, { width: 420, height: 320 });

function hex(c) {
  const ch = (v) => Math.round(v * 255).toString(16).padStart(2, '0');
  return '#' + ch(c.r) + ch(c.g) + ch(c.b) + (c.a !== undefined && c.a < 1 ? ch(c.a) : '');
}

async function run() {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  const variables = await figma.variables.getLocalVariablesAsync();
  const collectionById = new Map(collections.map((c) => [c.id, c]));
  const variableById = new Map(variables.map((v) => [v.id, v]));
  const TYPES = { COLOR: 'C', FLOAT: 'F', STRING: 'S' };
  const out = {};
  let skipped = 0;

  async function convert(raw) {
    if (raw && typeof raw === 'object' && raw.type === 'VARIABLE_ALIAS') {
      // Aliases may point to library variables, which are not in the local list.
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
    if (!col || !type) {
      skipped++;
      continue;
    }
    let value;
    if (col.modes.length > 1) {
      value = {};
      for (const m of col.modes) value[m.name] = await convert(v.valuesByMode[m.modeId]);
    } else {
      value = await convert(v.valuesByMode[col.modes[0].modeId]);
    }
    (out[col.name] = out[col.name] || []).push([v.name, type, value, (v.codeSyntax && v.codeSyntax.WEB) || '']);
  }

  const json = JSON.stringify(
    {
      _source: 'Figma file "' + figma.root.name + '", exported by the ds-sync plugin on ' + new Date().toISOString().slice(0, 10) + '. Re-export rather than editing by hand.',
      variables: out,
    },
    null,
    2,
  );
  figma.ui.postMessage({ json, count: variables.length - skipped, collections: collections.length, skipped });
}

run().catch((err) => figma.ui.postMessage({ error: String(err && err.message ? err.message : err) }));
figma.ui.onmessage = (msg) => {
  if (msg && msg.type === 'close') figma.closePlugin();
};
