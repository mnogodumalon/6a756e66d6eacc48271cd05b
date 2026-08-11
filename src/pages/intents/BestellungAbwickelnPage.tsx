/**
 * Bestellung abwickeln — 3-Schritt-Wizard.
 * Steps: 1) Aktive Bestellung wählen (status: neu|in_bearbeitung|bereit_zur_lieferung|unterwegs)
 *        → 2) Fahrer zuweisen & Status setzen (updateBestellverwaltungEntry)
 *        → 3) Bestätigung mit Zusammenfassung.
 * Reads: bestellverwaltung, fahrerverwaltung, kundenverwaltung.
 * Writes: bestellverwaltung (updateBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Bestellverwaltung, Fahrerverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { formatDateTime, formatCurrency } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { IconTruck, IconUser, IconPackage, IconArrowRight, IconCheck } from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Bestellung abwickeln', /* i18n-exempt */
    subtitle: 'Fahrer zuweisen und Status aktualisieren',
    step1: 'Bestellung wählen',
    step2: 'Fahrer & Status',
    step3: 'Bestätigung',
    noOrders: 'Keine aktiven Bestellungen vorhanden',
    noOrdersHint: 'Alle Bestellungen sind bereits abgeschlossen oder storniert.',
    currentStatus: 'Aktueller Status',
    newStatus: 'Neuer Status',
    assignDriver: 'Fahrer zuweisen',
    noDriver: 'Kein Fahrer',
    noDriverOpt: 'Keinen Fahrer zuweisen',
    deliveryNotes: 'Lieferhinweise',
    deliveryNotesPlaceholder: 'Optionale Anmerkungen für die Lieferung...',
    update: 'Status aktualisieren',
    updating: 'Wird gespeichert...',
    deliveryAddress: 'Lieferadresse',
    orderedItems: 'Bestellte Artikel',
    totalAmount: 'Gesamtbetrag',
    customer: 'Kunde',
    driver: 'Fahrer',
    vehicleType: 'Fahrzeugtyp',
    deliveryTime: 'Gewünschter Lieferzeitpunkt',
    summaryTitle: 'Bestellung erfolgreich aktualisiert',
    summarySubtitle: 'Die Änderungen wurden gespeichert.',
    anotherOrder: 'Weitere Bestellung abwickeln',
    backToDashboard: 'Zurück zum Dashboard',
    newOrder: 'Neue Bestellung anlegen',
    statusArrow: 'Neuer Status',
    errorUpdate: 'Fehler beim Aktualisieren der Bestellung.',
    selectStatus: 'Status auswählen...',
    availableDrivers: 'Verfügbare Fahrer',
    noAvailableDrivers: 'Keine verfügbaren Fahrer',
    stepMissingOrder: 'Dieser Schritt benötigt eine ausgewählte Bestellung.',
    restart: 'Neu starten',
  },
  en: {
    title: 'Process Order', /* i18n-exempt */
    subtitle: 'Assign driver and update status',
    step1: 'Select Order',
    step2: 'Driver & Status',
    step3: 'Confirmation',
    noOrders: 'No active orders',
    noOrdersHint: 'All orders are already completed or cancelled.',
    currentStatus: 'Current Status',
    newStatus: 'New Status',
    assignDriver: 'Assign Driver',
    noDriver: 'No Driver',
    noDriverOpt: 'No driver assigned',
    deliveryNotes: 'Delivery Notes',
    deliveryNotesPlaceholder: 'Optional notes for the delivery...',
    update: 'Update Status',
    updating: 'Saving...',
    deliveryAddress: 'Delivery Address',
    orderedItems: 'Ordered Items',
    totalAmount: 'Total Amount',
    customer: 'Customer',
    driver: 'Driver',
    vehicleType: 'Vehicle Type',
    deliveryTime: 'Requested Delivery Time',
    summaryTitle: 'Order Updated Successfully',
    summarySubtitle: 'Your changes have been saved.',
    anotherOrder: 'Process Another Order',
    backToDashboard: 'Back to Dashboard',
    newOrder: 'Create New Order',
    statusArrow: 'New Status',
    errorUpdate: 'Error updating the order.',
    selectStatus: 'Select status...',
    availableDrivers: 'Available Drivers',
    noAvailableDrivers: 'No available drivers',
    stepMissingOrder: 'This step requires a selected order.',
    restart: 'Start over',
  },
});

const ACTIVE_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs']);
const ORDER_STATUS_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? [];
const VEHICLE_TYPE_OPTIONS = LOOKUP_OPTIONS['fahrerverwaltung']?.['vehicle_type'] ?? [];

function getVehicleLabel(key: string | undefined): string {
  if (!key) return '';
  return VEHICLE_TYPE_OPTIONS.find(o => o.key === key)?.label ?? key;
}

