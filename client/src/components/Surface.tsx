import type { HTMLAttributes, ReactNode } from 'react';

type SurfaceProps = HTMLAttributes<HTMLElement> & {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  as?: 'section' | 'div' | 'article';
};

export default function Surface({
  title,
  subtitle,
  actions,
  className = '',
  children,
  as = 'section',
  ...rest
}: SurfaceProps) {
  const Tag = as;

  return (
    <Tag className={`surface ${className}`.trim()} {...rest}>
      {(title || subtitle || actions) && (
        <div className="surface-header">
          <div className="surface-heading">
            {title ? <h2 className="surface-title">{title}</h2> : null}
            {subtitle ? <p className="surface-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="surface-actions">{actions}</div> : null}
        </div>
      )}
      {children}
    </Tag>
  );
}

