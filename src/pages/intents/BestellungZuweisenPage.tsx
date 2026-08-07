/**
 * Bestellung zuweisen — 3-Schritt-Wizard.
 * Steps: 1) Offene Bestellung auswählen (order_status 'neu' | 'bereit_zur_lieferung')
 *        → 2) Verfügbaren Fahrer auswählen (driver_status 'verfuegbar')
 *        → 3) Bestätigen & Lieferung starten (update Bestellung + Fahrer).
 * Reads: bestellverwaltung, fahrerverwaltung.
 * Writes: updateBestellverwaltungEntry (fahrer + order_status → 'unterwegs'),
 *         updateFahrerverwaltungEntry (driver_status → 'im_einsatz').
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useCallback } from 'react';
import { makeT } from '@/i18n';
import type { Bestellverwaltung, Fahrerverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { IconTruck, IconUser, IconCircleCheck, IconAlertCircle } from '@tabler/icons-react';

const tt = makeT({
  de: {
    pageTitle: 'Bestellung zuweisen',
    subtitle: 'Offene Bestellung einem verfügbaren Fahrer zuweisen',
    step1: 'Bestellung',
    step2: 'Fahrer',
    step3: 'Bestätigen',
    step1_search: 'Bestellung suchen…',
    step1_empty: 'Keine offenen Bestellungen vorhanden.',
    step1_badge: '{n} ausstehend',
    step2_search: 'Fahrer suchen…',
    step2_empty: 'Kein verfügbarer Fahrer.',
    step2_badge: '{n} verfügbar',
    order_date: 'Bestellt',
    delivery_city: 'Stadt',
    total: 'Gesamt',
    items: 'Artikel',
    vehicle: 'Fahrzeug',
    zone: 'Zone',
    phone: 'Telefon',
    confirm_title: 'Lieferung starten',
    confirm_order: 'Bestellung',
    confirm_driver: 'Fahrer',
    confirm_status: 'Neuer Status',
    confirm_btn: 'Lieferung starten',
    success_title: 'Lieferung gestartet!',
    success_desc: '{driver} wurde Bestellung #{order} zugewiesen. Status: Unterwegs.',
    success_new: 'Weitere Bestellung zuweisen',
    back_dashboard: 'Zurück zum Dashboard',
    step3_no_selection: 'Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.',
    restart: 'Neu starten',
    submitting: 'Wird gespeichert…',
    error_prefix: 'Fehler:',
    order_status_unterwegs: 'Unterwegs',
    driver_status_im_einsatz: 'Im Einsatz',
  },
  en: {
    pageTitle: 'Assign Order',
    subtitle: 'Assign an open order to an available driver',
    step1: 'Order',
    step2: 'Driver',
    step3: 'Confirm',
    step1_search: 'Search order…',
    step1_empty: 'No open orders available.',
    step1_badge: '{n} pending',
    step2_search: 'Search driver…',
    step2_empty: 'No available driver.',
    step2_badge: '{n} available',
    order_date: 'Ordered',
    delivery_city: 'City',
    total: 'Total',
    items: 'Items',
    vehicle: 'Vehicle',
    zone: 'Zone',
    phone: 'Phone',
    confirm_title: 'Start Delivery',
    confirm_order: 'Order',
    confirm_driver: 'Driver',
    confirm_status: 'New Status',
    confirm_btn: 'Start Delivery',
    success_title: 'Delivery started!',
    success_desc: '{driver} has been assigned order #{order}. Status: On the way.',
    success_new: 'Assign another order',
    back_dashboard: 'Back to Dashboard',
    step3_no_selection: 'This step requires selections from step 1 and 2.',
    restart: 'Start over',
    submitting: 'Saving…',
    error_prefix: 'Error:',
    order_status_unterwegs: 'On the Way',
    driver_status_im_einsatz: 'On Duty',
  },
  cs: {
    pageTitle: 'Přiřadit objednávku',
    subtitle: 'Přiřadit otevřenou objednávku dostupnému řidiči',
    step1: 'Objednávka',
    step2: 'Řidič',
    step3: 'Potvrdit',
    step1_search: 'Hledat objednávku…',
    step1_empty: 'Žádné otevřené objednávky.',
    step1_badge: '{n} čekající',
    step2_search: 'Hledat řidiče…',
    step2_empty: 'Žádný dostupný řidič.',
    step2_badge: '{n} dostupný',
    order_date: 'Objednáno',
    delivery_city: 'Město',
    total: 'Celkem',
    items: 'Položky',
    vehicle: 'Vozidlo',
    zone: 'Zóna',
    phone: 'Telefon',
    confirm_title: 'Spustit doručení',
    confirm_order: 'Objednávka',
    confirm_driver: 'Řidič',
    confirm_status: 'Nový stav',
    confirm_btn: 'Spustit doručení',
    success_title: 'Doručení zahájeno!',
    success_desc: '{driver} byl přiřazen k objednávce #{order}. Stav: Na cestě.',
    success_new: 'Přiřadit další objednávku',
    back_dashboard: 'Zpět na dashboard',
    step3_no_selection: 'Tento krok vyžaduje výběr z kroku 1 a 2.',
    restart: 'Začít znovu',
    submitting: 'Ukládám…',
    error_prefix: 'Chyba:',
    order_status_unterwegs: 'Na cestě',
    driver_status_im_einsatz: 'Ve službě',
  },
});

function formatAmount(amount: number | undefined): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

function truncate(text: string | undefined, max = 60): string {
  if (!text) return '—';
  return text.length > max ? text.slice(0, max) + '…' : text;
}

function vehicleLabel(key: string | undefined): string {
  if (!key) return '—';
  const map: Record<string, string> = {
    fahrrad: 'Fahrrad',
    e_bike: 'E-Bike',
    motorroller: 'Motorroller',
    pkw: 'PKW',
    transporter: 'Transporter',
  };
  return map[key] ?? key;
}

export default function BestellungZuweisenPage() {
  const { bestellverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(null);
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Filter eligible records (must be before any early return per rules of hooks)
  const offeneBestellungen = bestellverwaltung.filter(
    (b: Bestellverwaltung) =>
      b.fields.order_status?.key === 'neu' ||
      b.fields.order_status?.key === 'bereit_zur_lieferung',
  );

  const verfuegbareFahrer = fahrerverwaltung.filter(
    (f: Fahrerverwaltung) => f.fields.driver_status?.key === 'verfuegbar',
  );

  const selectedBestellung = offeneBestellungen.find(b => b.record_id === selectedBestellungId) ?? null;
  const selectedFahrer = verfuegbareFahrer.find(f => f.record_id === selectedFahrerId) ?? null;

  const handleSubmit = useCallback(async () => {
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
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [selectedBestellungId, selectedFahrerId, fetchAll]);

  const handleReset = useCallback(() => {
    setSelectedBestellungId(null);
    setSelectedFahrerId(null);
    setSubmitError(null);
    setDone(false);
    setStep(1);
  }, []);

  if (done && selectedBestellung && selectedFahrer) {
    const driverName = `${selectedFahrer.fields.driver_first_name ?? ''} ${selectedFahrer.fields.driver_last_name ?? ''}`.trim();
    const orderRef = selectedBestellung.fields.order_date
      ? selectedBestellung.fields.order_date.slice(0, 10)
      : selectedBestellung.record_id.slice(-6);
    return (
      <IntentWizardShell
        title={tt('pageTitle')}
        subtitle={tt('subtitle')}
        steps={[{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]}
        currentStep={3}
        onStepChange={setStep}
        loading={false}
        error={null}
        onRetry={fetchAll}
      >
        <div className="flex flex-col items-center justify-center py-16 space-y-6 text-center">
          <div className="rounded-full bg-green-100 p-4">
            <IconCircleCheck size={48} className="text-green-600" stroke={1.5} />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold">{tt('success_title')}</h2>
            <p className="text-muted-foreground max-w-sm">
              {tt('success_desc', { driver: driverName, order: orderRef })}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <Button className="flex-1" onClick={handleReset}>
              {tt('success_new')}
            </Button>
            <Button variant="outline" className="flex-1" asChild>
              <a href="#/">{tt('back_dashboard')}</a>
            </Button>
          </div>
        </div>
      </IntentWizardShell>
    );
  }

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1 — Bestellung auswählen */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
              <IconTruck size={14} stroke={2} />
              {tt('step1_badge', { n: offeneBestellungen.length })}
            </span>
          </div>
          <EntitySelectStep
            searchPlaceholder={tt('step1_search')}
            emptyText={tt('step1_empty')}
            emptyIcon={<IconTruck size={32} className="text-muted-foreground" stroke={1.5} />}
            items={offeneBestellungen.map(b => ({
              id: b.record_id,
              title: b.fields.delivery_city
                ? `${tt('delivery_city')}: ${b.fields.delivery_city}`
                : `#${b.record_id.slice(-6)}`,
              subtitle: [
                b.fields.order_date ? `${tt('order_date')}: ${b.fields.order_date.slice(0, 10)}` : null,
                b.fields.total_amount != null ? `${tt('total')}: ${formatAmount(b.fields.total_amount)}` : null,
                b.fields.ordered_items ? `${tt('items')}: ${truncate(b.fields.ordered_items, 50)}` : null,
              ]
                .filter(Boolean)
                .join(' · '),
              status: b.fields.order_status
                ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
                : undefined,
              icon: <IconTruck size={20} className="text-primary" stroke={1.5} />,
            }))}
            onSelect={(id) => {
              setSelectedBestellungId(id);
              setStep(2);
            }}
          />
        </div>
      )}

      {/* Step 2 — Fahrer auswählen */}
      {step === 2 && (
        selectedBestellungId ? (
          <div className="space-y-4">
            {selectedBestellung && (
              <div className="rounded-xl border bg-secondary p-3 flex items-center gap-3 overflow-hidden">
                <IconTruck size={18} className="text-muted-foreground shrink-0" stroke={1.5} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{tt('confirm_order')}</p>
                  <p className="font-medium truncate">
                    {selectedBestellung.fields.delivery_city ?? `#${selectedBestellung.record_id.slice(-6)}`}
                    {selectedBestellung.fields.total_amount != null && (
                      <span className="ml-2 text-sm text-muted-foreground">
                        {formatAmount(selectedBestellung.fields.total_amount)}
                      </span>
                    )}
                  </p>
                </div>
                {selectedBestellung.fields.order_status && (
                  <StatusBadge
                    statusKey={selectedBestellung.fields.order_status.key}
                    label={selectedBestellung.fields.order_status.label}
                  />
                )}
              </div>
            )}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
                <IconUser size={14} stroke={2} />
                {tt('step2_badge', { n: verfuegbareFahrer.length })}
              </span>
            </div>
            <EntitySelectStep
              searchPlaceholder={tt('step2_search')}
              emptyText={tt('step2_empty')}
              emptyIcon={<IconUser size={32} className="text-muted-foreground" stroke={1.5} />}
              items={verfuegbareFahrer.map(f => ({
                id: f.record_id,
                title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || f.record_id.slice(-6),
                subtitle: [
                  f.fields.vehicle_type ? `${tt('vehicle')}: ${vehicleLabel(f.fields.vehicle_type.key)}` : null,
                  f.fields.delivery_zone ? `${tt('zone')}: ${f.fields.delivery_zone}` : null,
                  f.fields.driver_phone ? `${tt('phone')}: ${f.fields.driver_phone}` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconUser size={20} className="text-primary" stroke={1.5} />,
              }))}
              onSelect={(id) => {
                setSelectedFahrerId(id);
                setStep(3);
              }}
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step3_no_selection')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3 — Bestätigung & Durchführung */}
      {step === 3 && (
        selectedBestellungId && selectedFahrerId ? (
          <div className="space-y-6">
            <h3 className="font-semibold text-lg">{tt('confirm_title')}</h3>

            <div className="rounded-2xl border bg-card overflow-hidden shadow-sm">
              {/* Bestellung */}
              <div className="p-4 border-b">
                <p className="text-xs text-muted-foreground mb-1">{tt('confirm_order')}</p>
                {selectedBestellung ? (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium truncate">
                        {selectedBestellung.fields.delivery_city ?? `#${selectedBestellung.record_id.slice(-6)}`}
                      </p>
                      {selectedBestellung.fields.ordered_items && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {truncate(selectedBestellung.fields.ordered_items, 80)}
                        </p>
                      )}
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        {selectedBestellung.fields.order_date && (
                          <span>{tt('order_date')}: {selectedBestellung.fields.order_date.slice(0, 10)}</span>
                        )}
                        {selectedBestellung.fields.total_amount != null && (
                          <span>{tt('total')}: {formatAmount(selectedBestellung.fields.total_amount)}</span>
                        )}
                      </div>
                    </div>
                    {selectedBestellung.fields.order_status && (
                      <StatusBadge
                        statusKey={selectedBestellung.fields.order_status.key}
                        label={selectedBestellung.fields.order_status.label}
                      />
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>

              {/* Fahrer */}
              <div className="p-4 border-b">
                <p className="text-xs text-muted-foreground mb-1">{tt('confirm_driver')}</p>
                {selectedFahrer ? (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium truncate">
                        {`${selectedFahrer.fields.driver_first_name ?? ''} ${selectedFahrer.fields.driver_last_name ?? ''}`.trim() || '—'}
                      </p>
                      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                        {selectedFahrer.fields.vehicle_type && (
                          <span>{tt('vehicle')}: {vehicleLabel(selectedFahrer.fields.vehicle_type.key)}</span>
                        )}
                        {selectedFahrer.fields.delivery_zone && (
                          <span>{tt('zone')}: {selectedFahrer.fields.delivery_zone}</span>
                        )}
                        {selectedFahrer.fields.driver_phone && (
                          <span>{tt('phone')}: {selectedFahrer.fields.driver_phone}</span>
                        )}
                      </div>
                    </div>
                    {selectedFahrer.fields.driver_status && (
                      <StatusBadge
                        statusKey={selectedFahrer.fields.driver_status.key}
                        label={selectedFahrer.fields.driver_status.label}
                      />
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">—</p>
                )}
              </div>

              {/* Neuer Status */}
              <div className="p-4 bg-secondary/50">
                <p className="text-xs text-muted-foreground mb-2">{tt('confirm_status')}</p>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center gap-2">
                    <IconTruck size={16} className="text-muted-foreground" stroke={1.5} />
                    <StatusBadge statusKey="unterwegs" label={tt('order_status_unterwegs')} />
                  </div>
                  <div className="flex items-center gap-2">
                    <IconUser size={16} className="text-muted-foreground" stroke={1.5} />
                    <StatusBadge statusKey="im_einsatz" label={tt('driver_status_im_einsatz')} />
                  </div>
                </div>
              </div>
            </div>

            {submitError && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <IconAlertCircle size={16} stroke={2} />
                <span>{tt('error_prefix')} {submitError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                className="flex-1"
                disabled={submitting}
                onClick={handleSubmit}
              >
                <IconTruck size={16} stroke={2} className="mr-2" />
                {submitting ? tt('submitting') : tt('confirm_btn')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                disabled={submitting}
                onClick={() => setStep(2)}
              >
                {tt('restart')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step3_no_selection')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
