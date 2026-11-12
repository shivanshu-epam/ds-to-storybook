import type { CSSProperties, ReactNode } from 'react';

const caption: CSSProperties = { fontSize: 12, lineHeight: '16px', color: 'inherit', opacity: 0.8, fontFamily: 'system-ui, sans-serif' };

/** A labelled grid for variant × state stories. Scrollable and keyboard-focusable when wider than the canvas. */
export function Matrix({ label, rows, columns, cell }: { label: string; rows: string[]; columns: string[]; cell: (row: string, column: string) => ReactNode }) {
  return (
    <div role="region" aria-label={label} tabIndex={0} style={{ overflowX: 'auto', maxWidth: '100%' }}>
      <table style={{ borderCollapse: 'separate', borderSpacing: 16 }}>
        <thead>
          <tr>
            <th scope="col" style={caption}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clipPath: 'inset(50%)' }}>Row</span></th>
            {columns.map((c) => <th key={c} scope="col" style={{ ...caption, textAlign: 'left' }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r}>
              <th scope="row" style={{ ...caption, textAlign: 'left', whiteSpace: 'nowrap' }}>{r}</th>
              {columns.map((c) => <td key={c}>{cell(r, c)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: 24 }}>{children}</div>;
}

export function Stack({ children }: { children: ReactNode }) {
  // Children stretch to the story width (e.g. an accordion fills its Figma width); their own content keeps its alignment.
  return <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 24 }}>{children}</div>;
}

export function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
      <span style={caption}>{label}</span>
      {children}
    </div>
  );
}
