import type { Bestellverwaltung, Fahrerverwaltung, Kundenverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';

export interface BestellverwaltungDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Bestellverwaltung;
  /** N:1-Ziel „Fahrerverwaltung": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  fahrerverwaltungList: Fahrerverwaltung[];
  /** Klick auf die Fahrerverwaltung-Relation → overlay.push auf dessen Detail. */
  onOpenFahrerverwaltung?: (record: Fahrerverwaltung) => void;
  /** N:1-Ziel „Kundenverwaltung": volle Liste (Hook-Array) — der Block löst Name + Schlüsselfelder selbst auf. */
  kundenverwaltungList: Kundenverwaltung[];
  /** Klick auf die Kundenverwaltung-Relation → overlay.push auf dessen Detail. */
  onOpenKundenverwaltung?: (record: Kundenverwaltung) => void;
}

export function BestellverwaltungDetails({
  record,
  fahrerverwaltungList,
  onOpenFahrerverwaltung,
  kundenverwaltungList,
  onOpenKundenverwaltung,
}: BestellverwaltungDetailsProps) {
  const fahrerTarget = fahrerverwaltungList.find(r => r.record_id === extractRecordId(record.fields.fahrer));
  const kundeTarget = kundenverwaltungList.find(r => r.record_id === extractRecordId(record.fields.kunde));
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Lieferhinweise" value={record.fields.delivery_notes} format="longtext" className="md:col-span-2" />
        <RecordField label="Bestelldatum und -uhrzeit" value={record.fields.order_date} format="datetime" />
        <RecordField label="Bestellte Artikel" value={record.fields.ordered_items} format="longtext" className="md:col-span-2" />
        <RecordField label="Gesamtbetrag (€)" value={record.fields.total_amount} format="text" />
        <RecordField label="Bestellstatus" value={record.fields.order_status} format="pill" />
        <RecordField label="Zahlungsmethode" value={record.fields.payment_method} format="pill" />
        <RecordField label="Gewünschter Lieferzeitpunkt" value={record.fields.desired_delivery_time} format="datetime" />
        <RecordField label="Lieferstraße" value={record.fields.delivery_street} format="text" />
        <RecordField label="Lieferhausnummer" value={record.fields.delivery_house_number} format="text" />
        <RecordField label="Lieferpostleitzahl" value={record.fields.delivery_postal_code} format="text" />
        <RecordField label="Lieferstadt" value={record.fields.delivery_city} format="text" />
        <RecordField label="Lieferort auf Karte" value={record.fields.delivery_location?.info ?? (record.fields.delivery_location ? `${record.fields.delivery_location.lat}, ${record.fields.delivery_location.long}` : null)} />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title="Verknüpft" cols={2}>
        <RecordRelation
          label="Lieferfahrer"
          name={fahrerTarget?.fields.driver_first_name ?? '—'}
          meta={[fahrerTarget?.fields.driver_phone, fahrerTarget?.fields.driver_email].filter(Boolean).join(' · ') || undefined}
          onClick={fahrerTarget && onOpenFahrerverwaltung ? () => onOpenFahrerverwaltung!(fahrerTarget!) : undefined}
        />
        <RecordRelation
          label="Kunde"
          name={kundeTarget?.fields.first_name ?? '—'}
          meta={[kundeTarget?.fields.email, kundeTarget?.fields.phone].filter(Boolean).join(' · ') || undefined}
          onClick={kundeTarget && onOpenKundenverwaltung ? () => onOpenKundenverwaltung!(kundeTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.BESTELLVERWALTUNG} recordId={record.record_id} />
    </>
  );
}
