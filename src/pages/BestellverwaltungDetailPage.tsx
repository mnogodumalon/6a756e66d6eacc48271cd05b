import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import type { Bestellverwaltung, Fahrerverwaltung, Kundenverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { Button } from '@/components/ui/button';
import { IconArrowLeft, IconTrash } from '@tabler/icons-react';
import {
  RecordView, RecordHeader, RecordKeyFacts, RecordSection, RecordField,
  RecordAttachments, RecordViewSkeleton, RecordViewEmpty,
} from '@/components/widgets/RecordView';
import { BestellverwaltungDialog } from '@/components/dialogs/BestellverwaltungDialog';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { formEnhancements } from '@/config/form-enhancements/Bestellverwaltung';
import { evalComputed } from '@/config/form-enhancements/types';

export default function BestellverwaltungDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<Bestellverwaltung | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [fahrerverwaltungList, setFahrerverwaltungList] = useState<Fahrerverwaltung[]>([]);
  const [kundenverwaltungList, setKundenverwaltungList] = useState<Kundenverwaltung[]>([]);

  useEffect(() => { loadData(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  async function loadData() {
    setLoading(true);
    try {
      const [mainData, fahrerverwaltungData, kundenverwaltungData] = await Promise.all([
        LivingAppsService.getBestellverwaltung(),
        LivingAppsService.getFahrerverwaltung(),
        LivingAppsService.getKundenverwaltung(),
      ]);
      setFahrerverwaltungList(fahrerverwaltungData);
      setKundenverwaltungList(kundenverwaltungData);
      setRecord(mainData.find(r => r.record_id === id) ?? null);
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate(fields: Bestellverwaltung['fields']) {
    if (!record) return;
    await LivingAppsService.updateBestellverwaltungEntry(record.record_id, fields);
    await loadData();
    setEditing(false);
  }

  async function handleDelete() {
    if (!record) return;
    await LivingAppsService.deleteBestellverwaltungEntry(record.record_id);
    setDeleteOpen(false);
    navigate('/bestellverwaltung');
  }

  function getFahrerverwaltungDisplayName(url?: unknown) {
    if (!url) return '—';
    const refId = extractRecordId(url);
    return fahrerverwaltungList.find(r => r.record_id === refId)?.fields.driver_first_name ?? '—';
  }

  function getKundenverwaltungDisplayName(url?: unknown) {
    if (!url) return '—';
    const refId = extractRecordId(url);
    return kundenverwaltungList.find(r => r.record_id === refId)?.fields.first_name ?? '—';
  }

  if (loading) {
    return <RecordViewSkeleton />;
  }

  if (!record) {
    return (
      <RecordViewEmpty
        title="Eintrag nicht gefunden"
        action={
          <Button variant="ghost" onClick={() => navigate('/bestellverwaltung')}>
            <IconArrowLeft className="h-4 w-4 mr-1.5" />
            Zurück
          </Button>
        }
      />
    );
  }

  return (
    <RecordView
      onBack={() => navigate('/bestellverwaltung')}
      onEdit={() => setEditing(true)}
      backLabel="Zurück"
      editLabel="Bearbeiten"
    >
      <RecordHeader title={record.fields.delivery_street ?? 'Bestellverwaltung'} />

      {(() => {
        const lookupLists: Record<string, unknown> = {
          fahrer: fahrerverwaltungList,
          kunde: kundenverwaltungList,
        };
        const fmtComputed = (k: string, n: number) =>
          /(?:kosten|preis|betrag|gesamt|netto|brutto|summe|mwst|rabatt|anzahlung|umsatz|saldo)/i.test(k)
            ? n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
            : n.toLocaleString('de-DE', { maximumFractionDigits: 2 });
        const computedFacts = Object.entries(formEnhancements.computed)
          .map(([key, formula]) => {
            const v = evalComputed(formula, record!.fields as Record<string, unknown>, { lookupLists });
            return v != null
              ? { label: key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '), value: fmtComputed(key, v) }
              : null;
          })
          .filter((f): f is { label: string; value: string } => f !== null);
        return computedFacts.length > 0 ? <RecordKeyFacts items={computedFacts} /> : null;
      })()}

      <RecordSection title="Details" cols={2}>
        <RecordField label="Lieferfahrer" value={getFahrerverwaltungDisplayName(record.fields.fahrer)} format="text" />
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
        <RecordField label="Kunde" value={getKundenverwaltungDisplayName(record.fields.kunde)} format="text" />
        <RecordField label="Lieferstadt" value={record.fields.delivery_city} format="text" />
      </RecordSection>

      <RecordAttachments appId={APP_IDS.BESTELLVERWALTUNG} recordId={record.record_id} />

      <div className="flex justify-end pt-2">
        <Button variant="ghost" onClick={() => setDeleteOpen(true)} className="text-destructive hover:text-destructive">
          <IconTrash className="h-4 w-4 mr-1.5" />
          Löschen
        </Button>
      </div>

      <BestellverwaltungDialog
        open={editing}
        onClose={() => setEditing(false)}
        onSubmit={handleUpdate}
        defaultValues={record.fields}
        recordId={record.record_id}
        fahrerverwaltungList={fahrerverwaltungList}
        kundenverwaltungList={kundenverwaltungList}
        enablePhotoScan={AI_PHOTO_SCAN['Bestellverwaltung']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Bestellverwaltung']}
      />

      <ConfirmDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Bestellverwaltung löschen"
        description="Soll dieser Eintrag wirklich gelöscht werden? Diese Aktion kann nicht rückgängig gemacht werden."
      />
    </RecordView>
  );
}
