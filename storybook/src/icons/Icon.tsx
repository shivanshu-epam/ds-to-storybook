import { icons, type IconName } from './icons';

/** A Figma icon. It fills its parent box and takes the parent's text colour. Decorative by default. */
export function Icon({ name, label }: { name: IconName; label?: string }) {
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      style={{ display: 'inline-flex', width: '100%', height: '100%' }}
      dangerouslySetInnerHTML={{ __html: icons[name] }}
    />
  );
}
