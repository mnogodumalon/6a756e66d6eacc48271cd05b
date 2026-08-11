/**
 * Bestellung Dispatchen — 3-Schritt-Wizard.
 * Steps: 1) Offene Bestellung auswählen → 2) Verfügbaren Fahrer zuweisen →
 *        3) Status setzen & speichern (Bestellung + Fahrer).
 * Reads: bestellverwaltung (filter: status neu|in_bearbeitung|bereit_zur_lieferung),
 *        fahrerverwaltung (filter: driver_status verfuegbar), kundenverwaltung.
 * Writes: updateBestellverwaltungEntry (fahrer + order_status),
 *         updateFahrerverwaltungEntry (driver_status → im_einsatz).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Bestellverwaltung, Fahrerverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { lookupKey, formatDateTime } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconTruck, IconUser, IconCheck, IconAlertTriangle } from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Bestellung dispatchen', /* i18n-exempt */
    subtitle: 'Offene Bestellung einem Fahrer zuweisen',
    step1: 'Bestellung',
    step2: 'Fahrer',
    step3: 'Bestätigen',
    selectOrder: 'Bestellung auswählen',
    selectDriver: 'Fahrer auswählen',
    confirmStep: 'Status setzen & speichern',
    noOrders: 'Keine offenen Bestellungen',
    noOrdersDesc: 'Alle Bestellungen sind bereits unterwegs, geliefert oder storniert.',
    noDrivers: 'Kein Fahrer verfügbar',
    noDriversDesc: 'Aktuell ist kein Fahrer mit Status "Verfügbar" eingetragen.',
    orderDate: 'Bestellt am',
    deliveryTime: 'Wunschlieferzeit',
    items: 'Artikel',
    customer: 'Kunde',
    orderStatus: 'Bestellstatus',
    zone: 'Liefergebiet',
    vehicle: 'Fahrzeug',
    phone: 'Telefon',
    newStatus: 'Neuer Bestellstatus',
    selectedOrder: 'Ausgewählte Bestellung',
    selectedDriver: 'Zugewiesener Fahrer',
    saveBtn: 'Zuweisen & speichern',
    saving: 'Wird gespeichert…',
    successTitle: 'Erfolgreich dispatcht!',
    successDesc: 'Fahrer {driver} wurde der Bestellung zugewiesen. Status: {status}.',
    newDispatch: 'Neue Bestellung dispatchen',
    backDash: 'Zurück zum Dashboard',
    toStep2: 'Weiter: Fahrer wählen',
    toStep3: 'Weiter: Status bestätigen',
    noSelection: 'Bitte zuerst eine Bestellung auswählen.',
    noDriverSel: 'Bitte zuerst einen Fahrer auswählen.',
    errorTitle: 'Fehler beim Speichern',
    restart: 'Neu starten',
    unknown: 'Unbekannt',
  },
  en: {
    title: 'Dispatch Order', /* i18n-exempt */
    subtitle: 'Assign an open order to an available driver',
    step1: 'Order',
    step2: 'Driver',
    step3: 'Confirm',
    selectOrder: 'Select order',
    selectDriver: 'Select driver',
    confirmStep: 'Set status & save',
    noOrders: 'No open orders',
    noOrdersDesc: 'All orders are already en route, delivered, or cancelled.',
    noDrivers: 'No driver available',
    noDriversDesc: 'No driver with status "Available" is currently registered.',
    orderDate: 'Ordered on',
    deliveryTime: 'Requested delivery',
    items: 'Items',
    customer: 'Customer',
    orderStatus: 'Order status',
    zone: 'Delivery zone',
    vehicle: 'Vehicle',
    phone: 'Phone',
    newStatus: 'New order status',
    selectedOrder: 'Selected order',
    selectedDriver: 'Assigned driver',
    saveBtn: 'Assign & save',
    saving: 'Saving…',
    successTitle: 'Successfully dispatched!',
    successDesc: 'Driver {driver} has been assigned to the order. Status: {status}.',
    newDispatch: 'Dispatch another order',
    backDash: 'Back to Dashboard',
    toStep2: 'Next: Choose driver',
    toStep3: 'Next: Confirm status',
    noSelection: 'Please select an order first.',
    noDriverSel: 'Please select a driver first.',
    errorTitle: 'Error saving',
    restart: 'Restart',
    unknown: 'Unknown',
  },
});

const ELIGIBLE_ORDER_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung']);
const ORDER_STATUS_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? [];

