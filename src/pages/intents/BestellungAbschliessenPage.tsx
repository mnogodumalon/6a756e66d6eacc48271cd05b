/**
 * Bestellung abschließen — 2-Schritt-Wizard.
 * Steps: 1) Aktive Bestellung wählen → 2) Abschluss bestätigen & speichern.
 * Reads: bestellverwaltung (filtered: order_status in neu|in_bearbeitung|bereit_zur_lieferung|unterwegs),
 *        fahrerverwaltung (for driver info).
 * Writes: bestellverwaltung (updateBestellverwaltungEntry — order_status, delivery_notes),
 *         fahrerverwaltung (updateFahrerverwaltungEntry — driver_status → 'verfuegbar').
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { makeT } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { LOOKUP_OPTIONS } from '@/types/app';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  IconPackage,
  IconTruck,
  IconCheck,
  IconMapPin,
  IconUser,
  IconCreditCard,
  IconClipboardList,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Bestellung abschließen', /* i18n-exempt */
    subtitle: 'Lieferstatus aktualisieren und Fahrer freigeben', /* i18n-exempt */
    step1: 'Bestellung wählen', /* i18n-exempt */
    step2: 'Abschluss bestätigen', /* i18n-exempt */
    searchPlaceholder: 'Bestellung suchen…', /* i18n-exempt */
    emptyText: 'Keine aktiven Bestellungen gefunden', /* i18n-exempt */
    selectOrderHint: 'Wähle eine aktive Bestellung aus der Liste', /* i18n-exempt */
    summaryTitle: 'Bestellübersicht', /* i18n-exempt */
    orderedItems: 'Bestellte Artikel', /* i18n-exempt */
    totalAmount: 'Gesamtbetrag', /* i18n-exempt */
    orderDate: 'Bestelldatum', /* i18n-exempt */
    currentStatus: 'Aktueller Status', /* i18n-exempt */
    paymentMethod: 'Zahlungsmethode', /* i18n-exempt */
    driver: 'Fahrer', /* i18n-exempt */
    deliveryAddress: 'Lieferadresse', /* i18n-exempt */
    noDriver: 'Kein Fahrer zugewiesen', /* i18n-exempt */
    driverNote: 'Fahrerstatus wird auf "Verfügbar" zurückgesetzt', /* i18n-exempt */
    newStatus: 'Neuer Status', /* i18n-exempt */
    deliveryNotes: 'Liefernotiz (optional)', /* i18n-exempt */
    deliveryNotesPlaceholder: 'Abschließende Notiz zur Lieferung…', /* i18n-exempt */
    confirm: 'Abschluss bestätigen', /* i18n-exempt */
    saving: 'Wird gespeichert…', /* i18n-exempt */
    successTitle: 'Bestellung abgeschlossen', /* i18n-exempt */
    successMsg: 'Status wurde aktualisiert und Fahrer freigegeben.', /* i18n-exempt */
    newTask: 'Weitere Bestellung abschließen', /* i18n-exempt */
    backDashboard: 'Zurück zum Dashboard', /* i18n-exempt */
    back: 'Zurück', /* i18n-exempt */
    errorTitle: 'Fehler beim Speichern', /* i18n-exempt */
    noSelection: 'Keine Bestellung ausgewählt. Bitte zurück zu Schritt 1.', /* i18n-exempt */
    restart: 'Neu starten', /* i18n-exempt */
  },
  en: {
    title: 'Close Order', /* i18n-exempt */
    subtitle: 'Update delivery status and release driver', /* i18n-exempt */
    step1: 'Select order', /* i18n-exempt */
    step2: 'Confirm completion', /* i18n-exempt */
    searchPlaceholder: 'Search order…', /* i18n-exempt */
    emptyText: 'No active orders found', /* i18n-exempt */
    selectOrderHint: 'Select an active order from the list', /* i18n-exempt */
    summaryTitle: 'Order summary', /* i18n-exempt */
    orderedItems: 'Ordered items', /* i18n-exempt */
    totalAmount: 'Total amount', /* i18n-exempt */
    orderDate: 'Order date', /* i18n-exempt */
    currentStatus: 'Current status', /* i18n-exempt */
    paymentMethod: 'Payment method', /* i18n-exempt */
    driver: 'Driver', /* i18n-exempt */
    deliveryAddress: 'Delivery address', /* i18n-exempt */
    noDriver: 'No driver assigned', /* i18n-exempt */
    driverNote: 'Driver status will be reset to "Available"', /* i18n-exempt */
    newStatus: 'New status', /* i18n-exempt */
    deliveryNotes: 'Delivery note (optional)', /* i18n-exempt */
    deliveryNotesPlaceholder: 'Final note about the delivery…', /* i18n-exempt */
    confirm: 'Confirm completion', /* i18n-exempt */
    saving: 'Saving…', /* i18n-exempt */
    successTitle: 'Order closed', /* i18n-exempt */
    successMsg: 'Status has been updated and driver released.', /* i18n-exempt */
    newTask: 'Close another order', /* i18n-exempt */
    backDashboard: 'Back to dashboard', /* i18n-exempt */
    back: 'Back', /* i18n-exempt */
    errorTitle: 'Error saving', /* i18n-exempt */
    noSelection: 'No order selected. Please go back to step 1.', /* i18n-exempt */
    restart: 'Start over', /* i18n-exempt */
  },
  cs: {
    title: 'Uzavřít objednávku', /* i18n-exempt */
    subtitle: 'Aktualizovat stav doručení a uvolnit řidiče', /* i18n-exempt */
    step1: 'Vybrat objednávku', /* i18n-exempt */
    step2: 'Potvrdit uzavření', /* i18n-exempt */
    searchPlaceholder: 'Hledat objednávku…', /* i18n-exempt */
    emptyText: 'Žádné aktivní objednávky', /* i18n-exempt */
    selectOrderHint: 'Vyberte aktivní objednávku ze seznamu', /* i18n-exempt */
    summaryTitle: 'Přehled objednávky', /* i18n-exempt */
    orderedItems: 'Objednané položky', /* i18n-exempt */
    totalAmount: 'Celková částka', /* i18n-exempt */
    orderDate: 'Datum objednávky', /* i18n-exempt */
    currentStatus: 'Aktuální stav', /* i18n-exempt */
    paymentMethod: 'Způsob platby', /* i18n-exempt */
    driver: 'Řidič', /* i18n-exempt */
    deliveryAddress: 'Adresa doručení', /* i18n-exempt */
    noDriver: 'Žádný řidič přiřazen', /* i18n-exempt */
    driverNote: 'Stav řidiče bude nastaven na "Dostupný"', /* i18n-exempt */
    newStatus: 'Nový stav', /* i18n-exempt */
    deliveryNotes: 'Poznámka k doručení (volitelné)', /* i18n-exempt */
    deliveryNotesPlaceholder: 'Závěrečná poznámka k doručení…', /* i18n-exempt */
    confirm: 'Potvrdit uzavření', /* i18n-exempt */
    saving: 'Ukládám…', /* i18n-exempt */
    successTitle: 'Objednávka uzavřena', /* i18n-exempt */
    successMsg: 'Stav byl aktualizován a řidič uvolněn.', /* i18n-exempt */
    newTask: 'Uzavřít další objednávku', /* i18n-exempt */
    backDashboard: 'Zpět na přehled', /* i18n-exempt */
    back: 'Zpět', /* i18n-exempt */
    errorTitle: 'Chyba při ukládání', /* i18n-exempt */
    noSelection: 'Žádná objednávka vybrána. Vraťte se na krok 1.', /* i18n-exempt */
    restart: 'Začít znovu', /* i18n-exempt */
  },
});

