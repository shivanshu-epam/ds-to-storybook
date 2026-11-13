// JSX typings for React 19+, which passes props to custom elements as properties.
// Add this file to your React app's tsconfig "include" (or copy it into your project).
import type * as React from 'react';
import type { DsButton } from '../src/index';
import type { DsListItem } from '../src/index';
import type { DsCheckbox } from '../src/index';
import type { DsCheckboxGroup } from '../src/index';
import type { DsBadge } from '../src/index';
import type { DsBreadcrumbItem } from '../src/index';
import type { DsSeparator } from '../src/index';
import type { DsAccordion } from '../src/index';
import type { DsAccordionItem } from '../src/index';
import type { DsNavControl } from '../src/index';
import type { DsPaginationDot } from '../src/index';
import type { DsAutoplayToggle } from '../src/index';
import type { DsAvatarIdentity } from '../src/index';
import type { DsAvatarGlyph } from '../src/index';
import type { DsAlert } from '../src/index';
import type { DsDialog } from '../src/index';
import type { DsRadioControl } from '../src/index';
import type { DsRadioField } from '../src/index';
import type { DsRadioGroup } from '../src/index';
import type { DsDivider } from '../src/index';
import type { DsDatePicker } from '../src/index';
import type { DsSwitch } from '../src/index';
import type { DsInput } from '../src/index';
import type { DsDropdownTrigger } from '../src/index';
import type { DsDropdownMenu } from '../src/index';
import type { DsDropdown } from '../src/index';
import type { DsInputControl } from '../src/index';
import type { DsInputField } from '../src/index';
import type { DsForm } from '../src/index';

