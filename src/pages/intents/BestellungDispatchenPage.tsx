/**
 * Bestellung Dispatchen — 3-Schritt-Wizard.
 * Steps: 1) Offene Bestellung wählen → 2) Verfügbaren Fahrer zuweisen → 3) Bestätigen & Dispatchen.
 * Reads: bestellverwaltung (filter: neu|in_bearbeitung|bereit_zur_lieferung), fahrerverwaltung (filter: verfuegbar).
 * Writes: bestellverwaltung (updateBestellverwaltungEntry — fahrer + order_status='unterwegs').
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 * Deep-link: ?bestellungId=xxx skips to step 2 with that Bestellung pre-selected.
 */

import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import type { Bestellverwaltung, Fahrerverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { Button } from '@/components/ui/button';
import { tx } from '@/i18n';
import {
  IconTruckDelivery,
  IconUser,
  IconMapPin,
  IconCurrencyEuro,
  IconCheck,
  IconAlertCircle,
} from '@tabler/icons-react';

const DISPATCHABLE_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung']);

export default function BestellungDispatchenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { bestellverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const preselectedBestellungId = searchParams.get('bestellungId');
  const initialStep = preselectedBestellungId ? 2 : 1;

  const [step, setStep] = useState(initialStep);
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(
    preselectedBestellungId
  );
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const offeneBestellungen = useMemo(
    () =>
      (bestellverwaltung as Bestellverwaltung[]).filter(
        (b) => b.fields.order_status && DISPATCHABLE_STATUSES.has(b.fields.order_status.key)
      ),
    [bestellverwaltung]
  );

  const verfuegbareFahrer = useMemo(
    () =>
      (fahrerverwaltung as Fahrerverwaltung[]).filter(
        (f) => f.fields.driver_status?.key === 'verfuegbar'
      ),
    [fahrerverwaltung]
  );

  const selectedBestellung = useMemo(
    () => offeneBestellungen.find((b) => b.record_id === selectedBestellungId) ?? null,
    [offeneBestellungen, selectedBestellungId]
  );

  const selectedFahrer = useMemo(
    () => verfuegbareFahrer.find((f) => f.record_id === selectedFahrerId) ?? null,
    [verfuegbareFahrer, selectedFahrerId]
  );

  function handleStepChange(s: number) {
    setStep(s);
    const params = new URLSearchParams(searchParams);
    if (selectedBestellungId) {
      params.set('bestellungId', selectedBestellungId);
    }
    setSearchParams(params, { replace: true });
  }

  function handleSelectBestellung(id: string) {
    setSelectedBestellungId(id);
    setSelectedFahrerId(null);
    setSubmitError(null);
    const params = new URLSearchParams(searchParams);
    params.set('bestellungId', id);
    setSearchParams(params, { replace: true });
    handleStepChange(2);
  }

  function handleSelectFahrer(id: string) {
    setSelectedFahrerId(id);
    handleStepChange(3);
  }

  async function handleDispatch() {
    if (!selectedBestellungId || !selectedFahrerId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellungId, {
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId),
        order_status: 'unterwegs',
      });
      await fetchAll();
      setDone(true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelectedBestellungId(null);
    setSelectedFahrerId(null);
    setSubmitError(null);
    setDone(false);
    setSearchParams({}, { replace: true });
    setStep(1);
  }

  function formatCurrency(amount?: number) {
    if (amount == null) return '—';
    return amount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' });
  }

  function truncate(text?: string, max = 80) {
    if (!text) return '—';
    return text.length > max ? text.slice(0, max) + '…' : text;
  }

  const steps = [
    { label: tx('Bestellung') },
    { label: tx('Fahrer') },
    { label: tx('Bestätigen') },
  ];

  return (
    <IntentWizardShell
      title={tx('Bestellung dispatchen')}
      subtitle={tx('Offene Bestellung einem verfügbaren Fahrer zuweisen')}
      steps={steps}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Bestellung wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneBestellungen.map((b) => ({
            id: b.record_id,
            title: b.fields.ordered_items ? truncate(b.fields.ordered_items, 60) : tx('Bestellung'),
            subtitle: [
              b.fields.order_date ? b.fields.order_date.slice(0, 10) : null,
              b.fields.delivery_city ?? null,
              b.fields.total_amount != null ? formatCurrency(b.fields.total_amount) : null,
            ]
              .filter(Boolean)
              .join(' · '),
            status: b.fields.order_status
              ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
              : undefined,
            icon: <IconTruckDelivery size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleSelectBestellung}
          searchPlaceholder={tx('Bestellung suchen …')}
          emptyText={tx('Keine offenen Bestellungen vorhanden')}
          emptyIcon={<IconTruckDelivery size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* Step 2: Fahrer zuweisen */}
      {step === 2 && (
        <div className="space-y-4">
          {selectedBestellung ? (
            <div className="rounded-2xl border bg-secondary/40 p-4 flex flex-wrap gap-3 items-start overflow-hidden">
              <div className="flex-1 min-w-0 space-y-1">
                <div className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
                  {tx('Gewählte Bestellung')}
                </div>
                <div className="font-semibold text-sm truncate">
                  {truncate(selectedBestellung.fields.ordered_items, 80)}
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                  {selectedBestellung.fields.total_amount != null && (
                    <span className="flex items-center gap-1">
                      <IconCurrencyEuro size={13} stroke={1.5} />
                      {formatCurrency(selectedBestellung.fields.total_amount)}
                    </span>
                  )}
                  {selectedBestellung.fields.delivery_city && (
                    <span className="flex items-center gap-1">
                      <IconMapPin size={13} stroke={1.5} />
                      {selectedBestellung.fields.delivery_city}
                    </span>
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
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {tx('Dieser Schritt braucht eine Bestellung aus Schritt 1.')}
              </p>
              <Button variant="outline" onClick={() => handleStepChange(1)}>
                {tx('Neu starten')}
              </Button>
            </div>
          )}

          {selectedBestellung && (
            <EntitySelectStep
              items={verfuegbareFahrer.map((f) => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name]
                  .filter(Boolean)
                  .join(' ') || tx('Fahrer'),
                subtitle: [
                  f.fields.vehicle_type?.label ?? null,
                  f.fields.delivery_zone ? tx`Zone: ${f.fields.delivery_zone}` : null,
                  f.fields.driver_phone ?? null,
                ].filter(Boolean).join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconUser size={20} className="text-primary" stroke={1.5} />,
              }))}
              onSelect={handleSelectFahrer}
              searchPlaceholder={tx('Fahrer suchen …')}
              emptyText={tx('Kein verfügbarer Fahrer gefunden')}
              emptyIcon={<IconUser size={32} className="text-muted-foreground" stroke={1.5} />}
            />
          )}
        </div>
      )}

      {/* Step 3: Bestätigen & Dispatchen */}
      {step === 3 && (
        <div className="space-y-4">
          {selectedBestellung && selectedFahrer ? (
            <>
              {done ? (
                <div className="rounded-2xl border bg-secondary/40 p-6 text-center space-y-4">
                  <div className="flex justify-center">
                    <span className="rounded-full bg-green-100 text-green-700 p-4">
                      <IconCheck size={32} stroke={2} />
                    </span>
                  </div>
                  <p className="font-semibold text-lg">
                    {tx('Bestellung erfolgreich dispatcht!')}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[
                      selectedFahrer.fields.driver_first_name,
                      selectedFahrer.fields.driver_last_name,
                    ]
                      .filter(Boolean)
                      .join(' ')}{' '}
                    {tx('ist jetzt unterwegs.')}
                  </p>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                    <Button onClick={handleReset} variant="outline">
                      {tx('Weitere Bestellung dispatchen')}
                    </Button>
                    <a href="#/">
                      <Button>{tx('Zurück zum Dashboard')}</Button>
                    </a>
                  </div>
                </div>
              ) : (
                <>
                  {/* Summary card */}
                  <div className="rounded-2xl border bg-card overflow-hidden shadow-lg">
                    <div className="p-4 border-b bg-secondary/30">
                      <h3 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                        {tx('Zusammenfassung')}
                      </h3>
                    </div>
                    <div className="p-4 space-y-4">
                      {/* Bestellung */}
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">
                          {tx('Bestellung')}
                        </div>
                        <div className="text-sm font-semibold line-clamp-2">
                          {selectedBestellung.fields.ordered_items ?? '—'}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-1">
                          {selectedBestellung.fields.total_amount != null && (
                            <span className="flex items-center gap-1">
                              <IconCurrencyEuro size={13} stroke={1.5} />
                              {formatCurrency(selectedBestellung.fields.total_amount)}
                            </span>
                          )}
                          {(selectedBestellung.fields.delivery_street ||
                            selectedBestellung.fields.delivery_city) && (
                            <span className="flex items-center gap-1">
                              <IconMapPin size={13} stroke={1.5} />
                              {[
                                selectedBestellung.fields.delivery_street,
                                selectedBestellung.fields.delivery_house_number,
                                selectedBestellung.fields.delivery_postal_code,
                                selectedBestellung.fields.delivery_city,
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="border-t" />

                      {/* Fahrer */}
                      <div className="space-y-1">
                        <div className="text-xs text-muted-foreground font-medium">
                          {tx('Fahrer')}
                        </div>
                        <div className="text-sm font-semibold">
                          {[
                            selectedFahrer.fields.driver_first_name,
                            selectedFahrer.fields.driver_last_name,
                          ]
                            .filter(Boolean)
                            .join(' ') || '—'}
                        </div>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                          {selectedFahrer.fields.vehicle_type && (
                            <span>{selectedFahrer.fields.vehicle_type.label}</span>
                          )}
                          {selectedFahrer.fields.driver_phone && (
                            <span>{selectedFahrer.fields.driver_phone}</span>
                          )}
                        </div>
                      </div>

                      <div className="border-t" />

                      {/* Neuer Status */}
                      <div className="flex items-center gap-2">
                        <div className="text-xs text-muted-foreground font-medium">
                          {tx('Neuer Status')}:
                        </div>
                        <StatusBadge statusKey="unterwegs" label={tx('Unterwegs')} />
                      </div>
                    </div>
                  </div>

                  {submitError && (
                    <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 flex items-start gap-2 text-sm text-destructive">
                      <IconAlertCircle size={16} stroke={1.5} className="mt-0.5 shrink-0" />
                      <span>{submitError}</span>
                    </div>
                  )}

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      variant="outline"
                      onClick={() => handleStepChange(2)}
                      disabled={submitting}
                      className="w-full sm:w-auto"
                    >
                      {tx('Fahrer ändern')}
                    </Button>
                    <Button
                      onClick={handleDispatch}
                      disabled={submitting}
                      className="w-full sm:w-auto flex-1"
                    >
                      {submitting
                        ? tx('Wird dispatcht …')
                        : tx('Jetzt dispatchen')}
                    </Button>
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">
                {tx('Bitte wähle zuerst eine Bestellung und einen Fahrer.')}
              </p>
              <Button variant="outline" onClick={() => handleStepChange(1)}>
                {tx('Neu starten')}
              </Button>
            </div>
          )}
        </div>
      )}
    </IntentWizardShell>
  );
}
