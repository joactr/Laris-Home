import { enUS, es } from 'date-fns/locale';
import { getLanguage } from './index';

/** date-fns locale for the active UI language. */
export const dateLocale = () => (getLanguage() === 'es' ? es : enUS);

/** date-fns format strings that differ by language (Spanish needs the literal "de"). */
export const dateFormats = {
  /** "jueves 22 de octubre" / "Thursday, October 22" */
  weekdayDayMonth: () => (getLanguage() === 'es' ? "EEEE d 'de' MMMM" : 'EEEE, MMMM d'),
  /** "jueves, 22 de octubre" / "Thursday, October 22" */
  weekdayCommaDayMonth: () => (getLanguage() === 'es' ? "EEEE, d 'de' MMMM" : 'EEEE, MMMM d'),
};
