/**
 * Lieferung abschließen — 3-Schritt-Wizard.
 * Steps: 1) Bestellungen auswählen (status 'unterwegs', Mehrfachauswahl) →
 *         2) Prüfen & bestätigen (SummaryStep) →
 *         3) Erfolgreich abgeschlossen (SuccessStep).
 * Reads: bestellverwaltung, fahrerverwaltung, kundenverwaltung.
 * Writes: bestellverwaltung (updateBestellverwaltungEntry → order_status: 'geliefert'),
 *         fahrerverwaltung (updateFahrerverwaltungEntry → driver_status: 'verfuegbar').
 * Composes: IntentWizardShell, SummaryStep, SuccessStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useIntentSubmit } from '@/hooks/useIntentSubmit';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { IconTruck, IconCheck, IconX } from '@tabler/icons-react';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';
import { undoToast } from '@/lib/polish';

const DRAFT_KEY = 'intent:lieferung-abschliessen';

const STEPS = [
  { label: 'Lieferungen' },
  { label: 'Prüfen' },
  { label: 'Fertig' },
];

interface WizardState {
  selectedIds: string[];
}

export default function LieferungAbschliessenPage() {
  const { bestellverwaltung, fahrerverwaltung, kundenverwaltung, loading, error, fetchAll, fahrerverwaltungMap, kundenverwaltungMap } = useDashboardData();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>({ selectedIds: [] });
  const [search, setSearch] = useState('');

  const { submit, submitting, error: submitError, done, result, reset } = useIntentSubmit(async () => {
    const selected = unterwegsBestellungen.filter(b => state.selectedIds.includes(b.record_id));
    let updatedCount = 0;
    let fahrerCount = 0;

    for (const bestellung of selected) {
      await LivingAppsService.updateBestellverwaltungEntry(bestellung.record_id, {
        order_status: 'geliefert',
      });
      updatedCount++;

      const fahrerId = extractRecordId(bestellung.fields.fahrer ?? null);
      if (fahrerId) {
        await LivingAppsService.updateFahrerverwaltungEntry(fahrerId, {
          driver_status: 'verfuegbar',
        });
        fahrerCount++;
      }
    }

    await fetchAll();
    return { updatedCount, fahrerCount, bestellungen: selected };
  }, { draftKey: DRAFT_KEY });

  // Enrich bestellverwaltung with fahrer and kunde names
  const enriched = useMemo<EnrichedBestellverwaltung[]>(() => {
    return bestellverwaltung.map(b => {
      const fahrerId = extractRecordId(b.fields.fahrer ?? null);
      const kundeId = extractRecordId(b.fields.kunde ?? null);
      const fahrer = fahrerId ? fahrerverwaltungMap.get(fahrerId) : undefined;
      const kunde = kundeId ? kundenverwaltungMap.get(kundeId) : undefined;
      const fahrerName = fahrer
        ? `${fahrer.fields.driver_first_name ?? ''} ${fahrer.fields.driver_last_name ?? ''}`.trim() || '—'
        : '—';
      const kundeName = kunde
        ? `${kunde.fields.first_name ?? ''} ${kunde.fields.last_name ?? ''}`.trim() || '—'
        : '—';
      return { ...b, fahrerName, kundeName };
    });
  }, [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap]);

  const unterwegsBestellungen = useMemo(
    () => enriched.filter(b => lookupKey(b.fields.order_status) === 'unterwegs'),
    [enriched],
  );

  const filteredBestellungen = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return unterwegsBestellungen;
    return unterwegsBestellungen.filter(b =>
      (b.kundeName.toLowerCase().includes(q)) ||
      (b.fahrerName.toLowerCase().includes(q)) ||
      (b.fields.ordered_items ?? '').toLowerCase().includes(q),
    );
  }, [unterwegsBestellungen, search]);

  const selectedBestellungen = useMemo(
    () => unterwegsBestellungen.filter(b => state.selectedIds.includes(b.record_id)),
    [unterwegsBestellungen, state.selectedIds],
  );

  function toggleSelect(id: string) {
    const isSelected = state.selectedIds.includes(id);
    if (isSelected) {
      const removed = unterwegsBestellungen.find(b => b.record_id === id);
      setState(s => ({ ...s, selectedIds: s.selectedIds.filter(x => x !== id) }));
      if (removed) {
        undoToast(
          `Bestellung von ${removed.kundeName} entfernt`,
          () => setState(s => ({ ...s, selectedIds: [...s.selectedIds, id] })),
        );
      }
    } else {
      setState(s => ({ ...s, selectedIds: [...s.selectedIds, id] }));
    }
  }

  function resetWizard() {
    reset();
    setState({ selectedIds: [] });
    setSearch('');
    setStep(1);
  }

  const answers =
    step > 1 && state.selectedIds.length > 0
      ? [{ label: 'Ausgewählt', value: `${state.selectedIds.length} Lieferung${state.selectedIds.length !== 1 ? 'en' : ''}` }]
      : undefined;

  return (
    <IntentWizardShell
      title="Lieferung abschließen"
      subtitle="Zugestellte Lieferungen bestätigen und Fahrer freigeben"
      steps={STEPS}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
      intro={{
        description: 'Markiere alle zugestellten Lieferungen als abgeschlossen. Die zugeordneten Fahrer werden dabei automatisch wieder auf „Verfügbar" gesetzt.',
        requirements: ['Laufende Lieferungen (Status „Unterwegs")'],
        startLabel: 'Lieferungen auswählen',
      }}
      answers={answers}
      draftKey={DRAFT_KEY}
      draft={state}
      onDraftRestore={(d) => setState(d as WizardState)}
    >
      {/* Step 1: Bestellungen auswählen */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="rounded-[27px] bg-card shadow-lg p-6 sm:p-8 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-semibold">Lieferungen auswählen</h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  {unterwegsBestellungen.length} aktive Lieferung{unterwegsBestellungen.length !== 1 ? 'en' : ''} unterwegs
                </p>
              </div>
              {state.selectedIds.length > 0 && (
                <span className="text-sm font-medium text-primary bg-primary/10 rounded-full px-3 py-1">
                  {state.selectedIds.length} ausgewählt
                </span>
              )}
            </div>

            {unterwegsBestellungen.length === 0 ? (
              <div className="text-center py-10 space-y-2">
                <IconTruck size={40} className="mx-auto text-muted-foreground opacity-40" stroke={1.5} />
                <p className="text-muted-foreground font-medium">Keine aktiven Lieferungen</p>
                <p className="text-sm text-muted-foreground">Aktuell sind keine Bestellungen mit Status „Unterwegs".</p>
                <Button variant="outline" className="mt-4" onClick={() => { window.location.href = '#/'; }}>
                  Zum Dashboard
                </Button>
              </div>
            ) : (
              <>
                <Input
                  placeholder="Nach Kunde, Fahrer oder Artikel suchen …"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full"
                />

                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {filteredBestellungen.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">Keine Treffer für „{search}"</p>
                  ) : (
                    filteredBestellungen.map(b => {
                      const isSelected = state.selectedIds.includes(b.record_id);
                      return (
                        <button
                          key={b.record_id}
                          type="button"
                          onClick={() => toggleSelect(b.record_id)}
                          className={`w-full text-left rounded-2xl border p-4 transition-colors ${
                            isSelected
                              ? 'border-primary bg-primary/5'
                              : 'border-border bg-card hover:border-primary/40'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3 min-w-0">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className={`mt-0.5 shrink-0 rounded-full w-5 h-5 border-2 flex items-center justify-center transition-colors ${
                                isSelected ? 'border-primary bg-primary' : 'border-muted-foreground'
                              }`}>
                                {isSelected && <IconCheck size={12} className="text-primary-foreground" stroke={3} />}
                              </div>
                              <div className="min-w-0">
                                <p className="font-medium truncate">{b.kundeName}</p>
                                <p className="text-sm text-muted-foreground truncate">
                                  Fahrer: {b.fahrerName}
                                </p>
                                {b.fields.ordered_items && (
                                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                                    {b.fields.ordered_items}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="shrink-0 text-right space-y-1">
                              <StatusBadge
                                statusKey={lookupKey(b.fields.order_status)}
                                label={b.fields.order_status?.label}
                              />
                              <p className="text-sm font-medium">{formatCurrency(b.fields.total_amount)}</p>
                              <p className="text-xs text-muted-foreground">{formatDate(b.fields.order_date)}</p>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>

                <div className="flex flex-col sm:flex-row gap-3 pt-2">
                  {state.selectedIds.length < unterwegsBestellungen.length && (
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setState(s => ({ ...s, selectedIds: unterwegsBestellungen.map(b => b.record_id) }))}
                    >
                      Alle auswählen ({unterwegsBestellungen.length})
                    </Button>
                  )}
                  {state.selectedIds.length > 0 && (
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setState(s => ({ ...s, selectedIds: [] }))}
                    >
                      <IconX size={16} className="mr-1" />
                      Auswahl aufheben
                    </Button>
                  )}
                  <Button
                    className="flex-1 h-12 text-base"
                    disabled={state.selectedIds.length === 0}
                    onClick={() => setStep(2)}
                  >
                    Weiter zu Schritt 2 ({state.selectedIds.length} ausgewählt)
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Step 2: SummaryStep */}
      {step === 2 && !done && (
        <div className="space-y-4">
          {state.selectedIds.length === 0 ? (
            <div className="rounded-[27px] bg-card shadow-lg p-6 text-center space-y-3">
              <p className="text-muted-foreground">Keine Lieferungen ausgewählt.</p>
              <Button onClick={() => setStep(1)}>Zurück zu Schritt 1</Button>
            </div>
          ) : (
            <>
              <div className="rounded-[27px] bg-card shadow-lg p-6 space-y-3">
                <h3 className="font-semibold text-base">Ausgewählte Lieferungen</h3>
                <div className="space-y-2">
                  {selectedBestellungen.map(b => (
                    <div key={b.record_id} className="flex items-center justify-between gap-3 rounded-xl border border-border p-3 min-w-0">
                      <div className="min-w-0">
                        <p className="font-medium truncate">{b.kundeName}</p>
                        <p className="text-xs text-muted-foreground truncate">Fahrer: {b.fahrerName}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium">{formatCurrency(b.fields.total_amount)}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(b.fields.order_date)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <SummaryStep
                items={[
                  {
                    label: 'Lieferungen',
                    value: `${state.selectedIds.length} Bestellung${state.selectedIds.length !== 1 ? 'en' : ''} als „Geliefert" markieren`,
                    step: 1,
                  },
                  {
                    label: 'Fahrer-Status',
                    value: `${selectedBestellungen.filter(b => extractRecordId(b.fields.fahrer ?? null)).length} Fahrer werden auf „Verfügbar" zurückgesetzt`,
                  },
                  {
                    label: 'Gesamtwert',
                    value: formatCurrency(selectedBestellungen.reduce((sum, b) => sum + (b.fields.total_amount ?? 0), 0)),
                  },
                ]}
                onEdit={setStep}
                whatHappensNext="Alle ausgewählten Bestellungen werden als geliefert markiert und die zugeordneten Fahrer wieder als verfügbar eingetragen."
                confirmLabel={`${state.selectedIds.length} Lieferung${state.selectedIds.length !== 1 ? 'en' : ''} abschließen`}
                onConfirm={async () => {
                  if (await submit()) setStep(3);
                }}
                submitting={submitting}
                missing={[]}
                error={submitError}
              />
            </>
          )}
        </div>
      )}

      {/* Step 3: SuccessStep */}
      {step === 3 && done && result && (
        <SuccessStep
          title={`${result.updatedCount} Lieferung${result.updatedCount !== 1 ? 'en' : ''} abgeschlossen`}
          details={[
            `${result.updatedCount} Bestellung${result.updatedCount !== 1 ? 'en' : ''} auf „Geliefert" gesetzt`,
            result.fahrerCount > 0
              ? `${result.fahrerCount} Fahrer wieder auf „Verfügbar" gesetzt`
              : 'Keine Fahrerstatus-Updates (kein Fahrer zugeordnet)',
            `Gesamtwert: ${formatCurrency(result.bestellungen.reduce((s: number, b: EnrichedBestellverwaltung) => s + (b.fields.total_amount ?? 0), 0))}`,
          ]}
          actions={[
            {
              label: 'Weitere abschließen',
              onClick: unterwegsBestellungen.length > 0 ? resetWizard : undefined,
              href: unterwegsBestellungen.length === 0 ? '#/' : undefined,
              icon: <IconTruck size={18} className="mr-1" stroke={1.5} />,
            },
            { label: 'Zurück zum Dashboard', href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
