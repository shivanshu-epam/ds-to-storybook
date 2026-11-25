// A small component library for code-mode tests: a function, a forwardRef-style and a polymorphic component.
// Self-contained (no React types), so the reader is tested on the shapes, not on React's typings.
type Node = string | number | { type: unknown } | null | undefined;
type ElementType = string | ((props: never) => unknown);
declare function forwardRef<R, P>(render: (props: P, ref: R) => unknown): { (props: P & { ref?: R }): unknown; displayName?: string };

export interface ButtonProps {
  /** The kind of button. */
  kind?: 'primary' | 'secondary' | 'danger--primary' | 'ghost';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  hasIconOnly?: boolean;
  isExpressive?: boolean;
  disabled?: boolean;
  /**
   * Icon component.
   * @default undefined
   */
  renderIcon?: ElementType;
  children?: Node;
}
export const Button = forwardRef<{ focus(): void }, ButtonProps>(() => null);
export function ButtonSkeleton(_: { size?: 'sm' | 'md' }): unknown {
  return null;
}

export interface ToggleProps {
  labelText: string;
  labelA?: string;
  hideLabel?: boolean;
  toggled?: boolean;
  readOnly?: boolean;
  disabled?: boolean;
}
export function Toggle(_: ToggleProps): unknown {
  return null;
}

type Polymorphic<T, P> = P & { as?: T };
export const InlineNotification = <T = 'div'>(_: Polymorphic<T, { kind?: 'info' | 'error'; title?: string; children?: Node }>): unknown => null;

export const ButtonKinds = ['primary'] as const;
