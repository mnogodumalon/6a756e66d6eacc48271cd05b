/**
 * Lieferung starten — 3-Schritt-Wizard.
 * Steps: 1) Bestellung wählen (nur bereit_zur_lieferung) → 2) Fahrer zuweisen (nur verfuegbar) → 3) Bestätigen & starten.
 * Reads: bestellverwaltung, fahrerverwaltung. Writes: bestellverwaltung (updateBestellverwaltungEntry), fahrerverwaltung (updateFahrerverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Bestellverwaltung, Fahrerverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { formatDateTime, formatCurrency } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import {
  IconTruck,
  IconUser,
  IconCheck,
  IconMapPin,
  IconCurrencyEuro,
  IconClock,
  IconAlertCircle,
  IconCircleCheck,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    pageTitle: 'Lieferung starten',
    subtitle: 'Bestellung einem Fahrer zuweisen und auf den Weg schicken',
    step1: 'Bestellung',
    step2: 'Fahrer',
    step3: 'Bestätigen',
    pickOrder: 'Lieferbereite Bestellung wählen',
    pickOrderSub: 'Nur Bestellungen mit Status „Bereit zur Lieferung" werden angezeigt.',
    noOrders: 'Keine lieferbereiten Bestellungen',
    noOrdersDesc: 'Es gibt aktuell keine Bestellungen mit Status „Bereit zur Lieferung".',
    pickDriver: 'Verfügbaren Fahrer zuweisen',
    pickDriverSub: 'Nur Fahrer mit Status „Verfügbar" werden angezeigt.',
    noDrivers: 'Keine verfügbaren Fahrer',
    noDriversDesc: 'Es gibt aktuell keinen Fahrer mit Status „Verfügbar".',
    deliveryAddr: 'Lieferadresse',
    orderTotal: 'Bestellwert',
    deliveryTime: 'Gewünschte Lieferzeit',
    orderedItems: 'Bestellte Artikel',
    zone: 'Liefergebiet',
    vehicle: 'Fahrzeug',
    phone: 'Telefon',
    confirmTitle: 'Lieferung bestätigen & starten',
    confirmDesc: 'Die folgenden Änderungen werden gespeichert:',
    orderWillBe: 'Bestellung wird auf „Unterwegs" gesetzt',
    driverWillBe: 'Fahrer wird auf „Im Einsatz" gesetzt',
    startDelivery: 'Lieferung starten',
    starting: 'Wird gestartet…',
    successTitle: 'Lieferung gestartet!',
    successDesc: 'Fahrer {driver} ist nun unterwegs zur Bestellung.',
    newDelivery: 'Weitere Lieferung starten',
    backDash: 'Zurück zum Dashboard',
    orderLabel: 'Bestellung',
    driverLabel: 'Fahrer',
    noSelection: 'Keine Auswahl — bitte von vorne beginnen.',
    restart: 'Neu starten',
    errorTitle: 'Fehler beim Starten',
  },
  en: {
    pageTitle: 'Start Delivery',
    subtitle: 'Assign an order to a driver and send them on their way',
    step1: 'Order',
    step2: 'Driver',
    step3: 'Confirm',
    pickOrder: 'Select a ready-to-deliver order',
    pickOrderSub: 'Only orders with status "Ready for Delivery" are shown.',
    noOrders: 'No orders ready for delivery',
    noOrdersDesc: 'There are currently no orders with status "Ready for Delivery".',
    pickDriver: 'Assign an available driver',
    pickDriverSub: 'Only drivers with status "Available" are shown.',
    noDrivers: 'No drivers available',
    noDriversDesc: 'There are currently no drivers with status "Available".',
    deliveryAddr: 'Delivery address',
    orderTotal: 'Order total',
    deliveryTime: 'Requested delivery time',
    orderedItems: 'Ordered items',
    zone: 'Delivery zone',
    vehicle: 'Vehicle',
    phone: 'Phone',
    confirmTitle: 'Confirm & start delivery',
    confirmDesc: 'The following changes will be saved:',
    orderWillBe: 'Order will be set to "En Route"',
    driverWillBe: 'Driver will be set to "On Duty"',
    startDelivery: 'Start delivery',
    starting: 'Starting…',
    successTitle: 'Delivery started!',
    successDesc: 'Driver {driver} is now en route to the order.',
    newDelivery: 'Start another delivery',
    backDash: 'Back to Dashboard',
    orderLabel: 'Order',
    driverLabel: 'Driver',
    noSelection: 'No selection — please start over.',
    restart: 'Start over',
    errorTitle: 'Error starting delivery',
  },
});

export default function LieferungStartenPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const initialStep = parseInt(searchParams.get('step') ?? '1', 10);
  const initialBestellungId = searchParams.get('bestellungId') ?? null;

  const [step, setStep] = useState<number>(
    initialStep >= 1 && initialStep <= 3 ? initialStep : 1
  );
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(initialBestellungId);
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [successDriverName, setSuccessDriverName] = useState('');

  const { bestellverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const handleStepChange = useCallback((s: number) => {
    setStep(s);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('step', String(s));
      return next;
    });
  }, [setSearchParams]);

  const handleSelectBestellung = useCallback((id: string) => {
    setSelectedBestellungId(id);
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.set('bestellungId', id);
      next.set('step', '2');
      return next;
    });
    handleStepChange(2);
  }, [handleStepChange, setSearchParams]);

  const handleSelectFahrer = useCallback((id: string) => {
    setSelectedFahrerId(id);
    handleStepChange(3);
  }, [handleStepChange]);

  const readyOrders = bestellverwaltung.filter(
    (b: Bestellverwaltung) => b.fields.order_status?.key === 'bereit_zur_lieferung'
  );

  const availableDrivers = fahrerverwaltung.filter(
    (f: Fahrerverwaltung) => f.fields.driver_status?.key === 'verfuegbar'
  );

  const selectedBestellung = selectedBestellungId
    ? bestellverwaltung.find((b: Bestellverwaltung) => b.record_id === selectedBestellungId) ?? null
    : null;

  const selectedFahrer = selectedFahrerId
    ? fahrerverwaltung.find((f: Fahrerverwaltung) => f.record_id === selectedFahrerId) ?? null
    : null;

  const handleStart = async () => {
    if (!selectedBestellungId || !selectedFahrerId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const fahrer = fahrerverwaltung.find((f: Fahrerverwaltung) => f.record_id === selectedFahrerId);
      const fahrName = [fahrer?.fields.driver_first_name, fahrer?.fields.driver_last_name]
        .filter(Boolean)
        .join(' ');

      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellungId, {
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId),
        order_status: 'unterwegs',
      });

      await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrerId, {
        driver_status: 'im_einsatz',
      });

      setSuccessDriverName(fahrName);
      setSuccess(true);
      void fetchAll();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Unbekannter Fehler');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedBestellungId(null);
    setSelectedFahrerId(null);
    setSuccess(false);
    setSubmitError(null);
    setSearchParams({});
    handleStepChange(1);
  };

  const steps = [
    { label: tt('step1') },
    { label: tt('step2') },
    { label: tt('step3') },
  ];

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl border bg-card shadow-lg p-8 text-center space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-green-100 p-4">
              <IconCircleCheck size={48} className="text-green-600" stroke={1.5} />
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">{tt('successTitle')}</h2>
            <p className="text-muted-foreground text-sm">
              {tt('successDesc', { driver: successDriverName })}
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button onClick={handleReset} className="w-full">
              {tt('newDelivery')}
            </Button>
            <a href="#/" className="text-sm text-muted-foreground hover:text-foreground underline">
              {tt('backDash')}
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={steps}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Schritt 1: Bestellung wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={readyOrders.map((b: Bestellverwaltung) => {
            const addr = [
              b.fields.delivery_street,
              b.fields.delivery_house_number,
              b.fields.delivery_postal_code,
              b.fields.delivery_city,
            ]
              .filter(Boolean)
              .join(', ');
            return {
              id: b.record_id,
              title: b.fields.ordered_items
                ? b.fields.ordered_items.slice(0, 60) + (b.fields.ordered_items.length > 60 ? '…' : '')
                : `Bestellung #${b.record_id.slice(-6)}`,
              subtitle: addr || '—',
              status: b.fields.order_status
                ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
                : undefined,
              stats: [
                {
                  label: tt('orderTotal'),
                  value: formatCurrency(b.fields.total_amount),
                },
                {
                  label: tt('deliveryTime'),
                  value: formatDateTime(b.fields.desired_delivery_time),
                },
              ],
              icon: <IconTruck size={20} className="text-primary" stroke={1.5} />,
            };
          })}
          onSelect={handleSelectBestellung}
          emptyText={tt('noOrders')}
          emptyIcon={<IconTruck size={32} className="text-muted-foreground" stroke={1.5} />}
          searchPlaceholder={tt('pickOrder')}
        />
      )}

      {/* ── Schritt 2: Fahrer zuweisen ── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Zusammenfassung der gewählten Bestellung */}
          {selectedBestellung ? (
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <IconTruck size={16} stroke={1.5} />
                <span>{tt('orderLabel')}</span>
                {selectedBestellung.fields.order_status && (
                  <StatusBadge
                    statusKey={selectedBestellung.fields.order_status.key}
                    label={selectedBestellung.fields.order_status.label}
                  />
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconMapPin size={12} stroke={1.5} />
                    {tt('deliveryAddr')}
                  </p>
                  <p className="text-foreground font-medium truncate">
                    {[
                      selectedBestellung.fields.delivery_street,
                      selectedBestellung.fields.delivery_house_number,
                      selectedBestellung.fields.delivery_postal_code,
                      selectedBestellung.fields.delivery_city,
                    ]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <IconCurrencyEuro size={12} stroke={1.5} />
                    {tt('orderTotal')}
                  </p>
                  <p className="text-foreground font-medium">
                    {formatCurrency(selectedBestellung.fields.total_amount)}
                  </p>
                </div>
                {selectedBestellung.fields.desired_delivery_time && (
                  <div className="space-y-1 sm:col-span-2">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <IconClock size={12} stroke={1.5} />
                      {tt('deliveryTime')}
                    </p>
                    <p className="text-foreground font-medium">
                      {formatDateTime(selectedBestellung.fields.desired_delivery_time)}
                    </p>
                  </div>
                )}
                {selectedBestellung.fields.ordered_items && (
                  <div className="space-y-1 sm:col-span-2">
                    <p className="text-xs text-muted-foreground">{tt('orderedItems')}</p>
                    <p className="text-foreground text-xs line-clamp-2">
                      {selectedBestellung.fields.ordered_items}
                    </p>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed p-4 text-center text-sm text-muted-foreground space-y-2">
              <p>{tt('noSelection')}</p>
              <Button variant="outline" size="sm" onClick={() => handleStepChange(1)}>
                {tt('restart')}
              </Button>
            </div>
          )}

          <EntitySelectStep
            items={availableDrivers.map((f: Fahrerverwaltung) => ({
              id: f.record_id,
              title: [f.fields.driver_first_name, f.fields.driver_last_name]
                .filter(Boolean)
                .join(' ') || `Fahrer #${f.record_id.slice(-6)}`,
              subtitle: [
                f.fields.delivery_zone ? `Zone: ${f.fields.delivery_zone}` : null,
                f.fields.vehicle_type?.label ? f.fields.vehicle_type.label : null,
                f.fields.driver_phone ? f.fields.driver_phone : null,
              ]
                .filter(Boolean)
                .join(' · '),
              status: f.fields.driver_status
                ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                : undefined,
              stats: [
                ...(f.fields.vehicle_type ? [{ label: tt('vehicle'), value: f.fields.vehicle_type.label }] : []),
                ...(f.fields.delivery_zone ? [{ label: tt('zone'), value: f.fields.delivery_zone }] : []),
                ...(f.fields.driver_phone ? [{ label: tt('phone'), value: f.fields.driver_phone }] : []),
              ],
              icon: <IconUser size={20} className="text-primary" stroke={1.5} />,
            }))}
            onSelect={handleSelectFahrer}
            emptyText={tt('noDrivers')}
            emptyIcon={<IconUser size={32} className="text-muted-foreground" stroke={1.5} />}
            searchPlaceholder={tt('pickDriver')}
          />
        </div>
      )}

      {/* ── Schritt 3: Bestätigen & Starten ── */}
      {step === 3 && (
        <div className="space-y-6">
          {selectedBestellung && selectedFahrer ? (
            <>
              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">{tt('confirmTitle')}</h3>

                {/* Bestellungs-Zusammenfassung */}
                <div className="rounded-2xl border bg-card shadow-sm p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <IconTruck size={16} stroke={1.5} />
                    <span>{tt('orderLabel')}</span>
                    {selectedBestellung.fields.order_status && (
                      <StatusBadge
                        statusKey={selectedBestellung.fields.order_status.key}
                        label={selectedBestellung.fields.order_status.label}
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <IconMapPin size={12} stroke={1.5} />
                        {tt('deliveryAddr')}
                      </p>
                      <p className="text-foreground font-medium truncate">
                        {[
                          selectedBestellung.fields.delivery_street,
                          selectedBestellung.fields.delivery_house_number,
                          selectedBestellung.fields.delivery_postal_code,
                          selectedBestellung.fields.delivery_city,
                        ]
                          .filter(Boolean)
                          .join(', ') || '—'}
                      </p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <IconCurrencyEuro size={12} stroke={1.5} />
                        {tt('orderTotal')}
                      </p>
                      <p className="text-foreground font-medium">
                        {formatCurrency(selectedBestellung.fields.total_amount)}
                      </p>
                    </div>
                    {selectedBestellung.fields.desired_delivery_time && (
                      <div className="space-y-1 sm:col-span-2">
                        <p className="text-xs text-muted-foreground flex items-center gap-1">
                          <IconClock size={12} stroke={1.5} />
                          {tt('deliveryTime')}
                        </p>
                        <p className="text-foreground font-medium">
                          {formatDateTime(selectedBestellung.fields.desired_delivery_time)}
                        </p>
                      </div>
                    )}
                    {selectedBestellung.fields.ordered_items && (
                      <div className="space-y-1 sm:col-span-2">
                        <p className="text-xs text-muted-foreground">{tt('orderedItems')}</p>
                        <p className="text-foreground text-xs line-clamp-2">
                          {selectedBestellung.fields.ordered_items}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Fahrer-Zusammenfassung */}
                <div className="rounded-2xl border bg-card shadow-sm p-4 space-y-3">
                  <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                    <IconUser size={16} stroke={1.5} />
                    <span>{tt('driverLabel')}</span>
                    {selectedFahrer.fields.driver_status && (
                      <StatusBadge
                        statusKey={selectedFahrer.fields.driver_status.key}
                        label={selectedFahrer.fields.driver_status.label}
                      />
                    )}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                    <div className="space-y-1">
                      <p className="text-xs text-muted-foreground">{tt('driverLabel')}</p>
                      <p className="text-foreground font-medium">
                        {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name]
                          .filter(Boolean)
                          .join(' ') || '—'}
                      </p>
                    </div>
                    {selectedFahrer.fields.vehicle_type && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">{tt('vehicle')}</p>
                        <p className="text-foreground font-medium">
                          {selectedFahrer.fields.vehicle_type.label}
                        </p>
                      </div>
                    )}
                    {selectedFahrer.fields.delivery_zone && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">{tt('zone')}</p>
                        <p className="text-foreground font-medium">
                          {selectedFahrer.fields.delivery_zone}
                        </p>
                      </div>
                    )}
                    {selectedFahrer.fields.driver_phone && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">{tt('phone')}</p>
                        <p className="text-foreground font-medium">
                          {selectedFahrer.fields.driver_phone}
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Hinweis auf Änderungen */}
                <div className="rounded-xl border bg-secondary/30 p-3 space-y-1 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground text-xs">{tt('confirmDesc')}</p>
                  <p className="flex items-center gap-1.5">
                    <IconCheck size={14} stroke={2} className="text-green-600 shrink-0" />
                    {tt('orderWillBe')}
                  </p>
                  <p className="flex items-center gap-1.5">
                    <IconCheck size={14} stroke={2} className="text-green-600 shrink-0" />
                    {tt('driverWillBe')}
                  </p>
                </div>

                {submitError && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2 text-sm text-destructive">
                    <IconAlertCircle size={16} stroke={1.5} className="shrink-0 mt-0.5" />
                    <span>{tt('errorTitle')}: {submitError}</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  onClick={handleStart}
                  disabled={submitting}
                  className="w-full"
                  size="lg"
                >
                  {submitting ? (
                    tt('starting')
                  ) : (
                    <span className="flex items-center gap-2">
                      <IconTruck size={18} stroke={1.5} />
                      {tt('startDelivery')}
                    </span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => handleStepChange(2)}
                  disabled={submitting}
                  className="w-full"
                >
                  {tt('step2')} ändern
                </Button>
              </div>
            </>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noSelection')}</p>
              <Button variant="outline" onClick={() => handleStepChange(1)}>
                {tt('restart')}
              </Button>
            </div>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
