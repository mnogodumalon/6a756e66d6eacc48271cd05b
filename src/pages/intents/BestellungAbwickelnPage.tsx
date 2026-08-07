/**
 * Bestellung abwickeln — 3-Schritt-Wizard.
 * Steps: 1) Bestellung auswählen (Status: neu|in_bearbeitung|bereit_zur_lieferung)
 *        → 2) Fahrer zuweisen (nur driver_status=verfuegbar)
 *        → 3) Status setzen & abschließen (updateBestellverwaltungEntry).
 * Reads: bestellverwaltung, fahrerverwaltung, kundenverwaltung.
 * Writes: bestellverwaltung (updateBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconPackage, IconUser, IconCheck, IconTruck } from '@tabler/icons-react';
import { makeT } from '@/i18n';
import { format, parseISO } from 'date-fns';

// ── i18n ────────────────────────────────────────────────────────────────────
const tt = makeT({
  de: {
    title: 'Bestellung abwickeln', /* i18n-exempt */
    subtitle: 'Fahrer zuweisen und Status aktualisieren',
    step_order: 'Bestellung',
    step_driver: 'Fahrer',
    step_confirm: 'Abschließen',
    search_order: 'Bestellung suchen …',
    search_driver: 'Fahrer suchen …',
    no_orders: 'Keine aktiven Bestellungen gefunden',
    no_drivers: 'Keine verfügbaren Fahrer gefunden',
    order_date: 'Bestelldatum',
    items: 'Artikel',
    total: 'Gesamt',
    status: 'Status',
    driver_zone: 'Zone',
    driver_vehicle: 'Fahrzeug',
    new_status: 'Neuer Status',
    delivery_notes: 'Liefernotiz (optional)',
    delivery_notes_placeholder: 'Hinweise zur Lieferung …',
    summary_title: 'Zusammenfassung',
    summary_order: 'Bestellung vom',
    summary_driver: 'Fahrer',
    summary_status: 'Neuer Status',
    confirm_btn: 'Jetzt abschließen',
    submitting: 'Wird gespeichert …',
    success_title: 'Erfolgreich abgeschlossen',
    success_status: 'Status gesetzt auf',
    success_driver: 'Fahrer',
    new_order: 'Weitere Bestellung abwickeln',
    back_dashboard: 'Zurück zum Dashboard',
    step_missing: 'Dieser Schritt benötigt die Auswahl aus einem vorherigen Schritt.',
    restart: 'Neu starten',
    select_status_placeholder: 'Status wählen …',
    driver_required: 'Fahrer ist Pflicht für den Status "Unterwegs".',
  },
  en: {
    title: 'Process order', /* i18n-exempt */
    subtitle: 'Assign driver and update status',
    step_order: 'Order',
    step_driver: 'Driver',
    step_confirm: 'Finish',
    search_order: 'Search order …',
    search_driver: 'Search driver …',
    no_orders: 'No active orders found',
    no_drivers: 'No available drivers found',
    order_date: 'Order date',
    items: 'Items',
    total: 'Total',
    status: 'Status',
    driver_zone: 'Zone',
    driver_vehicle: 'Vehicle',
    new_status: 'New status',
    delivery_notes: 'Delivery notes (optional)',
    delivery_notes_placeholder: 'Notes for the delivery …',
    summary_title: 'Summary',
    summary_order: 'Order from',
    summary_driver: 'Driver',
    summary_status: 'New status',
    confirm_btn: 'Finish now',
    submitting: 'Saving …',
    success_title: 'Successfully completed',
    success_status: 'Status set to',
    success_driver: 'Driver',
    new_order: 'Process another order',
    back_dashboard: 'Back to dashboard',
    step_missing: 'This step requires a selection from a previous step.',
    restart: 'Restart',
    select_status_placeholder: 'Select status …',
    driver_required: 'Driver is required for status "On the way".',
  },
  cs: {
    title: 'Zpracovat objednávku', /* i18n-exempt */
    subtitle: 'Přiřadit řidiče a aktualizovat stav',
    step_order: 'Objednávka',
    step_driver: 'Řidič',
    step_confirm: 'Dokončit',
    search_order: 'Hledat objednávku …',
    search_driver: 'Hledat řidiče …',
    no_orders: 'Žádné aktivní objednávky nenalezeny',
    no_drivers: 'Žádní dostupní řidiči nenalezeni',
    order_date: 'Datum objednávky',
    items: 'Položky',
    total: 'Celkem',
    status: 'Stav',
    driver_zone: 'Zóna',
    driver_vehicle: 'Vozidlo',
    new_status: 'Nový stav',
    delivery_notes: 'Poznámky k doručení (volitelné)',
    delivery_notes_placeholder: 'Poznámky k doručení …',
    summary_title: 'Shrnutí',
    summary_order: 'Objednávka z',
    summary_driver: 'Řidič',
    summary_status: 'Nový stav',
    confirm_btn: 'Dokončit nyní',
    submitting: 'Ukládání …',
    success_title: 'Úspěšně dokončeno',
    success_status: 'Stav nastaven na',
    success_driver: 'Řidič',
    new_order: 'Zpracovat další objednávku',
    back_dashboard: 'Zpět na přehled',
    step_missing: 'Tento krok vyžaduje výběr z předchozího kroku.',
    restart: 'Začít znovu',
    select_status_placeholder: 'Vyberte stav …',
    driver_required: 'Pro stav "Na cestě" je řidič povinný.',
  },
});

