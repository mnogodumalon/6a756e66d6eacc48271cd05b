/**
 * Bestellung abwickeln — 3-Schritt-Wizard.
 * Steps: 1) Offene Bestellung wählen → 2) Verfügbaren Fahrer wählen → 3) Bestätigen & absenden.
 * Reads: bestellverwaltung (filter: order_status neu|in_bearbeitung|bereit_zur_lieferung),
 *        fahrerverwaltung (filter: driver_status verfuegbar).
 * Writes: updateBestellverwaltungEntry (fahrer + order_status 'unterwegs'),
 *         updateFahrerverwaltungEntry (driver_status 'im_einsatz') — both via Promise.all().
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { makeT } from '@/i18n';
import type { Bestellverwaltung, Fahrerverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { IconTruck, IconUser, IconCheck, IconAlertCircle, IconPackage } from '@tabler/icons-react';

const tt = makeT({
  de: {
    step1: 'Bestellung',
    step2: 'Fahrer',
    step3: 'Bestätigen',
    pageTitle: 'Bestellung abwickeln',
    subtitle: 'Bestellung einem Fahrer zuweisen und in Lieferung schicken',
    selectOrder: 'Bestellung auswählen',
    selectOrderDesc: 'Nur Bestellungen mit Status „Neu", „In Bearbeitung" oder „Bereit zur Lieferung"',
    noOrders: 'Keine offenen Bestellungen vorhanden',
    selectDriver: 'Fahrer auswählen',
    selectDriverDesc: 'Nur Fahrer mit Status „Verfügbar"',
    noDrivers: 'Keine verfügbaren Fahrer',
    confirmTitle: 'Bestellung abschicken',
    confirmDesc: 'Bestellung dem Fahrer zuweisen und Status auf „Unterwegs" setzen.',
    orderSummary: 'Bestellung',
    driverSummary: 'Fahrer',
    items: 'Bestellte Artikel',
    total: 'Gesamtbetrag',
    deliveryTime: 'Gewünschte Lieferzeit',
    deliveryAddress: 'Lieferadresse',
    vehicleType: 'Fahrzeugtyp',
    zone: 'Liefergebiet',
    submitBtn: 'Jetzt abschicken',
    submitting: 'Wird abgeschickt…',
    successTitle: 'Bestellung erfolgreich abgeschickt!',
    successDesc: 'Die Bestellung wurde {driver} zugewiesen und ist jetzt unterwegs.',
    newOrder: 'Neue Bestellung abwickeln',
    backDashboard: 'Zurück zum Dashboard',
    errorTitle: 'Fehler beim Abschicken',
    noSelection: 'Dieser Schritt braucht die Auswahl aus Schritt {n}.',
    restart: 'Neu starten',
    currency: '€',
    noDeliveryTime: 'Keine Angabe',
  },
  en: {
    step1: 'Order',
    step2: 'Driver',
    step3: 'Confirm',
    pageTitle: 'Process Order',
    subtitle: 'Assign an order to a driver and send it out for delivery',
    selectOrder: 'Select order',
    selectOrderDesc: 'Only orders with status "New", "In Progress", or "Ready for Delivery"',
    noOrders: 'No open orders available',
    selectDriver: 'Select driver',
    selectDriverDesc: 'Only drivers with status "Available"',
    noDrivers: 'No available drivers',
    confirmTitle: 'Dispatch order',
    confirmDesc: 'Assign the order to the driver and set status to "En Route".',
    orderSummary: 'Order',
    driverSummary: 'Driver',
    items: 'Ordered items',
    total: 'Total amount',
    deliveryTime: 'Requested delivery time',
    deliveryAddress: 'Delivery address',
    vehicleType: 'Vehicle type',
    zone: 'Delivery zone',
    submitBtn: 'Dispatch now',
    submitting: 'Dispatching…',
    successTitle: 'Order successfully dispatched!',
    successDesc: 'The order has been assigned to {driver} and is now en route.',
    newOrder: 'Process another order',
    backDashboard: 'Back to Dashboard',
    errorTitle: 'Error dispatching',
    noSelection: 'This step requires the selection from step {n}.',
    restart: 'Start over',
    currency: '€',
    noDeliveryTime: 'Not specified',
  },
  cs: {
    step1: 'Objednávka',
    step2: 'Řidič',
    step3: 'Potvrdit',
    pageTitle: 'Zpracovat objednávku',
    subtitle: 'Přiřadit objednávku řidiči a odeslat k doručení',
    selectOrder: 'Vybrat objednávku',
    selectOrderDesc: 'Pouze objednávky se stavem „Nová", „Zpracovává se" nebo „Připravena k doručení"',
    noOrders: 'Žádné otevřené objednávky',
    selectDriver: 'Vybrat řidiče',
    selectDriverDesc: 'Pouze řidiči se stavem „Dostupný"',
    noDrivers: 'Žádní dostupní řidiči',
    confirmTitle: 'Odeslat objednávku',
    confirmDesc: 'Přiřadit objednávku řidiči a nastavit stav na „Na cestě".',
    orderSummary: 'Objednávka',
    driverSummary: 'Řidič',
    items: 'Objednané položky',
    total: 'Celková částka',
    deliveryTime: 'Požadovaný čas doručení',
    deliveryAddress: 'Adresa doručení',
    vehicleType: 'Typ vozidla',
    zone: 'Oblast doručení',
    submitBtn: 'Odeslat',
    submitting: 'Odesílám…',
    successTitle: 'Objednávka úspěšně odeslána!',
    successDesc: 'Objednávka byla přiřazena řidiči {driver} a je na cestě.',
    newOrder: 'Zpracovat další objednávku',
    backDashboard: 'Zpět na dashboard',
    errorTitle: 'Chyba při odesílání',
    noSelection: 'Tento krok vyžaduje výběr z kroku {n}.',
    restart: 'Začít znovu',
    currency: '€',
    noDeliveryTime: 'Neuvedeno',
  },
});

const ELIGIBLE_ORDER_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung']);

export default function BestellungAbwickelnPage() {
  const { bestellverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(null);
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successDriverName, setSuccessDriverName] = useState<string | null>(null);

  const eligibleOrders = (bestellverwaltung as Bestellverwaltung[]).filter(
    (b) => ELIGIBLE_ORDER_STATUSES.has(b.fields.order_status?.key ?? '')
  );

  const availableDrivers = (fahrerverwaltung as Fahrerverwaltung[]).filter(
    (f) => f.fields.driver_status?.key === 'verfuegbar'
  );

  const selectedBestellung = selectedBestellungId
    ? (bestellverwaltung as Bestellverwaltung[]).find((b) => b.record_id === selectedBestellungId) ?? null
    : null;

  const selectedFahrer = selectedFahrerId
    ? (fahrerverwaltung as Fahrerverwaltung[]).find((f) => f.record_id === selectedFahrerId) ?? null
    : null;

  const handleSubmit = async () => {
    if (!selectedBestellungId || !selectedFahrerId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await Promise.all([
        LivingAppsService.updateBestellverwaltungEntry(selectedBestellungId, {
          fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId),
          order_status: 'unterwegs',
        }),
        LivingAppsService.updateFahrerverwaltungEntry(selectedFahrerId, {
          driver_status: 'im_einsatz',
        }),
      ]);
      const driverName = [
        selectedFahrer?.fields.driver_first_name,
        selectedFahrer?.fields.driver_last_name,
      ]
        .filter(Boolean)
        .join(' ');
      setSuccessDriverName(driverName || selectedFahrerId);
      await fetchAll();
      setStep(4);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedBestellungId(null);
    setSelectedFahrerId(null);
    setSubmitError(null);
    setSuccessDriverName(null);
    setStep(1);
  };

  const formatDeliveryTime = (val: string | undefined): string => {
    if (!val) return tt('noDeliveryTime');
    // already in YYYY-MM-DDTHH:MM form — display as-is (localize separators)
    const [datePart, timePart] = val.split('T');
    if (datePart && timePart) {
      const [y, m, d] = datePart.split('-');
      return `${d}.${m}.${y}, ${timePart}`;
    }
    if (datePart) {
      const [y, m, d] = datePart.split('-');
      return `${d}.${m}.${y}`;
    }
    return val;
  };

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
      ]}
      currentStep={step <= 3 ? step : 3}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Bestellung auswählen */}
      {step === 1 && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">{tt('selectOrderDesc')}</p>
          <EntitySelectStep
            items={eligibleOrders.map((b) => ({
              id: b.record_id,
              title: b.fields.ordered_items
                ? b.fields.ordered_items.length > 60
                  ? b.fields.ordered_items.slice(0, 60) + '…'
                  : b.fields.ordered_items
                : b.record_id,
              subtitle: [
                b.fields.delivery_city,
                b.fields.total_amount != null
                  ? `${b.fields.total_amount.toFixed(2)} ${tt('currency')}`
                  : null,
                b.fields.desired_delivery_time
                  ? formatDeliveryTime(b.fields.desired_delivery_time)
                  : null,
              ]
                .filter(Boolean)
                .join(' · '),
              status: b.fields.order_status
                ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
                : undefined,
              icon: <IconPackage size={20} className="text-primary" />,
            }))}
            onSelect={(id) => {
              setSelectedBestellungId(id);
              setStep(2);
            }}
            searchPlaceholder={tt('selectOrder')}
            emptyText={tt('noOrders')}
            emptyIcon={<IconPackage size={32} className="text-muted-foreground" />}
          />
        </div>
      )}

      {/* Step 2: Fahrer auswählen */}
      {step === 2 && (
        selectedBestellungId ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{tt('selectDriverDesc')}</p>
            <EntitySelectStep
              items={availableDrivers.map((f) => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name]
                  .filter(Boolean)
                  .join(' ') || f.record_id,
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone,
                ]
                  .filter(Boolean)
                  .join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconUser size={20} className="text-primary" />,
              }))}
              onSelect={(id) => {
                setSelectedFahrerId(id);
                setStep(3);
              }}
              searchPlaceholder={tt('selectDriver')}
              emptyText={tt('noDrivers')}
              emptyIcon={<IconTruck size={32} className="text-muted-foreground" />}
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noSelection', { n: 1 })}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3: Bestätigen & Abschicken */}
      {step === 3 && (
        selectedBestellungId && selectedFahrerId ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{tt('confirmDesc')}</p>

            {/* Bestellung summary */}
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b bg-secondary/40 flex items-center gap-2">
                <IconPackage size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium">{tt('orderSummary')}</span>
                {selectedBestellung?.fields.order_status && (
                  <StatusBadge
                    statusKey={selectedBestellung.fields.order_status.key}
                    label={selectedBestellung.fields.order_status.label}
                    className="ml-auto"
                  />
                )}
              </div>
              <div className="px-4 py-3 space-y-2 text-sm">
                {selectedBestellung?.fields.ordered_items && (
                  <div>
                    <span className="text-muted-foreground">{tt('items')}: </span>
                    <span>{selectedBestellung.fields.ordered_items}</span>
                  </div>
                )}
                {selectedBestellung?.fields.total_amount != null && (
                  <div>
                    <span className="text-muted-foreground">{tt('total')}: </span>
                    <span className="font-semibold">
                      {selectedBestellung.fields.total_amount.toFixed(2)} {tt('currency')}
                    </span>
                  </div>
                )}
                <div>
                  <span className="text-muted-foreground">{tt('deliveryTime')}: </span>
                  <span>{formatDeliveryTime(selectedBestellung?.fields.desired_delivery_time)}</span>
                </div>
                {(selectedBestellung?.fields.delivery_street ||
                  selectedBestellung?.fields.delivery_city) && (
                  <div>
                    <span className="text-muted-foreground">{tt('deliveryAddress')}: </span>
                    <span>
                      {[
                        selectedBestellung?.fields.delivery_street,
                        selectedBestellung?.fields.delivery_house_number,
                        selectedBestellung?.fields.delivery_postal_code,
                        selectedBestellung?.fields.delivery_city,
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Fahrer summary */}
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b bg-secondary/40 flex items-center gap-2">
                <IconUser size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium">{tt('driverSummary')}</span>
                {selectedFahrer?.fields.driver_status && (
                  <StatusBadge
                    statusKey={selectedFahrer.fields.driver_status.key}
                    label={selectedFahrer.fields.driver_status.label}
                    className="ml-auto"
                  />
                )}
              </div>
              <div className="px-4 py-3 space-y-2 text-sm">
                <div className="font-medium">
                  {[selectedFahrer?.fields.driver_first_name, selectedFahrer?.fields.driver_last_name]
                    .filter(Boolean)
                    .join(' ')}
                </div>
                {selectedFahrer?.fields.vehicle_type?.label && (
                  <div>
                    <span className="text-muted-foreground">{tt('vehicleType')}: </span>
                    <span>{selectedFahrer.fields.vehicle_type.label}</span>
                  </div>
                )}
                {selectedFahrer?.fields.delivery_zone && (
                  <div>
                    <span className="text-muted-foreground">{tt('zone')}: </span>
                    <span>{selectedFahrer.fields.delivery_zone}</span>
                  </div>
                )}
              </div>
            </div>

            {submitError && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 flex items-start gap-2 text-sm text-destructive">
                <IconAlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{tt('errorTitle')}: {submitError}</span>
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleSubmit}
              disabled={submitting}
            >
              <IconTruck size={16} className="mr-2" />
              {submitting ? tt('submitting') : tt('submitBtn')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tt('noSelection', { n: selectedBestellungId ? 2 : 1 })}
            </p>
            <Button variant="outline" onClick={() => setStep(selectedBestellungId ? 2 : 1)}>
              {tt('restart')}
            </Button>
          </div>
        )
      )}

      {/* Step 4: Erfolg */}
      {step === 4 && (
        <div className="text-center py-12 space-y-4">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-2">
            <IconCheck size={32} className="text-primary" />
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold">{tt('successTitle')}</h3>
            <p className="text-sm text-muted-foreground">
              {tt('successDesc', { driver: successDriverName ?? '' })}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button onClick={handleReset} variant="outline">
              {tt('newOrder')}
            </Button>
            <Button asChild>
              <a href="#/">{tt('backDashboard')}</a>
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
