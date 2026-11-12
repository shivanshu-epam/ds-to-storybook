// Fixture: a small Button with one code-only prop, a code-only size and a missing Figma option.
export type ButtonVariant = 'primary' | 'secondary';
export interface ButtonProps {
  variant?: ButtonVariant;
  /** xs is code-only. */
  size?: 'xs' | 'sm' | 'md';
  leadingIcon?: string;
  /** Spinner; not in Figma. */
  loading?: boolean;
  disabled?: boolean;
  children?: string;
}
export function Button({ variant = 'primary', size = 'md', loading = false, children }: ButtonProps) {
  return { variant, size, loading, children };
}
