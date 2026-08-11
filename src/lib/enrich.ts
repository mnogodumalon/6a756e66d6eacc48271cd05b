import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Bestellverwaltung, Fahrerverwaltung, Kundenverwaltung } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface BestellverwaltungMaps {
  fahrerverwaltungMap: Map<string, Fahrerverwaltung>;
  kundenverwaltungMap: Map<string, Kundenverwaltung>;
}

export function enrichBestellverwaltung(
  bestellverwaltung: Bestellverwaltung[],
  maps: BestellverwaltungMaps
): EnrichedBestellverwaltung[] {
  return bestellverwaltung.map(r => ({
    ...r,
    fahrerName: resolveDisplay(r.fields.fahrer, maps.fahrerverwaltungMap, 'driver_first_name'),
    kundeName: resolveDisplay(r.fields.kunde, maps.kundenverwaltungMap, 'first_name', 'last_name'),
  }));
}
