import type { ReactNode } from 'react';

type SectionHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
};

/** Cabecera de página de primer nivel. El título debe coincidir con la etiqueta de navegación. */
export default function SectionHeader({ title, subtitle, actions }: SectionHeaderProps) {
  return (
    <header className="section-header-block">
      <div className="section-header-copy">
        <h1 className="section-title-main">{title}</h1>
        {subtitle ? <p className="section-subtitle-main">{subtitle}</p> : null}
      </div>
      {actions ? <div className="section-header-actions">{actions}</div> : null}
    </header>
  );
}

