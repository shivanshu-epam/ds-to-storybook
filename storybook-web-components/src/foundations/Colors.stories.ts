import type { Meta, StoryObj } from '@storybook/web-components-vite';
import { html } from 'lit';

/** Semantic colour tokens from the Figma variables (switch modes in the toolbar). */
const TOKENS: { name: string; cssVar: string }[] = [
  {
    "name": "surface/bg/default",
    "cssVar": "--surface-bg-default"
  },
  {
    "name": "surface/bg/subtle",
    "cssVar": "--surface-bg-subtle"
  },
  {
    "name": "surface/bg/elevated",
    "cssVar": "--surface-bg-elevated"
  },
  {
    "name": "surface/bg/overlay",
    "cssVar": "--surface-bg-overlay"
  },
  {
    "name": "surface/bg/inverse",
    "cssVar": "--surface-bg-inverse"
  },
  {
    "name": "surface/bg/brand",
    "cssVar": "--surface-bg-brand"
  },
  {
    "name": "surface/bg/success",
    "cssVar": "--surface-bg-success"
  },
  {
    "name": "surface/bg/warning",
    "cssVar": "--surface-bg-warning"
  },
  {
    "name": "surface/bg/danger",
    "cssVar": "--surface-bg-danger"
  },
  {
    "name": "surface/bg/info",
    "cssVar": "--surface-bg-info"
  },
  {
    "name": "surface/bg/default/alpha-50",
    "cssVar": "--surface-bg-default-alpha-50"
  },
  {
    "name": "text/primary",
    "cssVar": "--text-primary"
  },
  {
    "name": "text/secondary",
    "cssVar": "--text-secondary"
  },
  {
    "name": "text/placeholder",
    "cssVar": "--text-placeholder"
  },
  {
    "name": "text/disabled",
    "cssVar": "--text-disabled"
  },
  {
    "name": "text/inverse",
    "cssVar": "--text-inverse"
  },
  {
    "name": "text/on-brand",
    "cssVar": "--text-on-brand"
  },
  {
    "name": "text/link",
    "cssVar": "--text-link"
  },
  {
    "name": "text/link/visited",
    "cssVar": "--text-link-visited"
  },
  {
    "name": "text/success",
    "cssVar": "--text-success"
  },
  {
    "name": "text/warning",
    "cssVar": "--text-warning"
  },
  {
    "name": "text/danger",
    "cssVar": "--text-danger"
  },
  {
    "name": "text/info",
    "cssVar": "--text-info"
  },
  {
    "name": "text/on-success",
    "cssVar": "--text-on-success"
  },
  {
    "name": "text/on-warning",
    "cssVar": "--text-on-warning"
  },
  {
    "name": "text/on-danger",
    "cssVar": "--text-on-danger"
  },
  {
    "name": "text/on-info",
    "cssVar": "--text-on-info"
  },
  {
    "name": "border/default",
    "cssVar": "--border-default"
  },
  {
    "name": "border/subtle",
    "cssVar": "--border-subtle"
  },
  {
    "name": "border/strong",
    "cssVar": "--border-strong"
  },
  {
    "name": "border/interactive/default",
    "cssVar": "--border-interactive-default"
  },
  {
    "name": "border/interactive/hover",
    "cssVar": "--border-interactive-hover"
  },
  {
    "name": "border/interactive/focus",
    "cssVar": "--border-interactive-focus"
  },
  {
    "name": "border/interactive/error",
    "cssVar": "--border-interactive-error"
  },
  {
    "name": "border/interactive/disabled",
    "cssVar": "--border-interactive-disabled"
  },
  {
    "name": "border/brand",
    "cssVar": "--border-brand"
  },
  {
    "name": "icon/default",
    "cssVar": "--icon-default"
  },
  {
    "name": "icon/subtle",
    "cssVar": "--icon-subtle"
  },
  {
    "name": "icon/inverse",
    "cssVar": "--icon-inverse"
  },
  {
    "name": "icon/on-brand",
    "cssVar": "--icon-on-brand"
  },
  {
    "name": "icon/success",
    "cssVar": "--icon-success"
  },
  {
    "name": "icon/warning",
    "cssVar": "--icon-warning"
  },
  {
    "name": "icon/danger",
    "cssVar": "--icon-danger"
  },
  {
    "name": "icon/info",
    "cssVar": "--icon-info"
  },
  {
    "name": "icon/on-success",
    "cssVar": "--icon-on-success"
  },
  {
    "name": "icon/on-warning",
    "cssVar": "--icon-on-warning"
  },
  {
    "name": "icon/on-danger",
    "cssVar": "--icon-on-danger"
  },
  {
    "name": "icon/on-info",
    "cssVar": "--icon-on-info"
  },
  {
    "name": "interactive/bg/primary/default",
    "cssVar": "--interactive-bg-primary-default"
  },
  {
    "name": "interactive/bg/primary/hover",
    "cssVar": "--interactive-bg-primary-hover"
  },
  {
    "name": "interactive/bg/primary/pressed",
    "cssVar": "--interactive-bg-primary-pressed"
  },
  {
    "name": "interactive/bg/primary/focused",
    "cssVar": "--interactive-bg-primary-focused"
  },
  {
    "name": "interactive/bg/primary/disabled",
    "cssVar": "--interactive-bg-primary-disabled"
  },
  {
    "name": "interactive/bg/secondary/default",
    "cssVar": "--interactive-bg-secondary-default"
  },
  {
    "name": "interactive/bg/secondary/hover",
    "cssVar": "--interactive-bg-secondary-hover"
  },
  {
    "name": "interactive/bg/secondary/pressed",
    "cssVar": "--interactive-bg-secondary-pressed"
  },
  {
    "name": "interactive/bg/secondary/focused",
    "cssVar": "--interactive-bg-secondary-focused"
  },
  {
    "name": "interactive/bg/secondary/disabled",
    "cssVar": "--interactive-bg-secondary-disabled"
  },
  {
    "name": "interactive/fg/primary/default",
    "cssVar": "--interactive-fg-primary-default"
  },
  {
    "name": "interactive/fg/primary/hover",
    "cssVar": "--interactive-fg-primary-hover"
  },
  {
    "name": "interactive/fg/primary/pressed",
    "cssVar": "--interactive-fg-primary-pressed"
  },
  {
    "name": "interactive/fg/primary/focused",
    "cssVar": "--interactive-fg-primary-focused"
  },
  {
    "name": "interactive/fg/primary/disabled",
    "cssVar": "--interactive-fg-primary-disabled"
  },
  {
    "name": "interactive/fg/secondary/default",
    "cssVar": "--interactive-fg-secondary-default"
  },
  {
    "name": "interactive/fg/secondary/hover",
    "cssVar": "--interactive-fg-secondary-hover"
  },
  {
    "name": "interactive/fg/secondary/pressed",
    "cssVar": "--interactive-fg-secondary-pressed"
  },
  {
    "name": "interactive/fg/secondary/focused",
    "cssVar": "--interactive-fg-secondary-focused"
  },
  {
    "name": "interactive/fg/secondary/disabled",
    "cssVar": "--interactive-fg-secondary-disabled"
  },
  {
    "name": "interactive/bg/activated",
    "cssVar": "--interactive-bg-activated"
  },
  {
    "name": "interactive/fg/activated",
    "cssVar": "--interactive-fg-activated"
  },
  {
    "name": "interactive/bg/drag",
    "cssVar": "--interactive-bg-drag"
  },
  {
    "name": "interactive/border/drag",
    "cssVar": "--interactive-border-drag"
  },
  {
    "name": "interactive/bg/readonly",
    "cssVar": "--interactive-bg-readonly"
  },
  {
    "name": "interactive/border/readonly",
    "cssVar": "--interactive-border-readonly"
  },
  {
    "name": "interactive/fg/readonly",
    "cssVar": "--interactive-fg-readonly"
  },
  {
    "name": "skeleton/bg",
    "cssVar": "--skeleton-bg"
  },
  {
    "name": "skeleton/shimmer",
    "cssVar": "--skeleton-shimmer"
  },
  {
    "name": "overlay/default",
    "cssVar": "--overlay-default"
  },
  {
    "name": "overlay/strong",
    "cssVar": "--overlay-strong"
  },
  {
    "name": "overlay/none",
    "cssVar": "--overlay-none"
  },
  {
    "name": "interactive/bg/danger/default",
    "cssVar": "--interactive-bg-danger-default"
  },
  {
    "name": "interactive/bg/danger/hover",
    "cssVar": "--interactive-bg-danger-hover"
  },
  {
    "name": "interactive/bg/danger/pressed",
    "cssVar": "--interactive-bg-danger-pressed"
  },
  {
    "name": "interactive/bg/danger/focused",
    "cssVar": "--interactive-bg-danger-focused"
  },
  {
    "name": "interactive/bg/danger/disabled",
    "cssVar": "--interactive-bg-danger-disabled"
  },
  {
    "name": "interactive/fg/danger/default",
    "cssVar": "--interactive-fg-danger-default"
  },
  {
    "name": "interactive/fg/danger/hover",
    "cssVar": "--interactive-fg-danger-hover"
  },
  {
    "name": "interactive/fg/danger/pressed",
    "cssVar": "--interactive-fg-danger-pressed"
  },
  {
    "name": "interactive/fg/danger/focused",
    "cssVar": "--interactive-fg-danger-focused"
  },
  {
    "name": "interactive/fg/danger/disabled",
    "cssVar": "--interactive-fg-danger-disabled"
  },
  {
    "name": "interactive/bg/ghost/default",
    "cssVar": "--interactive-bg-ghost-default"
  },
  {
    "name": "interactive/bg/ghost/hover",
    "cssVar": "--interactive-bg-ghost-hover"
  },
  {
    "name": "interactive/bg/ghost/pressed",
    "cssVar": "--interactive-bg-ghost-pressed"
  },
  {
    "name": "interactive/bg/ghost/focused",
    "cssVar": "--interactive-bg-ghost-focused"
  },
  {
    "name": "interactive/bg/ghost/disabled",
    "cssVar": "--interactive-bg-ghost-disabled"
  },
  {
    "name": "interactive/fg/ghost/default",
    "cssVar": "--interactive-fg-ghost-default"
  },
  {
    "name": "interactive/fg/ghost/hover",
    "cssVar": "--interactive-fg-ghost-hover"
  },
  {
    "name": "interactive/fg/ghost/pressed",
    "cssVar": "--interactive-fg-ghost-pressed"
  },
  {
    "name": "interactive/fg/ghost/focused",
    "cssVar": "--interactive-fg-ghost-focused"
  },
  {
    "name": "interactive/fg/ghost/disabled",
    "cssVar": "--interactive-fg-ghost-disabled"
  },
  {
    "name": "surface/bg/neutral",
    "cssVar": "--surface-bg-neutral"
  },
  {
    "name": "surface/bg/success/strong",
    "cssVar": "--surface-bg-success-strong"
  },
  {
    "name": "surface/bg/warning/strong",
    "cssVar": "--surface-bg-warning-strong"
  },
  {
    "name": "surface/bg/info/strong",
    "cssVar": "--surface-bg-info-strong"
  },
  {
    "name": "surface/bg/neutral/strong",
    "cssVar": "--surface-bg-neutral-strong"
  },
  {
    "name": "text/neutral",
    "cssVar": "--text-neutral"
  },
  {
    "name": "text/on-neutral",
    "cssVar": "--text-on-neutral"
  },
  {
    "name": "icon/neutral",
    "cssVar": "--icon-neutral"
  },
  {
    "name": "icon/on-neutral",
    "cssVar": "--icon-on-neutral"
  },
  {
    "name": "border/success",
    "cssVar": "--border-success"
  },
  {
    "name": "border/warning",
    "cssVar": "--border-warning"
  },
  {
    "name": "border/info",
    "cssVar": "--border-info"
  },
  {
    "name": "border/neutral",
    "cssVar": "--border-neutral"
  },
  {
    "name": "avatar/bg/1",
    "cssVar": "--avatar-bg-1"
  },
  {
    "name": "avatar/bg/2",
    "cssVar": "--avatar-bg-2"
  },
  {
    "name": "avatar/bg/3",
    "cssVar": "--avatar-bg-3"
  },
  {
    "name": "avatar/bg/4",
    "cssVar": "--avatar-bg-4"
  },
  {
    "name": "avatar/bg/5",
    "cssVar": "--avatar-bg-5"
  },
  {
    "name": "avatar/bg/icon",
    "cssVar": "--avatar-bg-icon"
  }
];

const meta = { title: 'Foundations/Colors', parameters: { layout: 'padded' } } satisfies Meta;
export default meta;

export const Semantic: StoryObj = {
  render: () => html`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px">
    ${TOKENS.map((t) => html`<div style="display:flex;align-items:center;gap:8px;font:12px system-ui,sans-serif">
      <span style="width:32px;height:32px;flex:none;border-radius:6px;background:var(${t.cssVar});box-shadow:inset 0 0 0 1px rgba(0,0,0,.15)"></span>
      <span><strong>${t.name}</strong><br /><code>${t.cssVar}</code></span></div>`)}
  </div>`,
};
