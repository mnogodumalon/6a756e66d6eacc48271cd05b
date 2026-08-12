import type { Bestellverwaltung, Fahrerverwaltung, Kundenverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  RecordSection, RecordField, RecordRelation, RecordAttachments,
} from '@/components/widgets/RecordView';
import { t, appLabel, fieldLabel } from '@/i18n';

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
      <RecordSection title={t('details')} cols={2}>
        <RecordField label={fieldLabel('bestellverwaltung', 'delivery_notes')} value={record.fields.delivery_notes} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('bestellverwaltung', 'order_date')} value={record.fields.order_date} format="datetime" />
        <RecordField label={fieldLabel('bestellverwaltung', 'ordered_items')} value={record.fields.ordered_items} format="longtext" className="md:col-span-2" />
        <RecordField label={fieldLabel('bestellverwaltung', 'total_amount')} value={record.fields.total_amount} format="text" />
        <RecordField label={fieldLabel('bestellverwaltung', 'order_status')} value={record.fields.order_status} format="pill" />
        <RecordField label={fieldLabel('bestellverwaltung', 'payment_method')} value={record.fields.payment_method} format="pill" />
        <RecordField label={fieldLabel('bestellverwaltung', 'desired_delivery_time')} value={record.fields.desired_delivery_time} format="datetime" />
        <RecordField label={fieldLabel('bestellverwaltung', 'delivery_street')} value={record.fields.delivery_street} format="text" />
        <RecordField label={fieldLabel('bestellverwaltung', 'delivery_house_number')} value={record.fields.delivery_house_number} format="text" />
        <RecordField label={fieldLabel('bestellverwaltung', 'delivery_postal_code')} value={record.fields.delivery_postal_code} format="text" />
        <RecordField label={fieldLabel('bestellverwaltung', 'delivery_city')} value={record.fields.delivery_city} format="text" />
        <RecordField label={fieldLabel('bestellverwaltung', 'delivery_location')} value={record.fields.delivery_location?.info ?? (record.fields.delivery_location ? `${record.fields.delivery_location.lat}, ${record.fields.delivery_location.long}` : null)} />
      </RecordSection>

      {/* N:1 — verknüpfte Records: IMMER klickbar, nie eine Text-Sackgasse. */}
      <RecordSection title={t('relations')} cols={2}>
        <RecordRelation
          label={fieldLabel('bestellverwaltung', 'fahrer')}
          name={fahrerTarget?.fields.driver_first_name ?? '—'}
          meta={[fahrerTarget?.fields.driver_phone, fahrerTarget?.fields.driver_email].filter(Boolean).join(' · ') || undefined}
          onClick={fahrerTarget && onOpenFahrerverwaltung ? () => onOpenFahrerverwaltung!(fahrerTarget!) : undefined}
        />
        <RecordRelation
          label={fieldLabel('bestellverwaltung', 'kunde')}
          name={kundeTarget?.fields.first_name ?? '—'}
          meta={[kundeTarget?.fields.email, kundeTarget?.fields.phone].filter(Boolean).join(' · ') || undefined}
          onClick={kundeTarget && onOpenKundenverwaltung ? () => onOpenKundenverwaltung!(kundeTarget!) : undefined}
        />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.BESTELLVERWALTUNG} recordId={record.record_id} />
    </>
  );
}
