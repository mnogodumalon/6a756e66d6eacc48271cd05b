import type { Kundenverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';
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
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('kundenverwaltung', 'first_name')} value={record.fields.first_name} format="text" />
        <RecordField label={fieldLabel('kundenverwaltung', 'last_name')} value={record.fields.last_name} format="text" />
        <RecordField label={fieldLabel('kundenverwaltung', 'email')} value={record.fields.email} format="email" />
        <RecordField label={fieldLabel('kundenverwaltung', 'phone')} value={record.fields.phone} format="text" />
        <RecordField label={fieldLabel('kundenverwaltung', 'street')} value={record.fields.street} format="text" />
        <RecordField label={fieldLabel('kundenverwaltung', 'house_number')} value={record.fields.house_number} format="text" />
        <RecordField label={fieldLabel('kundenverwaltung', 'postal_code')} value={record.fields.postal_code} format="text" />
        <RecordField label={fieldLabel('kundenverwaltung', 'city')} value={record.fields.city} format="text" />
        <RecordField label={fieldLabel('kundenverwaltung', 'customer_since')} value={record.fields.customer_since} format="date" />
        <RecordField label={fieldLabel('kundenverwaltung', 'customer_status')} value={record.fields.customer_status} format="pill" />
        <RecordField label={fieldLabel('kundenverwaltung', 'notes')} value={record.fields.notes} format="longtext" className="md:col-span-2" />
      </RecordSection>

      <SatelliteSection
        title={appLabel('bestellverwaltung')}
        items={bestellverwaltungList.filter(r => extractRecordId(r.fields.kunde) === record.record_id)}
        map={r => ({ name: r.fields.delivery_street ?? appLabel('bestellverwaltung'), meta: r.fields.order_date })}
        onOpen={onOpenBestellverwaltung}
        onAdd={onAddBestellverwaltung}
        getKey={r => r.record_id}
      />

      <RecordAttachments appId={APP_IDS.KUNDENVERWALTUNG} recordId={record.record_id} />
    </>
  );
}
