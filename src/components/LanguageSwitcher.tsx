// Header language switcher — writes the locale to localStorage; LocaleGate
// in App.tsx remounts the tree so every t()/label lookup re-evaluates.
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
