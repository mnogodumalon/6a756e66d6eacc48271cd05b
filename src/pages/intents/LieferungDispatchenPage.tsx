/**
 * Lieferung Dispatchen — 3-Schritt-Wizard.
 * Steps: 1) Bestellung auswählen (nur order_status='bereit_zur_lieferung') →
 *        2) Fahrer zuweisen (nur driver_status='verfuegbar') →
 *        3) Bestätigen & Dispatchen (setzt order_status='unterwegs', driver_status='im_einsatz').
 * Reads: bestellverwaltung, fahrerverwaltung, kundenverwaltung.
 * Writes: updateBestellverwaltungEntry (fahrer, order_status), updateFahrerverwaltungEntry (driver_status).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconTruck, IconUser, IconCheck, IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { makeT } from '@/i18n';
import { APP_IDS } from '@/types/app';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Fahrerverwaltung } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';

const tt = makeT({
  de: {
    title: 'Lieferung dispatchen', /* i18n-exempt */
    subtitle: 'Bestellung einem verfügbaren Fahrer zuweisen',
    step1: 'Bestellung',
    step2: 'Fahrer',
    step3: 'Bestätigen',
    selectOrder: 'Bestellung auswählen',
    selectOrderSub: 'Nur Bestellungen bereit zur Lieferung',
    selectDriver: 'Fahrer zuweisen',
    selectDriverSub: 'Nur verfügbare Fahrer',
    confirm: 'Bestätigen & Dispatchen',
    noOrders: 'Keine Bestellungen bereit zur Lieferung',
    noDrivers: 'Keine verfügbaren Fahrer',
    orderItems: 'Bestellte Artikel',
    totalAmount: 'Gesamtbetrag',
    deliveryTime: 'Gewünschte Lieferzeit',
    deliveryCity: 'Lieferort',
    customer: 'Kunde',
    driverName: 'Fahrer',
    vehicleType: 'Fahrzeugtyp',
    zone: 'Lieferzone',
    phone: 'Telefon',
    selectedOrder: 'Ausgewählte Bestellung',
    selectedDriver: 'Ausgewählter Fahrer',
    dispatch: 'Jetzt dispatchen',
    dispatching: 'Wird dispatcht…',
    successTitle: 'Erfolgreich dispatcht!',
    successMsg: 'Die Bestellung wurde dem Fahrer zugewiesen und ist jetzt unterwegs.',
    dispatchAnother: 'Weitere Bestellung dispatchen',
    backToDashboard: 'Zurück zum Dashboard',
    errorTitle: 'Fehler beim Dispatchen',
    noOrderSelected: 'Bitte zuerst eine Bestellung in Schritt 1 auswählen.',
    noDriverSelected: 'Bitte zuerst einen Fahrer in Schritt 2 auswählen.',
    restart: 'Neu starten',
    currency: '€',
    unknown: 'Unbekannt',
    searchOrders: 'Bestellung suchen…',
    searchDrivers: 'Fahrer suchen…',
  },
  en: {
    title: 'Dispatch Delivery', /* i18n-exempt */
    subtitle: 'Assign order to an available driver',
    step1: 'Order',
    step2: 'Driver',
    step3: 'Confirm',
    selectOrder: 'Select Order',
    selectOrderSub: 'Only orders ready for delivery',
    selectDriver: 'Assign Driver',
    selectDriverSub: 'Only available drivers',
    confirm: 'Confirm & Dispatch',
    noOrders: 'No orders ready for delivery',
    noDrivers: 'No available drivers',
    orderItems: 'Ordered items',
    totalAmount: 'Total amount',
    deliveryTime: 'Desired delivery time',
    deliveryCity: 'Delivery city',
    customer: 'Customer',
    driverName: 'Driver',
    vehicleType: 'Vehicle type',
    zone: 'Delivery zone',
    phone: 'Phone',
    selectedOrder: 'Selected order',
    selectedDriver: 'Selected driver',
    dispatch: 'Dispatch now',
    dispatching: 'Dispatching…',
    successTitle: 'Successfully dispatched!',
    successMsg: 'The order has been assigned to the driver and is now on its way.',
    dispatchAnother: 'Dispatch another order',
    backToDashboard: 'Back to Dashboard',
    errorTitle: 'Dispatch error',
    noOrderSelected: 'Please select an order in step 1 first.',
    noDriverSelected: 'Please select a driver in step 2 first.',
    restart: 'Restart',
    currency: '€',
    unknown: 'Unknown',
    searchOrders: 'Search order…',
    searchDrivers: 'Search driver…',
  },
  cs: {
    title: 'Odeslat doručení', /* i18n-exempt */
    subtitle: 'Přiřadit objednávku dostupnému řidiči',
    step1: 'Objednávka',
    step2: 'Řidič',
    step3: 'Potvrdit',
    selectOrder: 'Vybrat objednávku',
    selectOrderSub: 'Pouze objednávky připravené k doručení',
    selectDriver: 'Přiřadit řidiče',
    selectDriverSub: 'Pouze dostupní řidiči',
    confirm: 'Potvrdit a odeslat',
    noOrders: 'Žádné objednávky připravené k doručení',
    noDrivers: 'Žádní dostupní řidiči',
    orderItems: 'Objednané položky',
    totalAmount: 'Celková částka',
    deliveryTime: 'Požadovaný čas doručení',
    deliveryCity: 'Město doručení',
    customer: 'Zákazník',
    driverName: 'Řidič',
    vehicleType: 'Typ vozidla',
    zone: 'Doručovací zóna',
    phone: 'Telefon',
    selectedOrder: 'Vybraná objednávka',
    selectedDriver: 'Vybraný řidič',
    dispatch: 'Odeslat nyní',
    dispatching: 'Odesílání…',
    successTitle: 'Úspěšně odesláno!',
    successMsg: 'Objednávka byla přiřazena řidiči a je nyní na cestě.',
    dispatchAnother: 'Odeslat další objednávku',
    backToDashboard: 'Zpět na přehled',
    errorTitle: 'Chyba při odesílání',
    noOrderSelected: 'Nejprve vyberte objednávku v kroku 1.',
    noDriverSelected: 'Nejprve vyberte řidiče v kroku 2.',
    restart: 'Začít znovu',
    currency: '€',
    unknown: 'Neznámý',
    searchOrders: 'Hledat objednávku…',
    searchDrivers: 'Hledat řidiče…',
  },
});

