interface DocSection { heading?: string; level: 3 | 4; paragraphs: string[] }
interface DocTab { title: string; nodeId: string; sections: DocSection[] }
interface Docs {
  component: string;
  figma: { fileKey: string; version: string; sets: { name: string; nodeId: string }[] };
  mapping: { prop: string; figma: string; note?: string }[];
  /** Generation caveats: what Figma did not specify, approximations. */
  notes?: string[];
  tabs: DocTab[];
}

const link = (fileKey: string, nodeId: string) => `https://www.figma.com/design/${fileKey}?node-id=${nodeId.replace(':', '-')}`;

/** Renders the component's Figma documentation frames verbatim, plus the Figma-to-code mapping. */
export function FigmaDocs({ docs }: { docs: Docs }) {
  return (
    <div>
      {docs.notes && docs.notes.length > 0 && (
        <>
          <h2>Generation notes</h2>
          <ul>{docs.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </>
      )}
      <h2>Figma to code</h2>
      <table>
        <thead><tr><th scope="col">Figma</th><th scope="col">Prop</th><th scope="col">Note</th></tr></thead>
        <tbody>
          {docs.mapping.map((m) => (
            <tr key={m.figma + m.prop}><td>{m.figma}</td><td><code>{m.prop}</code></td><td>{m.note ?? ''}</td></tr>
          ))}
        </tbody>
      </table>
      <p>
        Source: {docs.figma.sets.map((s, i) => (
          <span key={s.nodeId}>{i > 0 ? ', ' : ''}<a href={link(docs.figma.fileKey, s.nodeId)}>{s.name}</a></span>
        ))} (Figma version {docs.figma.version}).
      </p>
      {docs.tabs.map((tab) => (
        <section key={tab.nodeId}>
          <h2>{tab.title}</h2>
          {tab.sections.map((s, i) => (
            <div key={i}>
              {s.heading && (s.level === 3 ? <h3>{s.heading}</h3> : <h4>{s.heading}</h4>)}
              {s.paragraphs.map((p, k) => <p key={k} style={{ whiteSpace: 'pre-line' }}>{p}</p>)}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