const ACTIVE_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs']);
const ORDER_STATUS_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? [];

export default function BestellungAbschliessenPage() {
  const { bestellverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedBestellung, setSelectedBestellung] = useState<EnrichedBestellverwaltung | null>(null);
  const [chosenStatus, setChosenStatus] = useState('geliefert');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const fahrerMap = useMemo(() => {
    const m = new Map<string, typeof fahrerverwaltung[0]>();
    for (const f of fahrerverwaltung) m.set(f.record_id, f);
    return m;
  }, [fahrerverwaltung]);

  const activeBestellungen = useMemo(
    () => (bestellverwaltung as EnrichedBestellverwaltung[]).filter(
      b => ACTIVE_STATUSES.has(lookupKey(b.fields.order_status) ?? '')
    ),
    [bestellverwaltung]
  );

  const assignedDriver = useMemo(() => {
    if (!selectedBestellung?.fields.fahrer) return null;
    const driverId = extractRecordId(selectedBestellung.fields.fahrer);
    return driverId ? fahrerMap.get(driverId) ?? null : null;
  }, [selectedBestellung, fahrerMap]);

  const handleSelectBestellung = (id: string) => {
    const found = activeBestellungen.find(b => b.record_id === id);
    if (found) {
      setSelectedBestellung(found);
      setChosenStatus('geliefert');
      setDeliveryNotes('');
      setSaveError(null);
      setStep(2);
    }
  };

  const handleConfirm = async () => {
    if (!selectedBestellung) return;
    setSaving(true);
    setSaveError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellung.record_id, {
        order_status: chosenStatus,
        ...(deliveryNotes.trim() ? { delivery_notes: deliveryNotes.trim() } : {}),
      });

      if (selectedBestellung.fields.fahrer) {
        const driverId = extractRecordId(selectedBestellung.fields.fahrer);
        if (driverId) {
          await LivingAppsService.updateFahrerverwaltungEntry(driverId, {
            driver_status: 'verfuegbar',
          });
        }
      }

      await fetchAll();
      setDone(true);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedBestellung(null);
    setChosenStatus('geliefert');
    setDeliveryNotes('');
    setSaveError(null);
    setDone(false);
    setStep(1);
  };

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[{ label: tt('step1') }, { label: tt('step2') }]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {step === 1 && (
        <EntitySelectStep
          items={activeBestellungen.map(b => ({
            id: b.record_id,
            title: b.fields.ordered_items
              ? b.fields.ordered_items.length > 60
                ? b.fields.ordered_items.slice(0, 60) + '…'
                : b.fields.ordered_items
              : '—',
            subtitle: [
              b.fields.order_date ? formatDate(b.fields.order_date) : null,
              b.fields.total_amount != null ? formatCurrency(b.fields.total_amount) : null,
              (b as EnrichedBestellverwaltung).kundeName || null,
            ].filter(Boolean).join(' · '),
            status: b.fields.order_status
              ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
              : undefined,
            icon: <IconPackage size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectBestellung}
          searchPlaceholder={tt('searchPlaceholder')}
          emptyText={tt('emptyText')}
          emptyIcon={<IconTruck size={32} className="text-muted-foreground" />}
        />
      )}

      {step === 2 && (
        selectedBestellung ? (
          done ? (
            <div className="flex flex-col items-center gap-6 py-12">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                <IconCheck size={32} className="text-primary" stroke={2} />
              </div>
              <div className="text-center space-y-1">
                <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
                <p className="text-muted-foreground text-sm">{tt('successMsg')}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                <Button className="flex-1" onClick={handleReset}>
                  {tt('newTask')}
                </Button>
                <Button variant="outline" className="flex-1" asChild>
                  <a href="#/">{tt('backDashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-5 max-w-2xl mx-auto">
              {/* Summary card */}
              <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
                <h3 className="font-semibold text-base flex items-center gap-2">
                  <IconClipboardList size={18} className="text-primary" stroke={2} />
                  {tt('summaryTitle')}
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {/* Ordered items */}
                  <div className="sm:col-span-2">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">{tt('orderedItems')}</p>
                    <p className="font-medium">{selectedBestellung.fields.ordered_items || '—'}</p>
                  </div>

                  {/* Total amount */}
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">{tt('totalAmount')}</p>
                    <p className="font-semibold text-primary">
                      {selectedBestellung.fields.total_amount != null
                        ? formatCurrency(selectedBestellung.fields.total_amount)
                        : '—'}
                    </p>
                  </div>

                  {/* Order date */}
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">{tt('orderDate')}</p>
                    <p>{formatDate(selectedBestellung.fields.order_date)}</p>
                  </div>

                  {/* Current status */}
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">{tt('currentStatus')}</p>
                    <StatusBadge
                      statusKey={selectedBestellung.fields.order_status?.key}
                      label={selectedBestellung.fields.order_status?.label}
                    />
                  </div>

                  {/* Payment method */}
                  <div>
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">{tt('paymentMethod')}</p>
                    <div className="flex items-center gap-1.5">
                      <IconCreditCard size={14} className="text-muted-foreground" stroke={2} />
                      <span>{selectedBestellung.fields.payment_method?.label ?? '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Delivery address */}
                {(selectedBestellung.fields.delivery_street || selectedBestellung.fields.delivery_city) && (
                  <div className="pt-2 border-t">
                    <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">{tt('deliveryAddress')}</p>
                    <div className="flex items-start gap-1.5 text-sm">
                      <IconMapPin size={14} className="text-muted-foreground mt-0.5 shrink-0" stroke={2} />
                      <span>
                        {[
                          selectedBestellung.fields.delivery_street,
                          selectedBestellung.fields.delivery_house_number,
                          selectedBestellung.fields.delivery_postal_code,
                          selectedBestellung.fields.delivery_city,
                        ].filter(Boolean).join(' ')}
                      </span>
                    </div>
                  </div>
                )}

                {/* Driver info */}
                <div className="pt-2 border-t">
                  <p className="text-muted-foreground text-xs uppercase tracking-wide mb-1">{tt('driver')}</p>
                  {assignedDriver ? (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-sm">
                        <IconUser size={14} className="text-muted-foreground" stroke={2} />
                        <span className="font-medium">
                          {[assignedDriver.fields.driver_first_name, assignedDriver.fields.driver_last_name]
                            .filter(Boolean)
                            .join(' ') || '—'}
                        </span>
                        {assignedDriver.fields.driver_status && (
                          <StatusBadge
                            statusKey={assignedDriver.fields.driver_status.key}
                            label={assignedDriver.fields.driver_status.label}
                          />
                        )}
                      </div>
                      <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-1.5 border border-amber-200">
                        {tt('driverNote')}
                      </p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{tt('noDriver')}</p>
                  )}
                </div>
              </div>

              {/* Mini-form */}
              <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
                {/* New status selector */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tt('newStatus')}</label>
                  <Select value={chosenStatus} onValueChange={setChosenStatus}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ORDER_STATUS_OPTIONS.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Delivery notes */}
                <div className="space-y-2">
                  <label className="text-sm font-medium">{tt('deliveryNotes')}</label>
                  <Textarea
                    value={deliveryNotes}
                    onChange={e => setDeliveryNotes(e.target.value)}
                    placeholder={tt('deliveryNotesPlaceholder')}
                    rows={3}
                    className="resize-none"
                  />
                </div>

                {/* Error */}
                {saveError && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-3 py-2">
                    {tt('errorTitle')}: {saveError}
                  </p>
                )}

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3 pt-1">
                  <Button
                    variant="outline"
                    className="sm:w-auto"
                    onClick={() => setStep(1)}
                    disabled={saving}
                  >
                    {tt('back')}
                  </Button>
                  <Button
                    className="flex-1"
                    onClick={handleConfirm}
                    disabled={saving || !chosenStatus}
                  >
                    {saving ? tt('saving') : tt('confirm')}
                  </Button>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noSelection')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
