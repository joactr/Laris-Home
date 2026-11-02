import { t } from '../i18n';

interface StatusModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  details?: string | null;
  primaryText?: string;
  secondaryText?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
  onClose: () => void;
}

export default function StatusModal({
  isOpen,
  title,
  message,
  details,
  primaryText,
  secondaryText,
  onPrimary,
  onSecondary,
  onClose,
}: StatusModalProps) {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{title}</span>
          <button className="modal-close touch-target" onClick={onClose} aria-label={t('common.close')}>×</button>
        </div>
        <div className="modal-body">
          <p>{message}</p>
          {details && <div className="modal-details">{details}</div>}
        </div>
        <div className="modal-actions">
          {onSecondary && (
            <button className="btn btn-secondary" onClick={onSecondary}>
              {secondaryText || t('common.cancel')}
            </button>
          )}
          {onPrimary ? (
            <button className="btn btn-primary" onClick={onPrimary}>
              {primaryText || t('common.confirm')}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onClose}>
              {t('common.close')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
