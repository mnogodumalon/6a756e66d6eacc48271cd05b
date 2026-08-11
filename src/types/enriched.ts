import type { Bestellverwaltung } from './app';

export type EnrichedBestellverwaltung = Bestellverwaltung & {
  fahrerName: string;
  kundeName: string;
};
