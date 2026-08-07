/**
 * Bestellung Zuweisen — 3-Schritt-Wizard.
 * Steps: 1) Offene Bestellung auswählen → 2) Verfügbaren Fahrer zuweisen →
 *        3) Zuweisung bestätigen & Bestellung auf 'unterwegs' setzen.
 * Reads: bestellverwaltung, fahrerverwaltung, kundenverwaltung.
 * Writes: bestellverwaltung (updateBestellverwaltungEntry),
 *         fahrerverwaltung (updateFahrerverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Bestellverwaltung, Fahrerverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { IconTruck, IconUser, IconPackage, IconCheck, IconAlertCircle, IconMapPin, IconPhone } from '@tabler/icons-react';

const tt = makeT({
  de: {
    pageTitle: 'Bestellung zuweisen',
    subtitle: 'Bestellung einem Fahrer zuweisen und auf Unterwegs setzen',
    step1: 'Bestellung',
    step2: 'Fahrer',
    step3: 'Bestätigen',
    selectOrder: 'Bestellung auswählen',
    selectOrderHint: 'Wähle eine offene Bestellung aus',
    selectDriver: 'Fahrer auswählen',
    selectDriverHint: 'Nur verfügbare Fahrer werden angezeigt',
    noOpenOrders: 'Keine offenen Bestellungen vorhanden',
    noDrivers: 'Keine verfügbaren Fahrer vorhanden',
    customer: 'Kunde',
    items: 'Artikel',
    total: 'Gesamt',
    deliveryTime: 'Gewünschte Lieferzeit',
    deliveryAddress: 'Lieferadresse',
    zone: 'Liefergebiet',
    phone: 'Telefon',
    vehicle: 'Fahrzeug',
    confirmTitle: 'Zuweisung bestätigen',
    confirmDesc: 'Bestellung wird dem Fahrer zugewiesen und auf "Unterwegs" gesetzt.',
    orderLabel: 'Bestellung',
    driverLabel: 'Fahrer',
    assign: 'Jetzt zuweisen',
    assigning: 'Wird zugewiesen…',
    successTitle: 'Zuweisung erfolgreich!',
    successDesc: 'Die Bestellung ist dem Fahrer zugewiesen und steht auf "Unterwegs".',
    newAssignment: 'Neue Zuweisung',
    backToDashboard: 'Zurück zum Dashboard',
    errorTitle: 'Fehler bei der Zuweisung',
    retry: 'Erneut versuchen',
    stepBack: 'Zurück',
    continue: 'Weiter',
    selectedOrder: 'Ausgewählte Bestellung',
    selectedDriver: 'Ausgewählter Fahrer',
    noSelection: 'Keine Auswahl — bitte von vorne beginnen.',
    restart: 'Neu starten',
    unknown: 'Unbekannt',
  },
  en: {
    pageTitle: 'Assign Order',
    subtitle: 'Assign an order to a driver and set it to En Route',
    step1: 'Order',
    step2: 'Driver',
    step3: 'Confirm',
    selectOrder: 'Select order',
    selectOrderHint: 'Select an open order',
    selectDriver: 'Select driver',
    selectDriverHint: 'Only available drivers are shown',
    noOpenOrders: 'No open orders available',
    noDrivers: 'No available drivers',
    customer: 'Customer',
    items: 'Items',
    total: 'Total',
    deliveryTime: 'Requested delivery time',
    deliveryAddress: 'Delivery address',
    zone: 'Delivery zone',
    phone: 'Phone',
    vehicle: 'Vehicle',
    confirmTitle: 'Confirm assignment',
    confirmDesc: 'The order will be assigned to the driver and set to "En Route".',
    orderLabel: 'Order',
    driverLabel: 'Driver',
    assign: 'Assign now',
    assigning: 'Assigning…',
    successTitle: 'Assignment successful!',
    successDesc: 'The order has been assigned to the driver and is now "En Route".',
    newAssignment: 'New assignment',
    backToDashboard: 'Back to Dashboard',
    errorTitle: 'Assignment error',
    retry: 'Try again',
    stepBack: 'Back',
    continue: 'Continue',
    selectedOrder: 'Selected order',
    selectedDriver: 'Selected driver',
    noSelection: 'No selection — please start over.',
    restart: 'Start over',
    unknown: 'Unknown',
  },
  cs: {
    pageTitle: 'Přiřadit objednávku',
    subtitle: 'Přiřadit objednávku řidiči a nastavit na cestě',
    step1: 'Objednávka',
    step2: 'Řidič',
    step3: 'Potvrdit',
    selectOrder: 'Vybrat objednávku',
    selectOrderHint: 'Vyberte otevřenou objednávku',
    selectDriver: 'Vybrat řidiče',
    selectDriverHint: 'Zobrazují se pouze dostupní řidiči',
    noOpenOrders: 'Žádné otevřené objednávky',
    noDrivers: 'Žádní dostupní řidiči',
    customer: 'Zákazník',
    items: 'Položky',
    total: 'Celkem',
    deliveryTime: 'Požadovaný čas doručení',
    deliveryAddress: 'Adresa doručení',
    zone: 'Oblast doručení',
    phone: 'Telefon',
    vehicle: 'Vozidlo',
    confirmTitle: 'Potvrdit přiřazení',
    confirmDesc: 'Objednávka bude přiřazena řidiči a nastavena na "Na cestě".',
    orderLabel: 'Objednávka',
    driverLabel: 'Řidič',
    assign: 'Přiřadit nyní',
    assigning: 'Přiřazuji…',
    successTitle: 'Přiřazení úspěšné!',
    successDesc: 'Objednávka byla přiřazena řidiči a je nyní "Na cestě".',
    newAssignment: 'Nové přiřazení',
    backToDashboard: 'Zpět na dashboard',
    errorTitle: 'Chyba při přiřazování',
    retry: 'Zkusit znovu',
    stepBack: 'Zpět',
    continue: 'Pokračovat',
    selectedOrder: 'Vybraná objednávka',
    selectedDriver: 'Vybraný řidič',
    noSelection: 'Žádný výběr — prosím začni znovu.',
    restart: 'Začít znovu',
    unknown: 'Neznámý',
  },
});

const ELIGIBLE_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung']);

export default function BestellungZuweisenPage() {
  const { bestellverwaltung, fahrerverwaltung, kundenverwaltungMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedBestellung, setSelectedBestellung] = useState<Bestellverwaltung | null>(null);
  const [selectedFahrer, setSelectedFahrer] = useState<Fahrerverwaltung | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const offeneBestellungen = bestellverwaltung.filter(b => {
    const key = b.fields.order_status?.key;
    return key && ELIGIBLE_STATUSES.has(key);
  });

  const verfuegbareFahrer = fahrerverwaltung.filter(f => f.fields.driver_status?.key === 'verfuegbar');

  const handleSelectBestellung = (id: string) => {
    const b = bestellverwaltung.find(b => b.record_id === id) ?? null;
    setSelectedBestellung(b);
    setStep(2);
  };

  const handleSelectFahrer = (id: string) => {
    const f = fahrerverwaltung.find(f => f.record_id === id) ?? null;
    setSelectedFahrer(f);
    setStep(3);
  };

  const handleAssign = async () => {
    if (!selectedBestellung || !selectedFahrer) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellung.record_id, {
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrer.record_id),
        order_status: 'unterwegs',
      });
      await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrer.record_id, {
        driver_status: 'im_einsatz',
      });
      await fetchAll();
      setSuccess(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedBestellung(null);
    setSelectedFahrer(null);
    setSubmitError(null);
    setSuccess(false);
    setStep(1);
  };

  const getKundeName = (bestellung: Bestellverwaltung) => {
    const kundeUrl = bestellung.fields.kunde;
    if (!kundeUrl) return tt('unknown');
    const kundeId = extractRecordId(kundeUrl);
    if (!kundeId) return tt('unknown');
    const kunde = kundenverwaltungMap.get(kundeId);
    if (!kunde) return tt('unknown');
    return [kunde.fields.first_name, kunde.fields.last_name].filter(Boolean).join(' ') || tt('unknown');
  };

  const getDeliveryAddress = (b: Bestellverwaltung) => {
    const parts = [
      b.fields.delivery_street,
      b.fields.delivery_house_number,
      b.fields.delivery_postal_code,
      b.fields.delivery_city,
    ].filter(Boolean);
    return parts.join(', ') || '—';
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
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Bestellung auswählen */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneBestellungen.map(b => ({
            id: b.record_id,
            title: b.fields.ordered_items
              ? b.fields.ordered_items.length > 60
                ? b.fields.ordered_items.slice(0, 60) + '…'
                : b.fields.ordered_items
              : `#${b.record_id.slice(-6)}`,
            subtitle: `${tt('customer')}: ${getKundeName(b)}${b.fields.desired_delivery_time ? ' · ' + formatDate(b.fields.desired_delivery_time) : ''}`,
            status: b.fields.order_status
              ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
              : undefined,
            stats: [
              ...(b.fields.total_amount != null
                ? [{ label: tt('total'), value: `€ ${b.fields.total_amount.toFixed(2)}` }]
                : []),
              { label: tt('deliveryAddress'), value: getDeliveryAddress(b) },
            ],
            icon: <IconPackage size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectBestellung}
          searchPlaceholder={tt('selectOrderHint')}
          emptyText={tt('noOpenOrders')}
          emptyIcon={<IconPackage size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Fahrer zuweisen */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Live-Kontext: Ausgewählte Bestellung */}
          {selectedBestellung ? (
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{tt('selectedOrder')}</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 items-start">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {selectedBestellung.fields.ordered_items
                      ? selectedBestellung.fields.ordered_items.length > 80
                        ? selectedBestellung.fields.ordered_items.slice(0, 80) + '…'
                        : selectedBestellung.fields.ordered_items
                      : `#${selectedBestellung.record_id.slice(-6)}`}
                  </p>
                  <p className="text-sm text-muted-foreground">{tt('customer')}: {getKundeName(selectedBestellung)}</p>
                </div>
                <div className="text-right shrink-0">
                  {selectedBestellung.fields.order_status && (
                    <StatusBadge
                      statusKey={selectedBestellung.fields.order_status.key}
                      label={selectedBestellung.fields.order_status.label}
                    />
                  )}
                  {selectedBestellung.fields.total_amount != null && (
                    <p className="text-sm font-semibold mt-1">€ {selectedBestellung.fields.total_amount.toFixed(2)}</p>
                  )}
                </div>
              </div>
              {getDeliveryAddress(selectedBestellung) !== '—' && (
                <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <IconMapPin size={14} />
                  <span className="truncate">{getDeliveryAddress(selectedBestellung)}</span>
                </div>
              )}
              {selectedBestellung.fields.desired_delivery_time && (
                <p className="text-sm text-muted-foreground">{tt('deliveryTime')}: {formatDate(selectedBestellung.fields.desired_delivery_time)}</p>
              )}
            </div>
          ) : (
            <div className="rounded-2xl border bg-secondary/40 p-4 text-sm text-muted-foreground text-center space-y-2">
              <p>{tt('noSelection')}</p>
              <Button variant="outline" size="sm" onClick={() => setStep(1)}>{tt('restart')}</Button>
            </div>
          )}

          {/* Fahrerliste */}
          <EntitySelectStep
            items={verfuegbareFahrer.map(f => ({
              id: f.record_id,
              title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || `#${f.record_id.slice(-6)}`,
              subtitle: [
                f.fields.vehicle_type?.label,
                f.fields.delivery_zone ? `${tt('zone')}: ${f.fields.delivery_zone}` : undefined,
              ].filter(Boolean).join(' · '),
              status: f.fields.driver_status
                ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                : undefined,
              stats: [
                ...(f.fields.driver_phone ? [{ label: tt('phone'), value: f.fields.driver_phone }] : []),
                ...(f.fields.vehicle_type ? [{ label: tt('vehicle'), value: f.fields.vehicle_type.label }] : []),
              ],
              icon: <IconUser size={20} className="text-primary" />,
            }))}
            onSelect={handleSelectFahrer}
            searchPlaceholder={tt('selectDriverHint')}
            emptyText={tt('noDrivers')}
            emptyIcon={<IconTruck size={32} className="text-muted-foreground" />}
          />

          <div className="pt-2">
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('stepBack')}
            </Button>
          </div>
        </div>
      )}

      {/* Step 3: Bestätigen */}
      {step === 3 && (
        <div className="space-y-4">
          {selectedBestellung && selectedFahrer ? (
            <>
              {/* Summary */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Bestellung */}
                <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <IconPackage size={14} />
                    {tt('orderLabel')}
                  </div>
                  <p className="font-semibold truncate">
                    {selectedBestellung.fields.ordered_items
                      ? selectedBestellung.fields.ordered_items.length > 60
                        ? selectedBestellung.fields.ordered_items.slice(0, 60) + '…'
                        : selectedBestellung.fields.ordered_items
                      : `#${selectedBestellung.record_id.slice(-6)}`}
                  </p>
                  <p className="text-sm text-muted-foreground truncate">{tt('customer')}: {getKundeName(selectedBestellung)}</p>
                  {selectedBestellung.fields.order_status && (
                    <StatusBadge
                      statusKey={selectedBestellung.fields.order_status.key}
                      label={selectedBestellung.fields.order_status.label}
                    />
                  )}
                  {selectedBestellung.fields.total_amount != null && (
                    <p className="text-sm font-semibold">€ {selectedBestellung.fields.total_amount.toFixed(2)}</p>
                  )}
                  {getDeliveryAddress(selectedBestellung) !== '—' && (
                    <div className="flex items-start gap-1.5 text-sm text-muted-foreground">
                      <IconMapPin size={14} className="mt-0.5 shrink-0" />
                      <span className="break-words">{getDeliveryAddress(selectedBestellung)}</span>
                    </div>
                  )}
                </div>

                {/* Fahrer */}
                <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    <IconUser size={14} />
                    {tt('driverLabel')}
                  </div>
                  <p className="font-semibold truncate">
                    {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name].filter(Boolean).join(' ') || `#${selectedFahrer.record_id.slice(-6)}`}
                  </p>
                  {selectedFahrer.fields.driver_status && (
                    <StatusBadge
                      statusKey={selectedFahrer.fields.driver_status.key}
                      label={selectedFahrer.fields.driver_status.label}
                    />
                  )}
                  {selectedFahrer.fields.vehicle_type && (
                    <p className="text-sm text-muted-foreground">{tt('vehicle')}: {selectedFahrer.fields.vehicle_type.label}</p>
                  )}
                  {selectedFahrer.fields.delivery_zone && (
                    <p className="text-sm text-muted-foreground">{tt('zone')}: {selectedFahrer.fields.delivery_zone}</p>
                  )}
                  {selectedFahrer.fields.driver_phone && (
                    <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                      <IconPhone size={14} />
                      <span>{selectedFahrer.fields.driver_phone}</span>
                    </div>
                  )}
                </div>
              </div>

              <p className="text-sm text-muted-foreground">{tt('confirmDesc')}</p>

              {submitError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex items-start gap-2 text-sm text-destructive">
                  <IconAlertCircle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-medium">{tt('errorTitle')}</p>
                    <p>{submitError}</p>
                  </div>
                </div>
              )}

              {success ? (
                <div className="rounded-2xl border bg-card p-6 text-center space-y-3">
                  <div className="flex justify-center">
                    <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <IconCheck size={24} className="text-primary" />
                    </div>
                  </div>
                  <h3 className="font-semibold text-lg">{tt('successTitle')}</h3>
                  <p className="text-sm text-muted-foreground">{tt('successDesc')}</p>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center pt-2">
                    <Button onClick={handleReset}>{tt('newAssignment')}</Button>
                    <Button variant="outline" asChild>
                      <a href="#/">{tt('backToDashboard')}</a>
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 pt-2">
                  <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                    {tt('stepBack')}
                  </Button>
                  <Button onClick={handleAssign} disabled={submitting}>
                    {submitting ? (
                      <span className="flex items-center gap-2">
                        <IconTruck size={16} className="animate-pulse" />
                        {tt('assigning')}
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <IconTruck size={16} />
                        {tt('assign')}
                      </span>
                    )}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noSelection')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
            </div>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
