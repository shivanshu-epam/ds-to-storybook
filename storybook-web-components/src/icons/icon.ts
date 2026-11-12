import { html } from 'lit';
import { unsafeSVG } from 'lit/directives/unsafe-svg.js';

import { icons, type IconName } from './icons';

/** A Figma icon that fills its parent box and takes the parent's text colour. Decorative. */
export function icon(name: string) {
  const svg = icons[name as IconName];
  return svg ? html`<span aria-hidden="true" style="display:inline-flex;width:100%;height:100%">${unsafeSVG(svg)}</span>` : html``;
}
