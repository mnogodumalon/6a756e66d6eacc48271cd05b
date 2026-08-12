import type { Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
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
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('fahrerverwaltung', 'driver_first_name')} value={record.fields.driver_first_name} format="text" />
        <RecordField label={fieldLabel('fahrerverwaltung', 'driver_last_name')} value={record.fields.driver_last_name} format="text" />
        <RecordField label={fieldLabel('fahrerverwaltung', 'driver_phone')} value={record.fields.driver_phone} format="text" />
        <RecordField label={fieldLabel('fahrerverwaltung', 'driver_email')} value={record.fields.driver_email} format="email" />
        <RecordField label={fieldLabel('fahrerverwaltung', 'vehicle_type')} value={record.fields.vehicle_type} format="pill" />
        <RecordField label={fieldLabel('fahrerverwaltung', 'delivery_zone')} value={record.fields.delivery_zone} format="text" />
        <RecordField label={fieldLabel('fahrerverwaltung', 'driver_status')} value={record.fields.driver_status} format="pill" />
        <RecordField label={fieldLabel('fahrerverwaltung', 'work_start')} value={record.fields.work_start} format="text" />
        <RecordField label={fieldLabel('fahrerverwaltung', 'work_end')} value={record.fields.work_end} format="text" />
        <RecordField label={fieldLabel('fahrerverwaltung', 'driver_notes')} value={record.fields.driver_notes} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('bestellverwaltung')}
        items={bestellverwaltungList.filter(r => extractRecordId(r.fields.fahrer) === record.record_id)}
        map={r => ({ name: r.fields.delivery_street ?? appLabel('bestellverwaltung'), meta: r.fields.order_date })}
        onOpen={onOpenBestellverwaltung}
        onAdd={onAddBestellverwaltung}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.FAHRERVERWALTUNG} recordId={record.record_id} />
    </>
  );
}
