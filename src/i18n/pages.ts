/**
 * src/i18n/pages.ts — page-text catalog (GENERATED — rewritten by the build
 * pipeline after every agent phase). NEVER edit, NEVER import directly:
 * the runtime reads it through tx() from '@/i18n'.
 *
 * Shape: { [locale]: { [sourceText]: translation } }. The build language
 * resolves to the source text itself and has no entry here; a missing key
 * falls back to the source text (fail-open).
 */
export const PAGES: Record<string, Record<string, string>> = {
  "en": {
    "Bearbeiten": "Edit",
    "Bestellung aktualisiert": "Order Updated",
    "Bestellung erstellt": "Order Created",
    "Fahrer": "Driver",
    "Fahrer aktualisiert": "Driver Updated",
    "Fahrer hinzufügen": "Add Driver",
    "Fahrer hinzugefügt": "Driver Added",
    "Fahrer verfügbar": "Driver Available",
    "Heute fällig": "Due Today",
    "Heute keine Lieferungen geplant": "No deliveries scheduled today",
    "Im Einsatz": "On Duty",
    "Kein Status": "No Status",
    "Keine Fahrer eingetragen": "No drivers registered",
    "Keine offenen Bestellungen — alles geliefert!": "No open orders — all delivered!",
    "Kunde aktualisiert": "Customer Updated",
    "Kunde erstellt": "Customer Created",
    "Neu": "New",
    "Neue Bestellung": "New Order",
    "Offen": "Open",
    "Unbekannt": "Unknown",
    "Unbekannter Kunde": "Unknown Customer",
    "Unterwegs": "In Transit",
    "Weiterschalten": "Advance",
    "{0} offene Bestellungen — {1} unterwegs": "{0} open orders — {1} in transit",
    "— {0} Bestellung(en) überfällig": "— {0} order(s) overdue"
  }
};
