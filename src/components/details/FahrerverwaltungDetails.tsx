import type { Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { SatelliteSection } from '@/components/SatelliteSection';

export interface FahrerverwaltungDetailsProps {
  /** Der Record — enriched oder roh; alle Felder werden hier gerendert. */
  record: Fahrerverwaltung;
  /** 1:N „Bestellverwaltung": VOLLE Liste — der Block filtert auf diesen Record. */
  bestellverwaltungList: Bestellverwaltung[];
  /** Zeilen-Klick → overlay.push auf das Bestellverwaltung-Detail (nie der Edit-Dialog). */
  onOpenBestellverwaltung: (record: Bestellverwaltung) => void;
  /** Kontextuelles „+": öffnet den Bestellverwaltung-Dialog mit diesem Record vorgesetzt. */
  onAddBestellverwaltung: () => void;
}

export function FahrerverwaltungDetails({
  record,
  bestellverwaltungList,
  onOpenBestellverwaltung,
  onAddBestellverwaltung,
}: FahrerverwaltungDetailsProps) {
  return (
    <>
      <RecordSection title="Details" cols={2}>
        <RecordField label="Vorname" value={record.fields.driver_first_name} format="text" />
        <RecordField label="Nachname" value={record.fields.driver_last_name} format="text" />
        <RecordField label="Telefonnummer" value={record.fields.driver_phone} format="text" />
        <RecordField label="E-Mail-Adresse" value={record.fields.driver_email} format="email" />
        <RecordField label="Fahrzeugtyp" value={record.fields.vehicle_type} format="pill" />
        <RecordField label="Liefergebiet" value={record.fields.delivery_zone} format="text" />
        <RecordField label="Verfügbarkeitsstatus" value={record.fields.driver_status} format="pill" />
        <RecordField label="Arbeitsbeginn" value={record.fields.work_start} format="text" />
        <RecordField label="Arbeitsende" value={record.fields.work_end} format="text" />
        <RecordField label="Anmerkungen" value={record.fields.driver_notes} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title="Bestellverwaltung"
        items={bestellverwaltungList.filter(r => extractRecordId(r.fields.fahrer) === record.record_id)}
        map={r => ({ name: r.fields.delivery_street ?? 'Bestellverwaltung', meta: r.fields.order_date })}
        onOpen={onOpenBestellverwaltung}
        onAdd={onAddBestellverwaltung}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.FAHRERVERWALTUNG} recordId={record.record_id} />
    </>
  );
}
