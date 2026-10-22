import { getLanguage, setLanguage, t } from '../i18n';

export default function LanguageSwitch() {
  const lang = getLanguage();
  return (
    <div className="lang-switch" role="group" aria-label={t('shell.language')}>
      <button
        type="button"
        aria-pressed={lang === 'es'}
        className={lang === 'es' ? 'active' : ''}
        onClick={() => setLanguage('es')}
      >
        ES
      </button>
      <button
        type="button"
        aria-pressed={lang === 'en'}
        className={lang === 'en' ? 'active' : ''}
        onClick={() => setLanguage('en')}
      >
        EN
      </button>
    </div>
  );
}
