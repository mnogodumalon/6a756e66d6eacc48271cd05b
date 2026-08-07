// Header language switcher — needed ALONGSIDE the platform header's own
// switcher because that one only offers de/en (widget-library support set);
// this is the only UI path to Czech. setLocale persists the choice into the
// LA profile (PATCH /rest/user — production-verified) and into localStorage;
// LocaleGate remounts the tree, the platform widgets follow via <html lang>.
// Native <select>: renders in the OS layer, so the header's stacking context
// (z-header < z-overlay) can never trap the dropdown.
import { locale, setLocale, LOCALES, LOCALE_NAMES, type Locale } from '@/i18n';

export default function LanguageSwitcher(props: { slot?: string }) {
  return (
    <select
      {...props}
      value={locale}
      onChange={(e) => setLocale(e.target.value as Locale)}
      aria-label="Language"
      className="h-8 cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm text-secondary-foreground focus:outline-none"
    >
      {LOCALES.map((l) => (
        <option key={l} value={l}>
          {LOCALE_NAMES[l]}
        </option>
      ))}
    </select>
  );
}
