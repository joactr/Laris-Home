import type { HTMLAttributes, ReactNode } from 'react';

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  actions?: ReactNode;
  as?: 'section' | 'div' | 'article';
};

export default function Surface({
  title,
  actions,
  className = '',
  children,
  as = 'section',
  ...rest
}: SurfaceProps) {
  const Tag = as;

  return (
    <Tag className={`surface ${className}`.trim()} {...rest}>
      {(title || actions) && (
        <div className="surface-header">
          {title ? <h2 className="surface-title">{title}</h2> : null}
          {actions ? <div className="surface-actions">{actions}</div> : null}
        </div>
      )}
      {children}
    </Tag>
  );
}
