/**
 * Fahrer disponieren — 3-Schritt-Wizard.
 * Steps: 1) Bestellung wählen (status bereit_zur_lieferung, kein Fahrer zugewiesen)
 *        → 2) Fahrer wählen (status verfuegbar)
 *        → 3) Zuweisung bestätigen & speichern.
 * Reads: bestellverwaltung, fahrerverwaltung, kundenverwaltung.
 * Writes: bestellverwaltung (updateBestellverwaltungEntry — fahrer, order_status → 'unterwegs'),
 *         fahrerverwaltung (updateFahrerverwaltungEntry — driver_status → 'im_einsatz').
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconTruck, IconUser, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { Bestellverwaltung, Fahrerverwaltung } from '@/types/app';
import { formatDate, formatDateTime, formatCurrency, lookupKey } from '@/lib/formatters';
import { tx } from '@/i18n';

export default function FahrerDisponierenPage() {
  const WIZARD_STEPS = [
  { label: tx('Bestellung') },
  { label: tx('Fahrer') },
  { label: tx('Bestätigen') },
];

  const [searchParams, setSearchParams] = useSearchParams();

  const initialStep = Math.min(
    Math.max(parseInt(searchParams.get('step') ?? '1', 10) || 1, 1),
    3
  );

  const [step, setStep] = useState(initialStep);
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(
    searchParams.get('bestellungId')
  );
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(
    searchParams.get('fahrerId')
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { bestellverwaltung, fahrerverwaltung, kundenverwaltungMap, loading, error, fetchAll } =
    useDashboardData();

  function handleStepChange(newStep: number) {
    setStep(newStep);
    const params: Record<string, string> = { step: String(newStep) };
    if (selectedBestellungId) params.bestellungId = selectedBestellungId;
    if (selectedFahrerId) params.fahrerId = selectedFahrerId;
    setSearchParams(params);
  }

  function handleSelectBestellung(id: string) {
    setSelectedBestellungId(id);
    const params: Record<string, string> = { step: '2', bestellungId: id };
    setSearchParams(params);
    setStep(2);
  }

  function handleSelectFahrer(id: string) {
    setSelectedFahrerId(id);
    const params: Record<string, string> = { step: '3' };
    if (selectedBestellungId) params.bestellungId = selectedBestellungId;
    params.fahrerId = id;
    setSearchParams(params);
    setStep(3);
  }

  async function handleConfirm() {
    if (!selectedBestellungId || !selectedFahrerId) return;
    setSaving(true);
    setSaveError(null);
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
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : tx('Fehler beim Speichern'));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setSelectedBestellungId(null);
    setSelectedFahrerId(null);
    setSaveError(null);
    setSuccess(false);
    setSearchParams({ step: '1' });
    setStep(1);
  }

  // Eligible orders: status == 'bereit_zur_lieferung' AND no fahrer assigned
  const eligibleBestellungen = bestellverwaltung.filter((b: Bestellverwaltung) => {
    const status = lookupKey(b.fields.order_status);
    const hasFahrer = !!b.fields.fahrer && extractRecordId(b.fields.fahrer) !== null;
    return status === 'bereit_zur_lieferung' && !hasFahrer;
  });

  // Eligible drivers: status == 'verfuegbar'
  const eligibleFahrer = fahrerverwaltung.filter((f: Fahrerverwaltung) => {
    const status = lookupKey(f.fields.driver_status);
    return status === 'verfuegbar';
  });

  const selectedBestellung = selectedBestellungId
    ? bestellverwaltung.find((b: Bestellverwaltung) => b.record_id === selectedBestellungId) ?? null
    : null;

  const selectedFahrer = selectedFahrerId
    ? fahrerverwaltung.find((f: Fahrerverwaltung) => f.record_id === selectedFahrerId) ?? null
    : null;

  function getKundeName(bestellung: Bestellverwaltung): string {
    const kundeId = extractRecordId(bestellung.fields.kunde);
    if (!kundeId) return '—';
    const kunde = kundenverwaltungMap.get(kundeId);
    if (!kunde) return '—';
    return [kunde.fields.first_name, kunde.fields.last_name].filter(Boolean).join(' ') || '—';
  }

  return (
    <IntentWizardShell
      title={tx('Fahrer disponieren')}
      subtitle={tx('Bestellung einem verfügbaren Fahrer zuweisen')}
      steps={WIZARD_STEPS}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Bestellung wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleBestellungen.map((b: Bestellverwaltung) => ({
            id: b.record_id,
            title: b.fields.ordered_items
              ? b.fields.ordered_items.length > 60
                ? b.fields.ordered_items.slice(0, 60) + '…'
                : b.fields.ordered_items
              : tx('Bestellung ohne Artikel'),
            subtitle: [
              b.fields.delivery_city,
              b.fields.desired_delivery_time
                ? formatDateTime(b.fields.desired_delivery_time)
                : b.fields.order_date
                ? formatDate(b.fields.order_date)
                : undefined,
              getKundeName(b),
            ]
              .filter(Boolean)
              .join(' · '),
            stats: [
              {
                label: tx('Betrag'),
                value: b.fields.total_amount != null ? formatCurrency(b.fields.total_amount) : '—',
              },
              {
                label: tx('Kunde'),
                value: getKundeName(b),
              },
            ],
            status: b.fields.order_status
              ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
              : undefined,
            icon: <IconTruck size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectBestellung}
          searchPlaceholder={tx('Bestellung suchen …')}
          emptyText={tx('Keine Bestellungen bereit zur Lieferung ohne Fahrer')}
          emptyIcon={<IconTruck size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Fahrer wählen */}
      {step === 2 && (
        selectedBestellungId ? (
          <div className="space-y-4">
            {/* Context: selected order */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-1">
              <p className="text-xs text-muted-foreground">{tx('Gewählte Bestellung')}</p>
              <p className="font-medium text-sm truncate">
                {selectedBestellung?.fields.ordered_items?.slice(0, 80) ?? tx('Bestellung')}
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                {selectedBestellung?.fields.delivery_city && (
                  <span className="text-xs text-muted-foreground">
                    {selectedBestellung.fields.delivery_city}
                  </span>
                )}
                {selectedBestellung?.fields.order_status && (
                  <StatusBadge
                    statusKey={selectedBestellung.fields.order_status.key}
                    label={selectedBestellung.fields.order_status.label}
                  />
                )}
              </div>
            </div>

            <EntitySelectStep
              items={eligibleFahrer.map((f: Fahrerverwaltung) => ({
                id: f.record_id,
                title:
                  [f.fields.driver_first_name, f.fields.driver_last_name]
                    .filter(Boolean)
                    .join(' ') || tx('Fahrer'),
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone,
                  f.fields.work_start && f.fields.work_end
                    ? `${f.fields.work_start} – ${f.fields.work_end}`
                    : undefined,
                ]
                  .filter(Boolean)
                  .join(' · '),
                stats: [
                  {
                    label: tx('Fahrzeug'),
                    value: f.fields.vehicle_type?.label ?? '—',
                  },
                  {
                    label: tx('Zone'),
                    value: f.fields.delivery_zone ?? '—',
                  },
                ],
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconUser size={20} className="text-primary" />,
              }))}
              onSelect={handleSelectFahrer}
              searchPlaceholder={tx('Fahrer suchen …')}
              emptyText={tx('Kein verfügbarer Fahrer gefunden')}
              emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
            />
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
        )
      )}

      {/* Step 3: Bestätigen */}
      {step === 3 && (
        selectedBestellungId && selectedFahrerId ? (
          success ? (
            <div className="flex flex-col items-center justify-center py-12 space-y-6">
              <div className="rounded-full bg-green-100 p-4">
                <IconCheck size={36} className="text-green-600" stroke={2} />
              </div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-semibold">{tx('Zuweisung erfolgreich')}</h2>
                <p className="text-sm text-muted-foreground">
                  {selectedFahrer
                    ? tx`${[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name].filter(Boolean).join(' ')} ist jetzt unterwegs`
                    : tx('Fahrer ist jetzt unterwegs')}
                </p>
                {selectedBestellung?.fields.order_date && (
                  <p className="text-xs text-muted-foreground">
                    {tx('Bestellung vom')} {formatDate(selectedBestellung.fields.order_date)}
                  </p>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                <Button className="flex-1" onClick={handleReset}>
                  {tx('Weitere Zuweisung')}
                </Button>
                <a href="#/" className="flex-1">
                  <Button variant="outline" className="w-full">
                    {tx('Zurück zum Dashboard')}
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold">{tx('Zuweisung bestätigen')}</h2>

              {/* Summary cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Bestellung card */}
                <div className="rounded-2xl border bg-card p-4 space-y-3 overflow-hidden">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <IconTruck size={16} stroke={2} />
                    <span>{tx('Bestellung')}</span>
                  </div>
                  {selectedBestellung ? (
                    <div className="space-y-1 min-w-0">
                      <p className="font-semibold text-sm line-clamp-2">
                        {selectedBestellung.fields.ordered_items ?? '—'}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {selectedBestellung.fields.delivery_city && (
                          <span>{selectedBestellung.fields.delivery_city}</span>
                        )}
                        {selectedBestellung.fields.desired_delivery_time && (
                          <span>
                            {tx('Lieferzeit:')} {formatDateTime(selectedBestellung.fields.desired_delivery_time)}
                          </span>
                        )}
                        {selectedBestellung.fields.total_amount != null && (
                          <span className="font-medium text-foreground">
                            {formatCurrency(selectedBestellung.fields.total_amount)}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {tx('Kunde:')} {getKundeName(selectedBestellung)}
                      </p>
                      {selectedBestellung.fields.order_status && (
                        <StatusBadge
                          statusKey={selectedBestellung.fields.order_status.key}
                          label={selectedBestellung.fields.order_status.label}
                        />
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{tx('Keine Bestellung gewählt')}</p>
                  )}
                </div>

                {/* Fahrer card */}
                <div className="rounded-2xl border bg-card p-4 space-y-3 overflow-hidden">
                  <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                    <IconUser size={16} stroke={2} />
                    <span>{tx('Fahrer')}</span>
                  </div>
                  {selectedFahrer ? (
                    <div className="space-y-1 min-w-0">
                      <p className="font-semibold text-sm">
                        {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name]
                          .filter(Boolean)
                          .join(' ') || '—'}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        {selectedFahrer.fields.vehicle_type && (
                          <span>{selectedFahrer.fields.vehicle_type.label}</span>
                        )}
                        {selectedFahrer.fields.delivery_zone && (
                          <span>{tx('Zone:')} {selectedFahrer.fields.delivery_zone}</span>
                        )}
                        {selectedFahrer.fields.work_start && selectedFahrer.fields.work_end && (
                          <span>
                            {selectedFahrer.fields.work_start} – {selectedFahrer.fields.work_end}
                          </span>
                        )}
                      </div>
                      {selectedFahrer.fields.driver_status && (
                        <StatusBadge
                          statusKey={selectedFahrer.fields.driver_status.key}
                          label={selectedFahrer.fields.driver_status.label}
                        />
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{tx('Kein Fahrer gewählt')}</p>
                  )}
                </div>
              </div>

              {/* What will happen */}
              <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2 text-sm">
                <p className="font-medium">{tx('Was passiert beim Bestätigen:')}</p>
                <ul className="space-y-1 text-muted-foreground">
                  <li>• {tx('Bestellstatus wird auf „Unterwegs" gesetzt')}</li>
                  <li>• {tx('Fahrerstatus wird auf „Im Einsatz" gesetzt')}</li>
                </ul>
              </div>

              {saveError && (
                <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 flex items-start gap-3">
                  <IconAlertCircle size={18} className="text-destructive mt-0.5 shrink-0" stroke={2} />
                  <p className="text-sm text-destructive">{saveError}</p>
                </div>
              )}

              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="outline"
                  onClick={() => handleStepChange(2)}
                  disabled={saving}
                  className="sm:w-auto"
                >
                  {tx('Zurück')}
                </Button>
                <Button
                  onClick={handleConfirm}
                  disabled={saving}
                  className="flex-1"
                >
                  {saving ? tx('Wird gespeichert …') : tx('Zuweisung bestätigen')}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht Bestellung und Fahrer aus den vorherigen Schritten.')}
            </p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