export default function BestellungDispatchenPage() {
  const [searchParams] = useSearchParams();

  // All hooks before early returns
  const { bestellverwaltung, fahrerverwaltung, kundenverwaltungMap, loading, error, fetchAll } = useDashboardData();

  const initialStep = parseInt(searchParams.get('step') ?? '1', 10);
  const preselectedBestellungId = searchParams.get('bestellungId') ?? null;

  const [step, setStep] = useState<number>(
    preselectedBestellungId && initialStep === 1 ? 2 : Math.max(1, Math.min(3, isNaN(initialStep) ? 1 : initialStep))
  );
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(preselectedBestellungId);
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [selectedStatus, setSelectedStatus] = useState<string>('unterwegs');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const offeneBestellungen = bestellverwaltung.filter(b => {
    const sk = lookupKey(b.fields.order_status);
    return sk != null && ELIGIBLE_ORDER_STATUSES.has(sk);
  });

  const verfuegbareFahrer = fahrerverwaltung.filter(f => {
    const sk = lookupKey(f.fields.driver_status);
    return sk === 'verfuegbar';
  });

  const selectedBestellung: Bestellverwaltung | undefined = selectedBestellungId
    ? bestellverwaltung.find(b => b.record_id === selectedBestellungId)
    : undefined;

  const selectedFahrer: Fahrerverwaltung | undefined = selectedFahrerId
    ? fahrerverwaltung.find(f => f.record_id === selectedFahrerId)
    : undefined;

  const getKundeName = useCallback((b: Bestellverwaltung): string => {
    if (!b.fields.kunde) return tt('unknown');
    const kundeId = extractRecordId(b.fields.kunde);
    if (!kundeId) return tt('unknown');
    const kunde = kundenverwaltungMap.get(kundeId);
    if (!kunde) return tt('unknown');
    return [kunde.fields.first_name, kunde.fields.last_name].filter(Boolean).join(' ') || tt('unknown');
  }, [kundenverwaltungMap]);

  const handleSave = async () => {
    if (!selectedBestellungId || !selectedFahrerId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellungId, {
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId),
        order_status: selectedStatus,
      });
      await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrerId, {
        driver_status: 'im_einsatz',
      });
      await fetchAll();
      const driverName = selectedFahrer
        ? [selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name].filter(Boolean).join(' ')
        : tt('unknown');
      const statusLabel = ORDER_STATUS_OPTIONS.find(o => o.key === selectedStatus)?.label ?? selectedStatus;
      setSuccessMsg(tt('successDesc', { driver: driverName, status: statusLabel }));
      setSuccess(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedBestellungId(null);
    setSelectedFahrerId(null);
    setSelectedStatus('unterwegs');
    setSaveError(null);
    setSuccess(false);
    setSuccessMsg('');
    setStep(1);
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full rounded-2xl border bg-card shadow-lg p-8 text-center space-y-5">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 p-4">
              <IconCheck size={36} className="text-green-600" stroke={1.5} />
            </div>
          </div>
          <h2 className="text-xl font-semibold text-foreground">{tt('successTitle')}</h2>
          <p className="text-sm text-muted-foreground">{successMsg}</p>
          <div className="flex flex-col gap-3 pt-2">
            <Button onClick={handleReset} className="w-full">{tt('newDispatch')}</Button>
            <a href="#/" className="block w-full">
              <Button variant="outline" className="w-full">{tt('backDash')}</Button>
            </a>
          </div>
        </div>
      </div>
    );
  }

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
      {/* Step 1: Bestellung auswählen */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneBestellungen.map(b => {
            const statusKey = lookupKey(b.fields.order_status);
            const statusLabel = b.fields.order_status && typeof b.fields.order_status === 'object' && 'label' in b.fields.order_status
              ? String((b.fields.order_status as { label: string }).label)
              : statusKey ?? '';
            return {
              id: b.record_id,
              title: getKundeName(b),
              subtitle: [
                b.fields.ordered_items ? b.fields.ordered_items.slice(0, 60) + (b.fields.ordered_items.length > 60 ? '…' : '') : null,
                b.fields.desired_delivery_time ? `${tt('deliveryTime')}: ${formatDateTime(b.fields.desired_delivery_time)}` : null,
              ].filter(Boolean).join(' · '),
              status: statusKey ? { key: statusKey, label: statusLabel } : undefined,
              icon: <IconTruck size={20} className="text-primary" stroke={1.5} />,
            };
          })}
          onSelect={(id) => {
            setSelectedBestellungId(id);
            setStep(2);
          }}
          emptyText={offeneBestellungen.length === 0 ? tt('noOrders') : undefined}
          searchPlaceholder={tt('selectOrder')}
        />
      )}

      {/* Step 2: Fahrer auswählen */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Kontext: ausgewählte Bestellung */}
          {selectedBestellung ? (
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{tt('selectedOrder')}</p>
              <div className="flex items-start justify-between gap-2 min-w-0">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold text-foreground truncate">{getKundeName(selectedBestellung)}</p>
                  {selectedBestellung.fields.ordered_items && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{selectedBestellung.fields.ordered_items}</p>
                  )}
                  {selectedBestellung.fields.desired_delivery_time && (
                    <p className="text-xs text-muted-foreground">{tt('deliveryTime')}: {formatDateTime(selectedBestellung.fields.desired_delivery_time)}</p>
                  )}
                </div>
                {selectedBestellung.fields.order_status && (
                  <StatusBadge
                    statusKey={lookupKey(selectedBestellung.fields.order_status)}
                    label={typeof selectedBestellung.fields.order_status === 'object' && 'label' in selectedBestellung.fields.order_status
                      ? String((selectedBestellung.fields.order_status as { label: string }).label)
                      : undefined}
                  />
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-2">
              <IconAlertTriangle size={16} stroke={1.5} />
              {tt('noSelection')}
              <Button variant="link" size="sm" className="ml-auto p-0 h-auto" onClick={() => setStep(1)}>{tt('restart')}</Button>
            </div>
          )}

          <EntitySelectStep
            items={verfuegbareFahrer.map(f => ({
              id: f.record_id,
              title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || f.record_id,
              subtitle: [
                f.fields.vehicle_type && typeof f.fields.vehicle_type === 'object' && 'label' in f.fields.vehicle_type
                  ? String((f.fields.vehicle_type as { label: string }).label)
                  : null,
                f.fields.delivery_zone ? `${tt('zone')}: ${f.fields.delivery_zone}` : null,
                f.fields.driver_phone ? `${tt('phone')}: ${f.fields.driver_phone}` : null,
              ].filter(Boolean).join(' · '),
              status: { key: 'verfuegbar', label: 'verfuegbar' }, /* i18n-exempt */
              icon: <IconUser size={20} className="text-primary" stroke={1.5} />,
            }))}
            onSelect={(id) => {
              setSelectedFahrerId(id);
              setStep(3);
            }}
            emptyText={verfuegbareFahrer.length === 0 ? tt('noDrivers') : undefined}
            searchPlaceholder={tt('selectDriver')}
          />
        </div>
      )}

      {/* Step 3: Status setzen & bestätigen */}
      {step === 3 && (
        <div className="space-y-5">
          {(!selectedBestellungId || !selectedFahrerId) ? (
            <div className="rounded-2xl border bg-destructive/10 p-6 text-center space-y-3">
              <IconAlertTriangle size={24} className="text-destructive mx-auto" stroke={1.5} />
              <p className="text-sm text-muted-foreground">
                {!selectedBestellungId ? tt('noSelection') : tt('noDriverSel')}
              </p>
              <Button variant="outline" onClick={() => setStep(!selectedBestellungId ? 1 : 2)}>{tt('restart')}</Button>
            </div>
          ) : (
            <>
              {/* Zusammenfassung */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Bestellung */}
                <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2 overflow-hidden">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{tt('selectedOrder')}</p>
                  <p className="font-semibold text-foreground truncate">{getKundeName(selectedBestellung!)}</p>
                  {selectedBestellung!.fields.ordered_items && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{selectedBestellung!.fields.ordered_items}</p>
                  )}
                  {selectedBestellung!.fields.desired_delivery_time && (
                    <p className="text-xs text-muted-foreground">{tt('deliveryTime')}: {formatDateTime(selectedBestellung!.fields.desired_delivery_time)}</p>
                  )}
                </div>

                {/* Fahrer */}
                <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2 overflow-hidden">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{tt('selectedDriver')}</p>
                  <p className="font-semibold text-foreground truncate">
                    {[selectedFahrer!.fields.driver_first_name, selectedFahrer!.fields.driver_last_name].filter(Boolean).join(' ')}
                  </p>
                  {selectedFahrer!.fields.vehicle_type && typeof selectedFahrer!.fields.vehicle_type === 'object' && 'label' in selectedFahrer!.fields.vehicle_type && (
                    <p className="text-sm text-muted-foreground">{String((selectedFahrer!.fields.vehicle_type as { label: string }).label)}</p>
                  )}
                  {selectedFahrer!.fields.delivery_zone && (
                    <p className="text-xs text-muted-foreground">{tt('zone')}: {selectedFahrer!.fields.delivery_zone}</p>
                  )}
                  {selectedFahrer!.fields.driver_phone && (
                    <p className="text-xs text-muted-foreground">{tt('phone')}: {selectedFahrer!.fields.driver_phone}</p>
                  )}
                </div>
              </div>

              {/* Status wählen */}
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">{tt('newStatus')}</p>
                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ORDER_STATUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {saveError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive flex items-center gap-2">
                  <IconAlertTriangle size={16} stroke={1.5} />
                  {tt('errorTitle')}: {saveError}
                </div>
              )}

              <Button
                className="w-full"
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? tt('saving') : tt('saveBtn')}
              </Button>
            </>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