export default function LieferungDispatchenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStep = parseInt(searchParams.get('step') ?? '1', 10);
  const initialBestellungId = searchParams.get('bestellungId') ?? null;
  const initialFahrerId = searchParams.get('fahrerId') ?? null;

  const [step, setStep] = useState(isNaN(initialStep) ? 1 : Math.min(Math.max(initialStep, 1), 3));
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(initialBestellungId);
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(initialFahrerId);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchError, setDispatchError] = useState<string | null>(null);
  const [dispatchSuccess, setDispatchSuccess] = useState(false);

  const { bestellverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const handleStepChange = (newStep: number) => {
    setStep(newStep);
    const params: Record<string, string> = { step: String(newStep) };
    if (selectedBestellungId) params.bestellungId = selectedBestellungId;
    if (selectedFahrerId) params.fahrerId = selectedFahrerId;
    setSearchParams(params);
  };

  const handleSelectBestellung = (id: string) => {
    setSelectedBestellungId(id);
    setSelectedFahrerId(null);
    setDispatchSuccess(false);
    setDispatchError(null);
    const params: Record<string, string> = { step: '2', bestellungId: id };
    setSearchParams(params);
    setStep(2);
  };

  const handleSelectFahrer = (id: string) => {
    setSelectedFahrerId(id);
    setDispatchError(null);
    const params: Record<string, string> = { step: '3' };
    if (selectedBestellungId) params.bestellungId = selectedBestellungId;
    params.fahrerId = id;
    setSearchParams(params);
    setStep(3);
  };

  const handleDispatch = async () => {
    if (!selectedBestellungId || !selectedFahrerId) return;
    setDispatching(true);
    setDispatchError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellungId, {
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId),
        order_status: 'unterwegs',
      });
      await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrerId, {
        driver_status: 'im_einsatz',
      });
      await fetchAll();
      setDispatchSuccess(true);
    } catch (e) {
      setDispatchError(e instanceof Error ? e.message : String(e));
    } finally {
      setDispatching(false);
    }
  };

  const handleReset = () => {
    setSelectedBestellungId(null);
    setSelectedFahrerId(null);
    setDispatchSuccess(false);
    setDispatchError(null);
    setSearchParams({ step: '1' });
    setStep(1);
  };

  const readyOrders = (bestellverwaltung as EnrichedBestellverwaltung[]).filter(
    (b) => b.fields.order_status?.key === 'bereit_zur_lieferung'
  );

  const availableDrivers = (fahrerverwaltung as Fahrerverwaltung[]).filter(
    (f) => f.fields.driver_status?.key === 'verfuegbar'
  );

  const selectedBestellung = selectedBestellungId
    ? (bestellverwaltung as EnrichedBestellverwaltung[]).find((b) => b.record_id === selectedBestellungId)
    : null;

  const selectedFahrer = selectedFahrerId
    ? (fahrerverwaltung as Fahrerverwaltung[]).find((f) => f.record_id === selectedFahrerId)
    : null;

  const formatAmount = (amount?: number) =>
    amount != null ? `${amount.toFixed(2)} ${tt('currency')}` : '—';

  const formatDeliveryTime = (dt?: string) => {
    if (!dt) return '—';
    // dt is already in YYYY-MM-DDTHH:MM format or YYYY-MM-DD
    return dt.replace('T', ' ');
  };

  const resolveKundeName = (bestellung: EnrichedBestellverwaltung) => {
    if (bestellung.kundeName && bestellung.kundeName !== '') return bestellung.kundeName;
    if (bestellung.fields.kunde) {
      const id = extractRecordId(bestellung.fields.kunde);
      return id ?? tt('unknown');
    }
    return tt('unknown');
  };

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Bestellung auswählen */}
      {step === 1 && (
        <EntitySelectStep
          items={readyOrders.map((b) => ({
            id: b.record_id,
            title: b.fields.ordered_items ?? tt('unknown'),
            subtitle: [
              b.fields.delivery_city ? `${tt('deliveryCity')}: ${b.fields.delivery_city}` : null,
              b.fields.total_amount != null ? `${tt('totalAmount')}: ${formatAmount(b.fields.total_amount)}` : null,
              b.fields.desired_delivery_time ? `${tt('deliveryTime')}: ${formatDeliveryTime(b.fields.desired_delivery_time)}` : null,
            ]
              .filter(Boolean)
              .join(' · '),
            status: b.fields.order_status
              ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
              : undefined,
            stats: [
              { label: tt('customer'), value: resolveKundeName(b) },
              { label: tt('totalAmount'), value: formatAmount(b.fields.total_amount) },
            ],
            icon: <IconTruck size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectBestellung}
          searchPlaceholder={tt('searchOrders')}
          emptyText={tt('noOrders')}
          emptyIcon={<IconTruck size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Fahrer zuweisen */}
      {step === 2 && (
        selectedBestellungId ? (
          <div className="space-y-4">
            {/* Kurzinfo zur gewählten Bestellung */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex items-start gap-3">
              <IconTruck size={20} className="text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{tt('selectedOrder')}</p>
                <p className="font-medium truncate">{selectedBestellung?.fields.ordered_items ?? tt('unknown')}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedBestellung?.fields.delivery_city ?? ''}
                  {selectedBestellung?.fields.total_amount != null
                    ? ` · ${formatAmount(selectedBestellung.fields.total_amount)}`
                    : ''}
                </p>
              </div>
              {selectedBestellung?.fields.order_status && (
                <StatusBadge
                  statusKey={selectedBestellung.fields.order_status.key}
                  label={selectedBestellung.fields.order_status.label}
                  className="ml-auto shrink-0"
                />
              )}
            </div>

            <EntitySelectStep
              items={availableDrivers.map((f) => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || tt('unknown'),
                subtitle: [
                  f.fields.vehicle_type?.label ? `${tt('vehicleType')}: ${f.fields.vehicle_type.label}` : null,
                  f.fields.delivery_zone ? `${tt('zone')}: ${f.fields.delivery_zone}` : null,
                  f.fields.driver_phone ? `${tt('phone')}: ${f.fields.driver_phone}` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                stats: [
                  { label: tt('vehicleType'), value: f.fields.vehicle_type?.label ?? '—' },
                  { label: tt('zone'), value: f.fields.delivery_zone ?? '—' },
                ],
                icon: <IconUser size={20} className="text-primary" />,
              }))}
              onSelect={handleSelectFahrer}
              searchPlaceholder={tt('searchDrivers')}
              emptyText={tt('noDrivers')}
              emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noOrderSelected')}</p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>
              {tt('restart')}
            </Button>
          </div>
        )
      )}

      {/* Step 3: Bestätigen & Dispatchen */}
      {step === 3 && (
        !selectedBestellungId ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noOrderSelected')}</p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>
              {tt('restart')}
            </Button>
          </div>
        ) : !selectedFahrerId ? (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noDriverSelected')}</p>
            <Button variant="outline" onClick={() => handleStepChange(2)}>
              {tt('restart')}
            </Button>
          </div>
        ) : dispatchSuccess ? (
          <div className="flex flex-col items-center py-12 space-y-4">
            <div className="rounded-full bg-primary/10 p-4">
              <IconCheck size={40} className="text-primary" stroke={2} />
            </div>
            <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
            <p className="text-sm text-muted-foreground text-center max-w-sm">{tt('successMsg')}</p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2 w-full max-w-xs">
              <Button className="w-full" onClick={handleReset}>
                {tt('dispatchAnother')}
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <a href="#/">{tt('backToDashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5">
            <h2 className="text-base font-semibold">{tt('confirm')}</h2>

            {/* Bestellung Summary */}
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-4 py-3 bg-secondary/40 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tt('selectedOrder')}
                </p>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate min-w-0">
                    {selectedBestellung?.fields.ordered_items ?? tt('unknown')}
                  </span>
                  {selectedBestellung?.fields.order_status && (
                    <StatusBadge
                      statusKey={selectedBestellung.fields.order_status.key}
                      label={selectedBestellung.fields.order_status.label}
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {selectedBestellung?.fields.delivery_city && (
                    <>
                      <span>{tt('deliveryCity')}</span>
                      <span className="font-medium text-foreground truncate">
                        {selectedBestellung.fields.delivery_city}
                      </span>
                    </>
                  )}
                  {selectedBestellung?.fields.total_amount != null && (
                    <>
                      <span>{tt('totalAmount')}</span>
                      <span className="font-medium text-foreground">
                        {formatAmount(selectedBestellung.fields.total_amount)}
                      </span>
                    </>
                  )}
                  {selectedBestellung?.fields.desired_delivery_time && (
                    <>
                      <span>{tt('deliveryTime')}</span>
                      <span className="font-medium text-foreground truncate">
                        {formatDeliveryTime(selectedBestellung.fields.desired_delivery_time)}
                      </span>
                    </>
                  )}
                  {selectedBestellung && (
                    <>
                      <span>{tt('customer')}</span>
                      <span className="font-medium text-foreground truncate">
                        {resolveKundeName(selectedBestellung)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Fahrer Summary */}
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-4 py-3 bg-secondary/40 border-b">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  {tt('selectedDriver')}
                </p>
              </div>
              <div className="p-4 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    {[selectedFahrer?.fields.driver_first_name, selectedFahrer?.fields.driver_last_name]
                      .filter(Boolean)
                      .join(' ') || tt('unknown')}
                  </span>
                  {selectedFahrer?.fields.driver_status && (
                    <StatusBadge
                      statusKey={selectedFahrer.fields.driver_status.key}
                      label={selectedFahrer.fields.driver_status.label}
                    />
                  )}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  {selectedFahrer?.fields.vehicle_type && (
                    <>
                      <span>{tt('vehicleType')}</span>
                      <span className="font-medium text-foreground">
                        {selectedFahrer.fields.vehicle_type.label}
                      </span>
                    </>
                  )}
                  {selectedFahrer?.fields.delivery_zone && (
                    <>
                      <span>{tt('zone')}</span>
                      <span className="font-medium text-foreground truncate">
                        {selectedFahrer.fields.delivery_zone}
                      </span>
                    </>
                  )}
                  {selectedFahrer?.fields.driver_phone && (
                    <>
                      <span>{tt('phone')}</span>
                      <span className="font-medium text-foreground">
                        {selectedFahrer.fields.driver_phone}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Error */}
            {dispatchError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
                <IconAlertCircle size={20} className="text-destructive shrink-0 mt-0.5" stroke={2} />
                <div className="min-w-0">
                  <p className="font-medium text-destructive text-sm">{tt('errorTitle')}</p>
                  <p className="text-xs text-destructive/80 mt-1 break-words">{dispatchError}</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                className="w-full sm:w-auto"
                disabled={dispatching}
                onClick={handleDispatch}
              >
                {dispatching ? (
                  <>
                    <IconRefresh size={16} className="mr-2 animate-spin" stroke={2} />
                    {tt('dispatching')}
                  </>
                ) : (
                  <>
                    <IconTruck size={16} className="mr-2" stroke={2} />
                    {tt('dispatch')}
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                disabled={dispatching}
                onClick={() => handleStepChange(2)}
              >
                {tt('selectDriver')}
              </Button>
            </div>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
