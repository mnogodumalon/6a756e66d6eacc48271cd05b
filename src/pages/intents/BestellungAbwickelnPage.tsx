/**
 * Bestellung abwickeln — 3-Schritt-Wizard.
 * Steps: 1) Offene Bestellung wählen → 2) Status & Fahrer bearbeiten → 3) Bestätigen & abschließen.
 * Reads: bestellverwaltung (gefiltert: nur neu|in_bearbeitung|bereit_zur_lieferung|unterwegs),
 *         fahrerverwaltung (verfuegbar + aktuell zugewiesen).
 * Writes: bestellverwaltung (updateBestellverwaltungEntry),
 *          fahrerverwaltung (updateFahrerverwaltungEntry — driver_status).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import {
  IconTruck,
  IconCheck,
  IconAlertCircle,
  IconPackage,
  IconMapPin,
  IconCurrencyEuro,
  IconUser,
  IconNotes,
} from '@tabler/icons-react';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// i18n
// ---------------------------------------------------------------------------
const tt = makeT({
  de: {
    title: 'Bestellung abwickeln', /* i18n-exempt */
    subtitle: 'Status aktualisieren und Lieferung koordinieren',
    step1: 'Bestellung',
    step2: 'Status & Fahrer',
    step3: 'Bestätigen',
    searchPlaceholder: 'Bestellung suchen…',
    emptyText: 'Keine offenen Bestellungen vorhanden', /* i18n-exempt */
    noSelection: 'Kein Auftrag ausgewählt — bitte neu starten.',
    restart: 'Neu starten',
    orderDate: 'Bestelldatum',
    status: 'Status',
    currentStatus: 'Aktueller Status',
    newStatus: 'Neuer Status',
    driver: 'Fahrer',
    noDriver: 'Kein Fahrer',
    keepDriver: 'Aktuellen Fahrer behalten',
    changeDriver: 'Fahrer wechseln / zuweisen',
    notes: 'Lieferhinweise',
    notesPlaceholder: 'Optionale Anmerkungen zur Lieferung…',
    next: 'Weiter',
    back: 'Zurück',
    confirm: 'Änderungen bestätigen',
    saving: 'Wird gespeichert…',
    successTitle: 'Bestellung aktualisiert',
    successMsg: 'Die Änderungen wurden erfolgreich gespeichert.',
    newOrder: 'Weitere Bestellung abwickeln',
    dashboard: 'Zurück zum Dashboard',
    summaryStatus: 'Neuer Status',
    summaryDriver: 'Fahrer',
    summaryNotes: 'Notizen',
    unchanged: '(unverändert)',
    noChange: 'Keine Änderung',
    orderedItems: 'Bestellte Artikel',
    totalAmount: 'Gesamtbetrag',
    deliveryAddress: 'Lieferadresse',
    errorSave: 'Fehler beim Speichern. Bitte erneut versuchen.',
    available: 'Verfügbar',
    currentAssigned: 'Aktuell zugewiesen',
    statusForward: 'Nur Vorwärts-Übergänge möglich',
    driverNote: 'Beim Wechsel zu "Unterwegs" wird der neue Fahrer auf "Im Einsatz" gesetzt.',
    driverFreeNote: 'Bei "Geliefert" oder "Storniert" wird der Fahrer wieder auf "Verfügbar" gesetzt.',
  },
  en: {
    title: 'Process Order', /* i18n-exempt */
    subtitle: 'Update status and coordinate delivery',
    step1: 'Order',
    step2: 'Status & Driver',
    step3: 'Confirm',
    searchPlaceholder: 'Search order…',
    emptyText: 'No open orders available', /* i18n-exempt */
    noSelection: 'No order selected — please restart.',
    restart: 'Restart',
    orderDate: 'Order date',
    status: 'Status',
    currentStatus: 'Current status',
    newStatus: 'New status',
    driver: 'Driver',
    noDriver: 'No driver',
    keepDriver: 'Keep current driver',
    changeDriver: 'Change / assign driver',
    notes: 'Delivery notes',
    notesPlaceholder: 'Optional notes for the delivery…',
    next: 'Next',
    back: 'Back',
    confirm: 'Confirm changes',
    saving: 'Saving…',
    successTitle: 'Order updated',
    successMsg: 'Changes have been saved successfully.',
    newOrder: 'Process another order',
    dashboard: 'Back to dashboard',
    summaryStatus: 'New status',
    summaryDriver: 'Driver',
    summaryNotes: 'Notes',
    unchanged: '(unchanged)',
    noChange: 'No change',
    orderedItems: 'Ordered items',
    totalAmount: 'Total amount',
    deliveryAddress: 'Delivery address',
    errorSave: 'Error saving. Please try again.',
    available: 'Available',
    currentAssigned: 'Currently assigned',
    statusForward: 'Only forward transitions allowed',
    driverNote: 'When switching to "On the way", the new driver is set to "On duty".',
    driverFreeNote: 'On "Delivered" or "Cancelled", the driver is set back to "Available".',
  },
  cs: {
    title: 'Zpracovat objednávku', /* i18n-exempt */
    subtitle: 'Aktualizovat stav a koordinovat doručení',
    step1: 'Objednávka',
    step2: 'Stav & Řidič',
    step3: 'Potvrdit',
    searchPlaceholder: 'Hledat objednávku…',
    emptyText: 'Žádné otevřené objednávky', /* i18n-exempt */
    noSelection: 'Žádná objednávka nevybrána — prosím restartujte.',
    restart: 'Restartovat',
    orderDate: 'Datum objednávky',
    status: 'Stav',
    currentStatus: 'Aktuální stav',
    newStatus: 'Nový stav',
    driver: 'Řidič',
    noDriver: 'Žádný řidič',
    keepDriver: 'Ponechat aktuálního řidiče',
    changeDriver: 'Změnit / přiřadit řidiče',
    notes: 'Poznámky k doručení',
    notesPlaceholder: 'Volitelné poznámky k doručení…',
    next: 'Další',
    back: 'Zpět',
    confirm: 'Potvrdit změny',
    saving: 'Ukládání…',
    successTitle: 'Objednávka aktualizována',
    successMsg: 'Změny byly úspěšně uloženy.',
    newOrder: 'Zpracovat další objednávku',
    dashboard: 'Zpět na přehled',
    summaryStatus: 'Nový stav',
    summaryDriver: 'Řidič',
    summaryNotes: 'Poznámky',
    unchanged: '(nezměněno)',
    noChange: 'Beze změny',
    orderedItems: 'Objednané položky',
    totalAmount: 'Celková částka',
    deliveryAddress: 'Adresa doručení',
    errorSave: 'Chyba při ukládání. Zkuste znovu.',
    available: 'Dostupný',
    currentAssigned: 'Aktuálně přiřazený',
    statusForward: 'Pouze přechody dopředu',
    driverNote: 'Při přechodu na „Na cestě" bude nový řidič nastaven na „Ve službě".',
    driverFreeNote: 'Při „Doručeno" nebo „Stornováno" bude řidič nastaven zpět na „Dostupný".',
  },
});

