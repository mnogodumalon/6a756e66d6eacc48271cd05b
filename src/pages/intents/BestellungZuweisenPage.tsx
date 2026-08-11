/**
 * Bestellung zuweisen — 3-Schritt-Wizard.
 * Steps: 1) Offene Bestellung auswählen → 2) Verfügbaren Fahrer zuweisen → 3) Bestätigen & Status setzen.
 * Reads: bestellverwaltung, fahrerverwaltung, kundenverwaltung.
 * Writes: bestellverwaltung (updateBestellverwaltungEntry: fahrer, order_status → 'unterwegs'),
 *         fahrerverwaltung (updateFahrerverwaltungEntry: driver_status → 'im_einsatz').
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { Button } from '@/components/ui/button';
import { makeT } from '@/i18n';
import {
  IconTruck,
  IconUser,
  IconCheck,
  IconAlertCircle,
  IconMapPin,
  IconClock,
  IconPackage,
  IconPhone,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Bestellung zuweisen', /* i18n-exempt */
    subtitle: 'Fahrer für eine Lieferung einteilen',
    step1: 'Bestellung',
    step2: 'Fahrer',
    step3: 'Bestätigen',
    searchBestellung: 'Bestellungen durchsuchen …',
    emptyBestellung: 'Keine offenen Bestellungen vorhanden',
    searchFahrer: 'Fahrer durchsuchen …',
    emptyFahrer: 'Kein Fahrer verfügbar',
    noDriverAvailable: 'Aktuell ist kein Fahrer verfügbar.',
    goBack: 'Zurück zu Schritt 1',
    selectedOrder: 'Gewählte Bestellung',
    deliveryAddress: 'Lieferadresse',
    desiredDelivery: 'Wunschlieferzeit',
    items: 'Artikel',
    total: 'Betrag',
    customer: 'Kunde',
    chooseDriver: 'Fahrer wählen',
    zone: 'Zone',
    vehicle: 'Fahrzeug',
    phone: 'Telefon',
    confirmTitle: 'Zuweisung bestätigen',
    confirmDesc: 'Fahrer wird zugewiesen und Bestellung auf „Unterwegs" gesetzt.',
    assign: 'Jetzt zuweisen',
    assigning: 'Wird zugewiesen …',
    successTitle: 'Erfolgreich zugewiesen!',
    successDesc: 'Der Fahrer wurde der Bestellung zugewiesen.',
    newAssignment: 'Neue Zuweisung',
    backToDashboard: 'Zurück zum Dashboard',
    order: 'Bestellung',
    driver: 'Fahrer',
    noOrder: 'Keine Bestellung ausgewählt.',
    noDriver: 'Kein Fahrer ausgewählt.',
    restart: 'Neu starten',
    needsStep1: 'Dieser Schritt setzt eine Bestellung aus Schritt 1 voraus.',
    needsStep2: 'Dieser Schritt setzt einen Fahrer aus Schritt 2 voraus.',
    unknown: 'Unbekannt',
    errorTitle: 'Fehler bei der Zuweisung',
  },
  en: {
    title: 'Assign Order', /* i18n-exempt */
    subtitle: 'Assign a driver to a delivery',
    step1: 'Order',
    step2: 'Driver',
    step3: 'Confirm',
    searchBestellung: 'Search orders …',
    emptyBestellung: 'No open orders available',
    searchFahrer: 'Search drivers …',
    emptyFahrer: 'No driver available',
    noDriverAvailable: 'No driver is currently available.',
    goBack: 'Back to step 1',
    selectedOrder: 'Selected order',
    deliveryAddress: 'Delivery address',
    desiredDelivery: 'Desired delivery time',
    items: 'Items',
    total: 'Amount',
    customer: 'Customer',
    chooseDriver: 'Choose driver',
    zone: 'Zone',
    vehicle: 'Vehicle',
    phone: 'Phone',
    confirmTitle: 'Confirm assignment',
    confirmDesc: 'Driver will be assigned and order status set to "En route".',
    assign: 'Assign now',
    assigning: 'Assigning …',
    successTitle: 'Successfully assigned!',
    successDesc: 'The driver has been assigned to the order.',
    newAssignment: 'New assignment',
    backToDashboard: 'Back to dashboard',
    order: 'Order',
    driver: 'Driver',
    noOrder: 'No order selected.',
    noDriver: 'No driver selected.',
    restart: 'Restart',
    needsStep1: 'This step requires an order from step 1.',
    needsStep2: 'This step requires a driver from step 2.',
    unknown: 'Unknown',
    errorTitle: 'Assignment error',
  },
});

const ELIGIBLE_ORDER_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung']);

