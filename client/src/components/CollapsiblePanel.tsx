import type { ReactNode } from 'react';

type CollapsiblePanelProps = {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  summary?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
  className?: string;
};

export default function CollapsiblePanel({
  id,
  title,
  subtitle,
  summary,
  open,
  onToggle,
  children,
  className = '',
}: CollapsiblePanelProps) {
  return (
    <section className={`surface collapsible-panel ${open ? 'open' : 'collapsed'} ${className}`.trim()}>
      <button
        type="button"
        className="collapsible-panel-trigger"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={id}
      >
        <div className="collapsible-panel-copy">
          <h2 className="surface-title">{title}</h2>
          {subtitle ? <p className="surface-subtitle">{subtitle}</p> : null}
        </div>
        <div className="collapsible-panel-aside">
          {summary ? <div className="collapsible-panel-summary">{summary}</div> : null}
          <span className="collapsible-panel-chevron" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="m7 10 5 5 5-5" />
            </svg>
          </span>
        </div>
      </button>

      {open ? (
        <div id={id} className="collapsible-panel-content">
          {children}
        </div>
      ) : null}
    </section>
  );
}
