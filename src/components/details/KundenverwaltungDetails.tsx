import type { Kundenverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface KundenverwaltungDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Kundenverwaltung;
  /** 1:N „Bestellverwaltung": VOLLE Liste — der Block filtert auf diesen Record. */
  bestellverwaltungList: Bestellverwaltung[];
  /** Zeilen-Klick → overlay.push auf das Bestellverwaltung-Detail (nie der Edit-Dialog). */
  onOpenBestellverwaltung: (record: Bestellverwaltung) => void;
  /** Kontextuelles „+": öffnet den Bestellverwaltung-Dialog mit diesem Record vorgesetzt. */
  onAddBestellverwaltung: () => void;
}

export function KundenverwaltungDetails({
  record,
  bestellverwaltungList,
  onOpenBestellverwaltung,
  onAddBestellverwaltung,
}: KundenverwaltungDetailsProps) {
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Vorname" value={record.fields.first_name} format="text" />
        <RecordField label="Nachname" value={record.fields.last_name} format="text" />
        <RecordField label="E-Mail-Adresse" value={record.fields.email} format="email" />
        <RecordField label="Telefonnummer" value={record.fields.phone} format="text" />
        <RecordField label="Straße" value={record.fields.street} format="text" />
        <RecordField label="Hausnummer" value={record.fields.house_number} format="text" />
        <RecordField label="Postleitzahl" value={record.fields.postal_code} format="text" />
        <RecordField label="Stadt" value={record.fields.city} format="text" />
        <RecordField label="Kunde seit" value={record.fields.customer_since} format="date" />
        <RecordField label="Kundenstatus" value={record.fields.customer_status} format="pill" />
        <RecordField label="Anmerkungen" value={record.fields.notes} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title="Bestellverwaltung"
        items={bestellverwaltungList.filter(r => extractRecordId(r.fields.kunde) === record.record_id)}
        map={r => ({ name: r.fields.delivery_street ?? 'Bestellverwaltung', meta: r.fields.order_date })}
        onOpen={onOpenBestellverwaltung}
        onAdd={onAddBestellverwaltung}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.KUNDENVERWALTUNG} recordId={record.record_id} />
    </>
  );
}