// ── Lookup options ───────────────────────────────────────────────────────────
const ORDER_STATUS_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? [];
const ELIGIBLE_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung']);
const NEXT_STATUS_OPTIONS = ORDER_STATUS_OPTIONS.filter(o =>
  ['in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs', 'geliefert'].includes(o.key)
);

// ── Helpers ──────────────────────────────────────────────────────────────────
function formatOrderDate(raw: string | undefined): string {
  if (!raw) return '—';
  try { return format(parseISO(raw), 'dd.MM.yyyy HH:mm'); } catch { return raw; }
}

function formatCurrency(amount: number | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

// ── Component ────────────────────────────────────────────────────────────────
export default function BestellungAbwickelnPage() {
  const { bestellverwaltung, fahrerverwaltung, kundenverwaltung, loading, error, fetchAll } =
    useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(null);
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>(NEXT_STATUS_OPTIONS[0]?.key ?? '');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{ statusLabel: string; fahrerName: string } | null>(null);

  // Derived data — computed after hooks
  const kundenverwaltungMap = useMemo(() => {
    const m = new Map<string, string>();
    kundenverwaltung.forEach(k => {
      m.set(k.record_id, [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id);
    });
    return m;
  }, [kundenverwaltung]);

  const activeOrders = useMemo(
    () => bestellverwaltung.filter(b => {
      const key = b.fields.order_status?.key;
      return key != null && ELIGIBLE_STATUSES.has(key);
    }),
    [bestellverwaltung]
  );

  const availableDrivers = useMemo(
    () => fahrerverwaltung.filter(f => f.fields.driver_status?.key === 'verfuegbar'),
    [fahrerverwaltung]
  );

  const selectedBestellung = useMemo(
    () => bestellverwaltung.find(b => b.record_id === selectedBestellungId) ?? null,
    [bestellverwaltung, selectedBestellungId]
  );

  const selectedFahrer = useMemo(
    () => fahrerverwaltung.find(f => f.record_id === selectedFahrerId) ?? null,
    [fahrerverwaltung, selectedFahrerId]
  );

  // ── Helpers to resolve existing fahrer from a Bestellung ──────────────────
  function resolveKundeName(bestellung: Bestellverwaltung): string {
    if (!bestellung.fields.kunde) return '—';
    const id = extractRecordId(bestellung.fields.kunde);
    if (!id) return '—';
    return kundenverwaltungMap.get(id) ?? '—';
  }

  function resolveFahrerName(fahrer: Fahrerverwaltung): string {
    return [fahrer.fields.driver_first_name, fahrer.fields.driver_last_name].filter(Boolean).join(' ') || fahrer.record_id;
  }

  // ── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!selectedBestellungId || !selectedFahrerId || !selectedStatus) return;
    if (selectedStatus === 'unterwegs' && !selectedFahrerId) return;

    setSubmitting(true);
    setSubmitError(null);

    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellungId, {
        order_status: selectedStatus,
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId),
        delivery_notes: deliveryNotes || undefined,
      });

      const statusLabel =
        ORDER_STATUS_OPTIONS.find(o => o.key === selectedStatus)?.label ?? selectedStatus;
      const fahrerName = selectedFahrer ? resolveFahrerName(selectedFahrer) : '—';

      setSuccessInfo({ statusLabel, fahrerName });
      await fetchAll();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setStep(1);
    setSelectedBestellungId(null);
    setSelectedFahrerId(null);
    setSelectedStatus(NEXT_STATUS_OPTIONS[0]?.key ?? '');
    setDeliveryNotes('');
    setSubmitError(null);
    setSuccessInfo(null);
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step_order') },
        { label: tt('step_driver') },
        { label: tt('step_confirm') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Bestellung wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={activeOrders.map(b => ({
            id: b.record_id,
            title: `${tt('order_date')}: ${formatOrderDate(b.fields.order_date)}`,
            subtitle: [
              resolveKundeName(b) !== '—' ? resolveKundeName(b) : null,
              b.fields.ordered_items
                ? (b.fields.ordered_items.length > 60
                  ? b.fields.ordered_items.slice(0, 60) + '…'
                  : b.fields.ordered_items)
                : null,
              b.fields.total_amount != null ? formatCurrency(b.fields.total_amount) : null,
            ].filter(Boolean).join(' · '),
            status: b.fields.order_status
              ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
              : undefined,
            icon: <IconPackage size={20} className="text-primary" />,
          }))}
          onSelect={(id) => {
            setSelectedBestellungId(id);
            setStep(2);
          }}
          searchPlaceholder={tt('search_order')}
          emptyText={tt('no_orders')}
          emptyIcon={<IconPackage size={32} className="text-muted-foreground" />}
        />
      )}

      {/* ── Step 2: Fahrer zuweisen ── */}
      {step === 2 && (
        selectedBestellungId ? (
          <EntitySelectStep
            items={availableDrivers.map(f => ({
              id: f.record_id,
              title: resolveFahrerName(f),
              subtitle: [
                f.fields.vehicle_type?.label,
                f.fields.delivery_zone ? `${tt('driver_zone')}: ${f.fields.delivery_zone}` : null,
              ].filter(Boolean).join(' · '),
              status: f.fields.driver_status
                ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                : undefined,
              icon: <IconUser size={20} className="text-primary" />,
            }))}
            onSelect={(id) => {
              setSelectedFahrerId(id);
              setStep(3);
            }}
            searchPlaceholder={tt('search_driver')}
            emptyText={tt('no_drivers')}
            emptyIcon={<IconTruck size={32} className="text-muted-foreground" />}
          />
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step_missing')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Status setzen & abschließen ── */}
      {step === 3 && (
        selectedBestellungId && selectedFahrerId ? (
          successInfo ? (
            // ── Erfolgszustand ──
            <div className="flex flex-col items-center text-center py-12 space-y-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <IconCheck size={32} className="text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold text-foreground">{tt('success_title')}</h2>
                <p className="text-sm text-muted-foreground">
                  {tt('success_status')}: <span className="font-medium text-foreground">{successInfo.statusLabel}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  {tt('success_driver')}: <span className="font-medium text-foreground">{successInfo.fahrerName}</span>
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                <Button className="flex-1" onClick={handleReset}>{tt('new_order')}</Button>
                <Button variant="outline" className="flex-1" asChild>
                  <a href="#/">{tt('back_dashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            // ── Formular ──
            <div className="space-y-6 max-w-lg mx-auto">
              {/* Zusammenfassung */}
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <h3 className="font-semibold text-foreground">{tt('summary_title')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">{tt('summary_order')}: </span>
                    <span className="font-medium">{formatOrderDate(selectedBestellung?.fields.order_date)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">{tt('status')}: </span>
                    {selectedBestellung?.fields.order_status && (
                      <StatusBadge
                        statusKey={selectedBestellung.fields.order_status.key}
                        label={selectedBestellung.fields.order_status.label}
                      />
                    )}
                  </div>
                  <div>
                    <span className="text-muted-foreground">{tt('summary_driver')}: </span>
                    <span className="font-medium">
                      {selectedFahrer ? resolveFahrerName(selectedFahrer) : '—'}
                    </span>
                  </div>
                  {selectedBestellung?.fields.total_amount != null && (
                    <div>
                      <span className="text-muted-foreground">{tt('total')}: </span>
                      <span className="font-medium">{formatCurrency(selectedBestellung.fields.total_amount)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Neuer Status */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{tt('new_status')}</label>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tt('select_status_placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {NEXT_STATUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Liefernotiz */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">{tt('delivery_notes')}</label>
                <Textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={tt('delivery_notes_placeholder')}
                  rows={3}
                  className="w-full resize-none"
                />
              </div>

              {submitError && (
                <p className="text-sm text-destructive">{submitError}</p>
              )}

              <Button
                className="w-full"
                disabled={submitting || !selectedStatus}
                onClick={handleSubmit}
              >
                {submitting ? tt('submitting') : tt('confirm_btn')}
              </Button>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step_missing')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
