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
    "Alle Fahrer verfügbar — kein aktiver Einsatz.": "All drivers available — no active duty.",
    "Als geliefert markieren": "Mark as Delivered",
    "Bereit zur Lieferung": "Ready for Delivery",
    "Bestellung": "Order",
    "Fahrer im Einsatz": "Drivers on Duty",
    "Fahrer verfügbar": "Drivers Available",
    "Fahrer zuweisen": "Assign Driver",
    "Frei melden": "Mark as Available",
    "Heute": "Today",
    "Im Einsatz": "On Duty",
    "In Bearbeitung nehmen": "Start Processing",
    "Keine Lieferungen unterwegs — alle Bestellungen erledigt.": "No deliveries en route — all orders completed.",
    "Keine offenen Bestellungen — alle Lieferungen erledigt.": "No open orders — all deliveries completed.",
    "Lieferung(en)": "Delivery/Deliveries",
    "Lieferungen unterwegs": "Deliveries En Route",
    "Neu": "New",
    "Neue Bestellung": "New Order",
    "Neuer Fahrer": "New Driver",
    "Unbekannter Kunde": "Unknown Customer",
    "Unterwegs": "En Route",
    "Unterwegs melden": "Mark as En Route",
    "Verfügbar": "Available",
    "{0} Lieferungen unterwegs, {1} Fahrer im Einsatz.": "{0} deliveries en route, {1} drivers on duty.",
    "{0} neue Bestellungen — {1} warten auf Bearbeitung.": "{0} new orders — {1} pending processing.",
    "{0} — frei gemeldet": "{0} — marked as available",
    "— neue Bestellungen ohne Fahrer.": "— new orders without driver.",
    "✓ Geliefert": "✓ Delivered"
  }
};
