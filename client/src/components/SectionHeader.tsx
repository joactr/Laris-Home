import type { ReactNode } from 'react';

type SectionHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
};

export default function SectionHeader({ title, subtitle, actions, eyebrow }: SectionHeaderProps) {
  return (
    <header className="section-header-block">
      <div className="section-header-copy">
        {eyebrow ? <span className="section-eyebrow">{eyebrow}</span> : null}
        <h1 className="section-title-main">{title}</h1>
        {subtitle ? <p className="section-subtitle-main">{subtitle}</p> : null}
      </div>
      {actions ? <div className="section-header-actions">{actions}</div> : null}
    </header>
  );
}