// ---------------------------------------------------------------------------
// Status transition rules (only forward)
// ---------------------------------------------------------------------------
const STATUS_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? [];
const STATUS_ORDER = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert', 'storniert'];

function getAllowedNextStatuses(currentKey: string): { key: string; label: string }[] {
  const currentIdx = STATUS_ORDER.indexOf(currentKey);
  if (currentIdx < 0) return STATUS_OPTIONS;
  // Allow current status + forward transitions; storniert is always reachable
  return STATUS_OPTIONS.filter(s => {
    const idx = STATUS_ORDER.indexOf(s.key);
    if (s.key === 'storniert') return currentKey !== 'storniert';
    return idx >= currentIdx;
  });
}

const ACTIVE_ORDER_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs']);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function BestellungAbwickelnPage() {
  const [searchParams] = useSearchParams();
  const { bestellverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  // Step state — init from URL
  const urlBestellungId = searchParams.get('bestellungId');
  const urlStep = parseInt(searchParams.get('step') ?? '1', 10);

  const [step, setStep] = useState(() => (urlBestellungId ? Math.max(urlStep, 2) : 1));
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(urlBestellungId);

  // Step 2 form state
  const [newStatusKey, setNewStatusKey] = useState<string>('');
  const [changeFahrer, setChangeFahrer] = useState(false);
  const [selectedFahrerId, setSelectedFahrerId] = useState<string>('none');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Submission state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // ---------------------------------------------------------------------------
  // Derived data
  // ---------------------------------------------------------------------------
  const openBestellungen = useMemo(
    () =>
      (bestellverwaltung as EnrichedBestellverwaltung[]).filter(
        b => b.fields.order_status && ACTIVE_ORDER_STATUSES.has(b.fields.order_status.key),
      ),
    [bestellverwaltung],
  );

  const selectedBestellung = useMemo(
    () =>
      selectedBestellungId
        ? (bestellverwaltung as EnrichedBestellverwaltung[]).find(
            b => b.record_id === selectedBestellungId,
          ) ?? null
        : null,
    [bestellverwaltung, selectedBestellungId],
  );

  const currentStatusKey = selectedBestellung?.fields.order_status?.key ?? '';
  const allowedStatuses = useMemo(
    () => getAllowedNextStatuses(currentStatusKey),
    [currentStatusKey],
  );

  // Fahrer: verfuegbar + aktuell zugewiesen
  const currentFahrerId = selectedBestellung?.fields.fahrer
    ? extractRecordId(selectedBestellung.fields.fahrer)
    : null;

  const availableFahrer = useMemo(
    () =>
      fahrerverwaltung.filter(f => {
        const statusKey = f.fields.driver_status?.key;
        return statusKey === 'verfuegbar' || f.record_id === currentFahrerId;
      }),
    [fahrerverwaltung, currentFahrerId],
  );

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------
  function handleSelectBestellung(id: string) {
    setSelectedBestellungId(id);
    const bestellung = (bestellverwaltung as EnrichedBestellverwaltung[]).find(
      b => b.record_id === id,
    );
    const curKey = bestellung?.fields.order_status?.key ?? '';
    const allowed = getAllowedNextStatuses(curKey);
    // Default to current status (no change)
    setNewStatusKey(curKey);
    setChangeFahrer(false);
    setSelectedFahrerId('none');
    setDeliveryNotes(bestellung?.fields.delivery_notes ?? '');
    void allowed; // used for display, not needed here
    setStep(2);
  }

  async function handleConfirm() {
    if (!selectedBestellung) return;
    setSaving(true);
    setSaveError(null);

    try {
      const bestellungId = selectedBestellung.record_id;
      const prevFahrerId = currentFahrerId;
      const newFahrerId = changeFahrer && selectedFahrerId !== 'none' ? selectedFahrerId : null;

      // Build update payload
      const payload: Record<string, unknown> = {
        order_status: newStatusKey || currentStatusKey,
        delivery_notes: deliveryNotes || undefined,
      };

      if (changeFahrer) {
        if (newFahrerId) {
          payload.fahrer = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, newFahrerId);
        } else {
          // Explicitly clear driver
          payload.fahrer = undefined;
        }
      }

      await LivingAppsService.updateBestellverwaltungEntry(bestellungId, payload);

      const effectiveStatusKey = (payload.order_status as string) ?? currentStatusKey;

      // Update driver statuses
      if (effectiveStatusKey === 'unterwegs' && newFahrerId) {
        // Free old driver if changed
        if (prevFahrerId && prevFahrerId !== newFahrerId) {
          await LivingAppsService.updateFahrerverwaltungEntry(prevFahrerId, {
            driver_status: 'verfuegbar',
          });
        }
        // Set new driver to im_einsatz
        await LivingAppsService.updateFahrerverwaltungEntry(newFahrerId, {
          driver_status: 'im_einsatz',
        });
      } else if (
        (effectiveStatusKey === 'geliefert' || effectiveStatusKey === 'storniert') &&
        prevFahrerId
      ) {
        // Free the driver
        await LivingAppsService.updateFahrerverwaltungEntry(prevFahrerId, {
          driver_status: 'verfuegbar',
        });
      }

      await fetchAll();
      setSaved(true);
      setStep(3);
    } catch {
      setSaveError(tt('errorSave'));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setSelectedBestellungId(null);
    setNewStatusKey('');
    setChangeFahrer(false);
    setSelectedFahrerId('none');
    setDeliveryNotes('');
    setSaved(false);
    setSaveError(null);
    setStep(1);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function formatDeliveryAddress(b: EnrichedBestellverwaltung): string {
    const f = b.fields;
    const parts = [
      f.delivery_street && f.delivery_house_number
        ? `${f.delivery_street} ${f.delivery_house_number}`
        : f.delivery_street,
      f.delivery_postal_code && f.delivery_city
        ? `${f.delivery_postal_code} ${f.delivery_city}`
        : f.delivery_city,
    ].filter(Boolean);
    return parts.join(', ') || '—';
  }

  function getFahrerName(id: string | null): string {
    if (!id) return tt('noDriver');
    const f = fahrerverwaltung.find(x => x.record_id === id);
    if (!f) return tt('noDriver');
    return [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || id;
  }

  const effectiveNewStatusKey = newStatusKey || currentStatusKey;
  const effectiveNewStatusLabel =
    STATUS_OPTIONS.find(s => s.key === effectiveNewStatusKey)?.label ?? effectiveNewStatusKey;

  const newFahrerIdForSummary =
    changeFahrer && selectedFahrerId !== 'none' ? selectedFahrerId : null;

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Step 1 — Bestellung wählen                                          */}
      {/* ------------------------------------------------------------------ */}
      {step === 1 && (
        <EntitySelectStep
          items={openBestellungen.map(b => ({
            id: b.record_id,
            title: b.kundeName || '—',
            subtitle: b.fields.order_date
              ? `${tt('orderDate')}: ${format(new Date(b.fields.order_date), 'dd.MM.yyyy', { locale: de })}`
              : '—',
            status: b.fields.order_status
              ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
              : undefined,
            stats: [
              ...(b.fields.total_amount != null
                ? [{ label: tt('totalAmount'), value: `${b.fields.total_amount.toFixed(2)} €` }]
                : []),
              ...(b.fahrerName ? [{ label: tt('driver'), value: b.fahrerName }] : []),
            ],
            icon: <IconTruck size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectBestellung}
          searchPlaceholder={tt('searchPlaceholder')}
          emptyText={tt('emptyText')}
          emptyIcon={<IconPackage size={32} className="text-muted-foreground" />}
        />
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Step 2 — Status & Fahrer                                            */}
      {/* ------------------------------------------------------------------ */}
      {step === 2 &&
        (selectedBestellung ? (
          <div className="space-y-6">
            {/* Bestelldetails */}
            <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
              <div className="flex items-center gap-2">
                <IconUser size={16} className="text-muted-foreground shrink-0" />
                <span className="font-medium truncate">
                  {(selectedBestellung as EnrichedBestellverwaltung).kundeName || '—'}
                </span>
              </div>

              {selectedBestellung.fields.ordered_items && (
                <div className="flex gap-2">
                  <IconPackage size={16} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground mb-1">{tt('orderedItems')}</p>
                    <p className="text-sm whitespace-pre-wrap break-words">
                      {selectedBestellung.fields.ordered_items}
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedBestellung.fields.total_amount != null && (
                  <div className="flex items-center gap-2">
                    <IconCurrencyEuro size={16} className="text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-xs text-muted-foreground">{tt('totalAmount')}</p>
                      <p className="font-semibold">
                        {selectedBestellung.fields.total_amount.toFixed(2)} €
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <IconMapPin size={16} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('deliveryAddress')}</p>
                    <p className="text-sm truncate">
                      {formatDeliveryAddress(selectedBestellung)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Status wählen */}
            <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
              <div className="space-y-1">
                <p className="text-sm font-medium">{tt('currentStatus')}</p>
                {selectedBestellung.fields.order_status && (
                  <StatusBadge
                    statusKey={selectedBestellung.fields.order_status.key}
                    label={selectedBestellung.fields.order_status.label}
                  />
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{tt('newStatus')}</label>
                <p className="text-xs text-muted-foreground">{tt('statusForward')}</p>
                <Select value={effectiveNewStatusKey} onValueChange={setNewStatusKey}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {allowedStatuses.map(s => (
                      <SelectItem key={s.key} value={s.key}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {effectiveNewStatusKey && (
                  <div className="pt-1">
                    <StatusBadge statusKey={effectiveNewStatusKey} label={effectiveNewStatusLabel} />
                  </div>
                )}
              </div>

              {/* Driver notes per status */}
              {effectiveNewStatusKey === 'unterwegs' && (
                <p className="text-xs text-muted-foreground bg-secondary rounded-lg px-3 py-2">
                  {tt('driverNote')}
                </p>
              )}
              {(effectiveNewStatusKey === 'geliefert' ||
                effectiveNewStatusKey === 'storniert') && (
                <p className="text-xs text-muted-foreground bg-secondary rounded-lg px-3 py-2">
                  {tt('driverFreeNote')}
                </p>
              )}
            </div>

            {/* Fahrer wechseln */}
            <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
              <p className="text-sm font-medium">{tt('driver')}</p>

              {currentFahrerId && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconUser size={14} className="shrink-0" />
                  <span>
                    {tt('currentAssigned')}: {getFahrerName(currentFahrerId)}
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <Button
                  variant={!changeFahrer ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => {
                    setChangeFahrer(false);
                    setSelectedFahrerId('none');
                  }}
                >
                  {tt('keepDriver')}
                </Button>
                <Button
                  variant={changeFahrer ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setChangeFahrer(true)}
                >
                  {tt('changeDriver')}
                </Button>
              </div>

              {changeFahrer && (
                <Select value={selectedFahrerId} onValueChange={setSelectedFahrerId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tt('noDriver')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tt('noDriver')}</SelectItem>
                    {availableFahrer.map(f => {
                      const name =
                        [f.fields.driver_first_name, f.fields.driver_last_name]
                          .filter(Boolean)
                          .join(' ') || f.record_id;
                      const isCurrent = f.record_id === currentFahrerId;
                      const statusLabel = isCurrent
                        ? tt('currentAssigned')
                        : tt('available');
                      return (
                        <SelectItem key={f.record_id} value={f.record_id}>
                          {name} ({statusLabel})
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Lieferhinweise */}
            <div className="rounded-2xl border bg-card p-5 space-y-3 overflow-hidden">
              <div className="flex items-center gap-2">
                <IconNotes size={16} className="text-muted-foreground" />
                <label className="text-sm font-medium">{tt('notes')}</label>
              </div>
              <Textarea
                value={deliveryNotes}
                onChange={e => setDeliveryNotes(e.target.value)}
                placeholder={tt('notesPlaceholder')}
                rows={3}
                className="w-full"
              />
            </div>

            {saveError && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <IconAlertCircle size={16} className="shrink-0" />
                {saveError}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                {tt('back')}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={saving}
                className="flex-1"
              >
                {saving ? tt('saving') : tt('confirm')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noSelection')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('restart')}
            </Button>
          </div>
        ))}

      {/* ------------------------------------------------------------------ */}
      {/* Step 3 — Zusammenfassung / Erfolg                                   */}
      {/* ------------------------------------------------------------------ */}
      {step === 3 &&
        (saved && selectedBestellung ? (
          <div className="space-y-6">
            {/* Erfolgsmeldung */}
            <div className="rounded-2xl border bg-card p-6 space-y-4 overflow-hidden text-center">
              <div className="flex justify-center">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <IconCheck size={24} className="text-primary" />
                </div>
              </div>
              <h2 className="font-semibold text-lg">{tt('successTitle')}</h2>
              <p className="text-sm text-muted-foreground">{tt('successMsg')}</p>
            </div>

            {/* Zusammenfassung */}
            <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
              <div className="flex items-center gap-2">
                <IconUser size={16} className="text-muted-foreground shrink-0" />
                <span className="font-medium truncate">
                  {(selectedBestellung as EnrichedBestellverwaltung).kundeName || '—'}
                </span>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">{tt('summaryStatus')}</span>
                  <StatusBadge statusKey={effectiveNewStatusKey} label={effectiveNewStatusLabel} />
                </div>

                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm text-muted-foreground">{tt('summaryDriver')}</span>
                  <span className="text-sm font-medium">
                    {newFahrerIdForSummary
                      ? getFahrerName(newFahrerIdForSummary)
                      : changeFahrer
                      ? tt('noDriver')
                      : getFahrerName(currentFahrerId)}
                  </span>
                </div>

                {deliveryNotes && (
                  <div className="space-y-1">
                    <span className="text-sm text-muted-foreground">{tt('summaryNotes')}</span>
                    <p className="text-sm bg-secondary rounded-lg px-3 py-2 break-words">
                      {deliveryNotes}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Aktionen */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={handleReset} className="flex-1">
                {tt('newOrder')}
              </Button>
              <a href="#/" className="flex-1">
                <Button className="w-full">{tt('dashboard')}</Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noSelection')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('restart')}
            </Button>
          </div>
        ))}
    </IntentWizardShell>
  );
}
