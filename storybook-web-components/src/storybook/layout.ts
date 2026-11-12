import { html, type TemplateResult } from 'lit';

const caption = 'font: 12px/16px system-ui, sans-serif; opacity: .8;';

/** A labelled grid for variant × state stories. Scrollable and keyboard-focusable when wider than the canvas. */
export function matrix(label: string, rows: string[], columns: string[], cell: (row: string, column: string) => TemplateResult) {
  return html`<div role="region" aria-label=${label} tabindex="0" style="overflow-x:auto;max-width:100%">
    <table style="border-collapse:separate;border-spacing:16px">
      <thead><tr><th scope="col" style=${caption}><span style="position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)">Row</span></th>
        ${columns.map((c) => html`<th scope="col" style="${caption};text-align:left">${c}</th>`)}</tr></thead>
      <tbody>${rows.map((r) => html`<tr><th scope="row" style="${caption};text-align:left;white-space:nowrap">${r}</th>${columns.map((c) => html`<td>${cell(r, c)}</td>`)}</tr>`)}</tbody>
    </table>
  </div>`;
}

export const row = (items: TemplateResult[]) => html`<div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:24px">${items}</div>`;
export const stack = (items: TemplateResult[]) => html`<div style="display:flex;flex-direction:column;align-items:stretch;gap:24px">${items}</div>`;
export const labelled = (label: string, content: TemplateResult) =>
  html`<div style="display:flex;flex-direction:column;align-items:flex-start;gap:8px"><span style=${caption}>${label}</span>${content}</div>`;

/** Queries inside a component's Shadow DOM (testing-library does not cross shadow roots). */
export function shadowOf(root: Element, selector: string): ShadowRoot {
  const host = root.querySelector(selector);
  if (!host?.shadowRoot) throw new Error(`${selector} has no shadow root`);
  return host.shadowRoot;
}