function buildAddress(b: Bestellverwaltung): string {
  const f = b.fields;
  const parts = [
    [f.delivery_street, f.delivery_house_number].filter(Boolean).join(' '),
    [f.delivery_postal_code, f.delivery_city].filter(Boolean).join(' '),
  ].filter(Boolean);
  return parts.join(', ') || '—';
}

export default function BestellungAbwickelnPage() {
  const [searchParams] = useSearchParams();
  const initialBestellungId = searchParams.get('bestellungId');

  const { bestellverwaltung, fahrerverwaltung, kundenverwaltungMap, fahrerverwaltungMap, loading, error, fetchAll } =
    useDashboardData();

  const initialStep = initialBestellungId ? 2 : 1;
  const [step, setStep] = useState(initialStep);
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(initialBestellungId);
  const [selectedFahrerIdKey, setSelectedFahrerIdKey] = useState<string>('none');
  const [newStatusKey, setNewStatusKey] = useState<string>('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const activeBestellungen = useMemo(
    () => bestellverwaltung.filter(b => {
      const key = b.fields.order_status?.key ?? '';
      return ACTIVE_STATUSES.has(key);
    }),
    [bestellverwaltung]
  );

  const selectedBestellung = useMemo(
    () => bestellverwaltung.find(b => b.record_id === selectedBestellungId) ?? null,
    [bestellverwaltung, selectedBestellungId]
  );

  const currentFahrerId = useMemo(
    () => selectedBestellung ? extractRecordId(selectedBestellung.fields.fahrer) : null,
    [selectedBestellung]
  );

  const availableDrivers: Fahrerverwaltung[] = useMemo(() => {
    return fahrerverwaltung.filter(f => {
      const statusKey = f.fields.driver_status?.key ?? '';
      return statusKey === 'verfuegbar' || f.record_id === currentFahrerId;
    });
  }, [fahrerverwaltung, currentFahrerId]);

  const selectedFahrer = useMemo(
    () => selectedFahrerIdKey !== 'none' ? fahrerverwaltungMap.get(selectedFahrerIdKey) ?? null : null,
    [fahrerverwaltungMap, selectedFahrerIdKey]
  );

  function handleSelectBestellung(id: string) {
    const b = bestellverwaltung.find(r => r.record_id === id);
    setSelectedBestellungId(id);
    const existingFahrerId = b ? extractRecordId(b.fields.fahrer) : null;
    setSelectedFahrerIdKey(existingFahrerId ?? 'none');
    setNewStatusKey(b?.fields.order_status?.key ?? '');
    setDeliveryNotes(b?.fields.delivery_notes ?? '');
    setSubmitError(null);
    setStep(2);
  }

  async function handleUpdate() {
    if (!selectedBestellungId || !newStatusKey) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        order_status: newStatusKey,
        delivery_notes: deliveryNotes || undefined,
      };
      if (selectedFahrerIdKey !== 'none') {
        payload.fahrer = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerIdKey);
      }
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellungId, payload);
      await fetchAll();
      setStep(3);
    } catch {
      setSubmitError(tt('errorUpdate'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelectedBestellungId(null);
    setSelectedFahrerIdKey('none');
    setNewStatusKey('');
    setDeliveryNotes('');
    setSubmitError(null);
    setStep(1);
  }

  const kundeNameForBestellung = (b: Bestellverwaltung): string => {
    const kundeId = extractRecordId(b.fields.kunde);
    if (!kundeId) return '—';
    const k = kundenverwaltungMap.get(kundeId);
    if (!k) return '—';
    return [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || '—';
  };

  const fahrerNameForBestellung = (b: Bestellverwaltung): string => {
    const fahrerId = extractRecordId(b.fields.fahrer);
    if (!fahrerId) return tt('noDriver');
    const f = fahrerverwaltungMap.get(fahrerId);
    if (!f) return tt('noDriver');
    return [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || tt('noDriver');
  };

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Bestellung wählen ── */}
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
              kundeNameForBestellung(b),
              b.fields.desired_delivery_time ? formatDateTime(b.fields.desired_delivery_time) : null,
              b.fields.total_amount != null ? formatCurrency(b.fields.total_amount) : null,
            ].filter(Boolean).join(' · '),
            status: b.fields.order_status
              ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
              : undefined,
            icon: <IconPackage size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleSelectBestellung}
          emptyText={tt('noOrders')}
          emptyIcon={<IconTruck size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* ── Step 2: Fahrer & Status ── */}
      {step === 2 && (
        selectedBestellung ? (
          <div className="space-y-6">
            {/* Read-only order info */}
            <div className="rounded-2xl border bg-card p-4 space-y-3 overflow-hidden">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <IconPackage size={16} stroke={1.5} />
                <span>{tt('orderedItems')}</span>
              </div>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap break-words min-w-0">
                {selectedBestellung.fields.ordered_items || '—'}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div>
                  <p className="text-xs text-muted-foreground">{tt('totalAmount')}</p>
                  <p className="text-sm font-semibold">{formatCurrency(selectedBestellung.fields.total_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{tt('deliveryAddress')}</p>
                  <p className="text-sm">{buildAddress(selectedBestellung)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{tt('customer')}</p>
                  <p className="text-sm">{kundeNameForBestellung(selectedBestellung)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{tt('deliveryTime')}</p>
                  <p className="text-sm">{formatDateTime(selectedBestellung.fields.desired_delivery_time)}</p>
                </div>
              </div>
            </div>

            {/* Status transition indicator */}
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground mb-1">{tt('currentStatus')}</p>
                <StatusBadge
                  statusKey={selectedBestellung.fields.order_status?.key}
                  label={selectedBestellung.fields.order_status?.label}
                />
              </div>
              {newStatusKey && newStatusKey !== selectedBestellung.fields.order_status?.key && (
                <>
                  <IconArrowRight size={18} className="text-muted-foreground mt-4" stroke={1.5} />
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">{tt('statusArrow')}</p>
                    <StatusBadge
                      statusKey={newStatusKey}
                      label={ORDER_STATUS_OPTIONS.find(o => o.key === newStatusKey)?.label ?? newStatusKey}
                    />
                  </div>
                </>
              )}
            </div>

            {/* Mini form */}
            <div className="space-y-4">
              {/* Status select */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{tt('newStatus')} *</label>
                <Select value={newStatusKey} onValueChange={setNewStatusKey}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tt('selectStatus')} />
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

              {/* Driver select */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{tt('assignDriver')}</label>
                {availableDrivers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tt('noAvailableDrivers')}</p>
                ) : (
                  <Select value={selectedFahrerIdKey} onValueChange={setSelectedFahrerIdKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={tt('noDriverOpt')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tt('noDriverOpt')}</SelectItem>
                      {availableDrivers.map(f => (
                        <SelectItem key={f.record_id} value={f.record_id}>
                          {[f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ')}
                          {f.fields.vehicle_type?.key
                            ? ` · ${getVehicleLabel(f.fields.vehicle_type.key)}`
                            : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>

              {/* Delivery notes */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{tt('deliveryNotes')}</label>
                <Textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={tt('deliveryNotesPlaceholder')}
                  rows={3}
                  className="w-full"
                />
              </div>
            </div>

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <div className="flex gap-3 flex-wrap">
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('step1')}
              </Button>
              <Button
                disabled={!newStatusKey || submitting}
                onClick={handleUpdate}
              >
                {submitting ? tt('updating') : tt('update')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('stepMissingOrder')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Bestätigung ── */}
      {step === 3 && (
        selectedBestellung ? (
          <div className="space-y-6">
            <div className="rounded-2xl border bg-card p-5 space-y-4 overflow-hidden">
              <div className="flex items-center gap-2 text-green-600">
                <IconCheck size={20} stroke={2} />
                <span className="font-semibold">{tt('summaryTitle')}</span>
              </div>
              <p className="text-sm text-muted-foreground">{tt('summarySubtitle')}</p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <p className="text-xs text-muted-foreground">{tt('orderedItems')}</p>
                  <p className="text-sm break-words min-w-0">{selectedBestellung.fields.ordered_items || '—'}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{tt('totalAmount')}</p>
                  <p className="text-sm font-semibold">{formatCurrency(selectedBestellung.fields.total_amount)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{tt('customer')}</p>
                  <p className="text-sm">{kundeNameForBestellung(selectedBestellung)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{tt('newStatus')}</p>
                  <StatusBadge
                    statusKey={newStatusKey}
                    label={ORDER_STATUS_OPTIONS.find(o => o.key === newStatusKey)?.label ?? newStatusKey}
                  />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{tt('driver')}</p>
                  <div className="flex items-center gap-1.5">
                    <IconUser size={14} stroke={1.5} className="text-muted-foreground" />
                    <span className="text-sm">
                      {selectedFahrer
                        ? [selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name]
                            .filter(Boolean)
                            .join(' ')
                        : fahrerNameForBestellung(selectedBestellung)}
                    </span>
                  </div>
                </div>
                {deliveryNotes && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">{tt('deliveryNotes')}</p>
                    <p className="text-sm whitespace-pre-wrap break-words min-w-0">{deliveryNotes}</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-3 flex-wrap">
              <Button onClick={handleReset}>
                {tt('anotherOrder')}
              </Button>
              <a href="#/intents/neue-bestellung">
                <Button variant="outline">{tt('newOrder')}</Button>
              </a>
              <a href="#/">
                <Button variant="ghost">{tt('backToDashboard')}</Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('stepMissingOrder')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
