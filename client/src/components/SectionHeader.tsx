import type { ReactNode } from 'react';

type SectionHeaderProps = {
  title: ReactNode;
  actions?: ReactNode;
};

/** Cabecera de página de primer nivel. El título debe coincidir con la etiqueta de navegación. */
export default function SectionHeader({ title, actions }: SectionHeaderProps) {
  return (
    <header className="section-header-block">
      <h1 className="section-title-main">{title}</h1>
      {actions ? <div className="section-header-actions">{actions}</div> : null}
    </header>
  );
}