export default function BestellungZuweisenPage() {
  const { bestellverwaltung, fahrerverwaltung, kundenverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(null);
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Filter eligible orders (only open statuses)
  const eligibleBestellungen = (bestellverwaltung as Bestellverwaltung[]).filter(
    (b) => ELIGIBLE_ORDER_STATUSES.has(b.fields.order_status?.key ?? '')
  );

  // Filter eligible drivers (only 'verfuegbar')
  const eligibleFahrer = (fahrerverwaltung as Fahrerverwaltung[]).filter(
    (f) => f.fields.driver_status?.key === 'verfuegbar'
  );

  // Build kunde map for applookup resolution
  const kundeMap = new Map(
    (kundenverwaltung as { record_id: string; fields: { first_name?: string; last_name?: string } }[]).map((k) => [
      k.record_id,
      k,
    ])
  );

  const selectedBestellung = selectedBestellungId
    ? (bestellverwaltung as Bestellverwaltung[]).find((b) => b.record_id === selectedBestellungId) ?? null
    : null;

  const selectedFahrer = selectedFahrerId
    ? (fahrerverwaltung as Fahrerverwaltung[]).find((f) => f.record_id === selectedFahrerId) ?? null
    : null;

  function resolveKundeName(bestellung: Bestellverwaltung): string | null {
    const kundeUrl = bestellung.fields.kunde;
    if (!kundeUrl) return null;
    const kundeId = extractRecordId(kundeUrl);
    if (!kundeId) return null;
    const kunde = kundeMap.get(kundeId);
    if (!kunde) return null;
    const parts = [kunde.fields.first_name, kunde.fields.last_name].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : null;
  }

  function formatDeliveryAddress(b: Bestellverwaltung): string {
    const parts = [
      b.fields.delivery_street,
      b.fields.delivery_house_number,
      b.fields.delivery_postal_code,
      b.fields.delivery_city,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(' ') : tt('unknown');
  }

  function formatCurrency(amount?: number): string {
    if (amount == null) return '–';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  function getVehicleLabel(f: Fahrerverwaltung): string {
    return f.fields.vehicle_type?.label ?? '–';
  }

  async function handleAssign() {
    if (!selectedBestellungId || !selectedFahrerId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellungId, {
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId),
        order_status: 'unterwegs',
      });
      await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrerId, {
        driver_status: 'im_einsatz',
      });
      await fetchAll();
      setSuccess(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelectedBestellungId(null);
    setSelectedFahrerId(null);
    setSubmitError(null);
    setSuccess(false);
    setStep(1);
  }

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
      {/* Step 1: Select order */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleBestellungen.map((b) => {
            const kundeName = resolveKundeName(b);
            const subtitleParts: string[] = [];
            if (kundeName) subtitleParts.push(kundeName);
            if (b.fields.delivery_city) subtitleParts.push(b.fields.delivery_city);
            if (b.fields.total_amount != null) subtitleParts.push(formatCurrency(b.fields.total_amount));
            return {
              id: b.record_id,
              title: b.fields.ordered_items ?? tt('unknown'),
              subtitle: subtitleParts.join(' · ') || undefined,
              status: b.fields.order_status
                ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
                : undefined,
              stats: [
                { label: tt('total'), value: formatCurrency(b.fields.total_amount) },
                { label: tt('deliveryAddress'), value: b.fields.delivery_city ?? '–' },
              ],
              icon: <IconPackage size={20} className="text-primary" />,
            };
          })}
          onSelect={(id) => {
            setSelectedBestellungId(id);
            setStep(2);
          }}
          searchPlaceholder={tt('searchBestellung')}
          emptyText={tt('emptyBestellung')}
          emptyIcon={<IconPackage size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Assign driver */}
      {step === 2 && (
        selectedBestellung ? (
          <div className="space-y-6">
            {/* Order summary card */}
            <div className="rounded-2xl border bg-card p-4 space-y-3 overflow-hidden">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <IconPackage size={16} />
                {tt('selectedOrder')}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{tt('items')}</p>
                  <p className="text-sm font-medium line-clamp-2 min-w-0">
                    {selectedBestellung.fields.ordered_items ?? '–'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">{tt('total')}</p>
                  <p className="text-sm font-medium">{formatCurrency(selectedBestellung.fields.total_amount)}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconMapPin size={12} />
                    {tt('deliveryAddress')}
                  </p>
                  <p className="text-sm truncate min-w-0">{formatDeliveryAddress(selectedBestellung)}</p>
                </div>
                {selectedBestellung.fields.desired_delivery_time && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <IconClock size={12} />
                      {tt('desiredDelivery')}
                    </p>
                    <p className="text-sm">{selectedBestellung.fields.desired_delivery_time}</p>
                  </div>
                )}
                {resolveKundeName(selectedBestellung) && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <IconUser size={12} />
                      {tt('customer')}
                    </p>
                    <p className="text-sm truncate min-w-0">{resolveKundeName(selectedBestellung)}</p>
                  </div>
                )}
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground">Status</p> {/* i18n-exempt */}
                  <StatusBadge
                    statusKey={selectedBestellung.fields.order_status?.key}
                    label={selectedBestellung.fields.order_status?.label}
                  />
                </div>
              </div>
            </div>

            {/* Driver selection */}
            {eligibleFahrer.length === 0 ? (
              <div className="rounded-2xl border bg-card p-8 text-center space-y-4">
                <IconAlertCircle size={40} className="text-muted-foreground mx-auto" />
                <p className="text-sm text-muted-foreground">{tt('noDriverAvailable')}</p>
                <Button variant="outline" onClick={() => setStep(1)}>
                  {tt('goBack')}
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-muted-foreground">{tt('chooseDriver')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {eligibleFahrer.map((f) => {
                    const isSelected = selectedFahrerId === f.record_id;
                    return (
                      <button
                        key={f.record_id}
                        type="button"
                        onClick={() => {
                          setSelectedFahrerId(f.record_id);
                          setStep(3);
                        }}
                        className={`rounded-2xl border p-4 text-left space-y-2 w-full transition-colors ${
                          isSelected
                            ? 'border-primary bg-primary/5'
                            : 'bg-card hover:border-primary/50 hover:bg-secondary/50'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                            <IconUser size={16} className="text-primary" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold truncate">
                              {[f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || tt('unknown')}
                            </p>
                            <StatusBadge
                              statusKey={f.fields.driver_status?.key}
                              label={f.fields.driver_status?.label}
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-1 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <IconTruck size={12} />
                            <span className="truncate">{getVehicleLabel(f)}</span>
                          </span>
                          {f.fields.delivery_zone && (
                            <span className="flex items-center gap-1">
                              <IconMapPin size={12} />
                              <span className="truncate">{f.fields.delivery_zone}</span>
                            </span>
                          )}
                          {f.fields.driver_phone && (
                            <span className="flex items-center gap-1 col-span-2">
                              <IconPhone size={12} />
                              <span className="truncate">{f.fields.driver_phone}</span>
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('needsStep1')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3: Confirm & submit */}
      {step === 3 && (
        selectedBestellung && selectedFahrer ? (
          success ? (
            <div className="rounded-2xl border bg-card p-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto">
                <IconCheck size={28} className="text-green-600" />
              </div>
              <div>
                <p className="text-base font-semibold">{tt('successTitle')}</p>
                <p className="text-sm text-muted-foreground mt-1">{tt('successDesc')}</p>
              </div>
              <div className="rounded-xl border bg-secondary/40 p-3 text-sm text-left space-y-1">
                <p>
                  <span className="text-muted-foreground">{tt('order')}: </span>
                  {selectedBestellung.fields.ordered_items ?? tt('unknown')}
                </p>
                <p>
                  <span className="text-muted-foreground">{tt('driver')}: </span>
                  {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name]
                    .filter(Boolean)
                    .join(' ') || tt('unknown')}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={handleReset}>{tt('newAssignment')}</Button>
                <a href="#/">
                  <Button variant="outline" className="w-full">{tt('backToDashboard')}</Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="rounded-2xl border bg-card p-4 space-y-4 overflow-hidden">
                <p className="text-sm font-semibold">{tt('confirmTitle')}</p>
                <p className="text-sm text-muted-foreground">{tt('confirmDesc')}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Order summary */}
                  <div className="rounded-xl border bg-secondary/30 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                      <IconPackage size={14} />
                      {tt('order')}
                    </div>
                    <p className="text-sm font-semibold line-clamp-2 min-w-0">
                      {selectedBestellung.fields.ordered_items ?? tt('unknown')}
                    </p>
                    <p className="text-xs text-muted-foreground truncate min-w-0">
                      {formatDeliveryAddress(selectedBestellung)}
                    </p>
                    <p className="text-xs font-medium">{formatCurrency(selectedBestellung.fields.total_amount)}</p>
                  </div>

                  {/* Driver summary */}
                  <div className="rounded-xl border bg-secondary/30 p-3 space-y-2">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                      <IconTruck size={14} />
                      {tt('driver')}
                    </div>
                    <p className="text-sm font-semibold">
                      {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name]
                        .filter(Boolean)
                        .join(' ') || tt('unknown')}
                    </p>
                    <p className="text-xs text-muted-foreground">{getVehicleLabel(selectedFahrer)}</p>
                    {selectedFahrer.fields.delivery_zone && (
                      <p className="text-xs text-muted-foreground">{selectedFahrer.fields.delivery_zone}</p>
                    )}
                    {selectedFahrer.fields.driver_phone && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <IconPhone size={11} />
                        {selectedFahrer.fields.driver_phone}
                      </p>
                    )}
                  </div>
                </div>

                {submitError && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2">
                    <IconAlertCircle size={16} className="text-destructive flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-destructive">{submitError}</p>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={handleAssign}
                    disabled={submitting}
                    className="flex-1"
                  >
                    {submitting ? tt('assigning') : tt('assign')}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setStep(2)}
                    disabled={submitting}
                  >
                    {tt('goBack')}
                  </Button>
                </div>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {!selectedBestellung ? tt('needsStep1') : tt('needsStep2')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