type El<T, P> = React.DetailedHTMLProps<React.HTMLAttributes<T>, T> & P;

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'ds-button': El<DsButton, { variant?: "primary" | "secondary" | "ghost" | "danger"; size?: "sm" | "md" | "lg"; radius?: "default" | "rounded" | "none"; disabled?: boolean; type?: 'button' | 'submit' | 'reset'; leadingIcon?: string | undefined; trailingIcon?: string | undefined; label?: string | undefined }>;
      'ds-list-item': El<DsListItem, { type?: "default" | "menu" | "file" | "setting"; state?: "default" | "selected" | "activated" | "dragged" | "skeleton"; size?: "sm" | "md" | "lg"; disabled?: boolean; hasLeadingControl?: boolean; hasTrailingControl?: boolean }>;
      'ds-checkbox': El<DsCheckbox, { size?: "sm" | "md" | "lg"; label?: string; heading?: string; checked?: boolean; indeterminate?: boolean; error?: string; invalid?: boolean; warning?: string; readOnly?: boolean; disabled?: boolean; name?: string; value?: string; accessibleLabel?: string }>;
      'ds-checkbox-group': El<DsCheckboxGroup, { legend?: string; orientation?: string; error?: string; warning?: string; readOnly?: boolean; disabled?: boolean }>;
      'ds-badge': El<DsBadge, { status?: "success" | "warning" | "error" | "info" | "neutral"; styleVariant?: "filled" | "outlined" | "subtle"; type?: "text" | "numeric" | "dot"; size?: "sm" | "md" | "lg"; hasLeadingIcon?: boolean; isDismissible?: boolean; label?: string }>;
      'ds-breadcrumb-item': El<DsBreadcrumbItem, { type?: "link" | "current" | "collapse"; disabled?: boolean; hasIcon?: boolean; label?: string }>;
      'ds-separator': El<DsSeparator, { type?: "slash" | "chevron" }>;
      'ds-accordion': El<DsAccordion, { variant?: "bordered" | "borderless"; expandMode?: 'single' | 'multiple'; headingLevel?: number; value?: string[] }>;
      'ds-accordion-item': El<DsAccordionItem, { value?: string; heading?: string; disabled?: boolean }>;
      'ds-nav-control': El<DsNavControl, { direction?: "prev" | "next"; disabled?: boolean }>;
      'ds-pagination-dot': El<DsPaginationDot, {  }>;
      'ds-autoplay-toggle': El<DsAutoplayToggle, { state?: "playing" | "paused" }>;
      'ds-avatar-identity': El<DsAvatarIdentity, { state?: "default" | "selected"; disabled?: boolean; hasName?: boolean; hasEmail?: boolean; hasTrailingIcon?: boolean; name?: string; email?: string }>;
      'ds-avatar-glyph': El<DsAvatarGlyph, { type?: "text" | "icon" | "image"; color?: "1" | "2" | "3" | "4" | "5"; size?: "sm" | "md" | "lg" }>;
      'ds-alert': El<DsAlert, { sentiment?: "danger" | "neutral" | "info" | "success" | "warning"; size?: "md" | "sm"; state?: "with-action-close" | "default" | "with-action" | "with-close" }>;
      'ds-dialog': El<DsDialog, { open?: boolean; modal?: boolean; type?: "confirmation" | "alert" | "form" | "full-screen" | "side-drawer"; size?: "small" | "medium" | "large" | "full"; state?: "open" | "loading" | "error"; hasCloseButton?: boolean; hasSecondaryAction?: boolean; hasSubtitle?: boolean; scrollableContent?: boolean; titleValue?: string; subtitle?: string; bodyContent?: string }>;
      'ds-radio-control': El<DsRadioControl, { checked?: boolean; name?: string | undefined; value?: string; accessibleLabel?: string | undefined; state?: "enabled" | "skeleton" | "read-only" | "invalid" | "warning"; disabled?: boolean }>;
      'ds-radio-field': El<DsRadioField, { label?: string | undefined; name?: string | undefined; value?: string; checked?: boolean; state?: "enabled" | "invalid" | "warning" | "read-only" | "skeleton"; position?: "left" | "right"; disabled?: boolean }>;
      'ds-radio-group': El<DsRadioGroup, { label?: string | undefined; name?: string | undefined; value?: string | undefined; state?: "enabled" | "read-only" | "invalid" | "warning"; horizontal?: boolean; disabled?: boolean }>;
      'ds-divider': El<DsDivider, { orientation?: "horizontal" | "vertical"; styleVariant?: "solid" | "dotted" | "dash"; size?: "sm" | "md"; color?: "light" | "dark" | "subtle" | "transparent" | "danger" | "success" | "neutral" | "warning" | "info"; state?: "default" | "selected"; disabled?: boolean }>;
      'ds-date-picker': El<DsDatePicker, { type?: "single" | "range" | "date-time"; state?: "default" | "filled" | "read-only" | "error"; disabled?: boolean; showCalendar?: boolean }>;
      'ds-switch': El<DsSwitch, { checked?: boolean; accessibleLabel?: string | undefined; name?: string | undefined; value?: string; interaction?: "default" | "loading"; size?: "medium" | "small"; disabled?: boolean; showInnerContent?: boolean }>;
      'ds-input': El<DsInput, { value?: string; type?: string; name?: string | undefined; maxlength?: number | undefined; autocomplete?: string | undefined; invalid?: boolean; appearance?: "outlined" | "filled" | "borderless" | "inline"; size?: "sm" | "md" | "lg"; state?: "default" | "error"; disabled?: boolean; required?: boolean; showLeadingIcon?: boolean; showTrailingIcon?: boolean; clearable?: boolean; showCharacterCount?: boolean; label?: string; placeholder?: string; helperText?: string; characterCount?: string }>;
      'ds-dropdown-trigger': El<DsDropdownTrigger, { size?: "small" | "medium" | "large"; state?: "default" | "error" | "read-only"; expanded?: boolean; disabled?: boolean; clearable?: boolean }>;
      'ds-dropdown-menu': El<DsDropdownMenu, { state?: "default" | "loading" | "empty"; showSearch?: boolean; grouped?: boolean }>;
      'ds-dropdown': El<DsDropdown, { size?: "small" | "medium" | "large"; state?: "collapsed" | "expanded" }>;
      'ds-input-control': El<DsInputControl, { state?: "default" | "filled" | "read-only" | "error" | "success" | "state9"; disabled?: boolean }>;
      'ds-input-field': El<DsInputField, { state?: "default" | "invalid" | "success" | "read-only"; disabled?: boolean; required?: boolean; helperMessage?: boolean; labelText?: string; valueText?: string; helperText?: string; errorText?: string; successText?: string }>;
      'ds-form': El<DsForm, { state?: "default" | "submitting" | "success" | "error"; disabled?: boolean }>;
    }
  }
}
