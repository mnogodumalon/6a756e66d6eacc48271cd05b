/**
 * Bestellung zuweisen — 3-Schritt-Wizard.
 * Steps: 1) Bestellung wählen (Status neu/in_bearbeitung/bereit_zur_lieferung) →
 *        2) Fahrer wählen (Status verfuegbar) →
 *        3) Zuweisung bestätigen & speichern.
 * Reads: bestellverwaltung, fahrerverwaltung.
 * Writes: bestellverwaltung (updateBestellverwaltungEntry — fahrer + order_status),
 *         fahrerverwaltung (updateFahrerverwaltungEntry — driver_status).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { tx } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Fahrerverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { Button } from '@/components/ui/button';
import { IconCheck, IconPackage, IconUser, IconTruck, IconMapPin, IconPhone } from '@tabler/icons-react';

const OPEN_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung']);

export default function BestellungZuweisenPage() {
  const { bestellverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedBestellung, setSelectedBestellung] = useState<EnrichedBestellverwaltung | null>(null);
  const [selectedFahrer, setSelectedFahrer] = useState<Fahrerverwaltung | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const offeneBestellungen = bestellverwaltung.filter(
    (b) => b.fields.order_status && OPEN_STATUSES.has(b.fields.order_status.key)
  ) as EnrichedBestellverwaltung[];

  const verfuegbareFahrer = fahrerverwaltung.filter(
    (f) => f.fields.driver_status?.key === 'verfuegbar'
  );

  const handleBestellungSelect = (id: string) => {
    const b = offeneBestellungen.find((b) => b.record_id === id) ?? null;
    setSelectedBestellung(b);
    setStep(2);
  };

  const handleFahrerSelect = (id: string) => {
    const f = verfuegbareFahrer.find((f) => f.record_id === id) ?? null;
    setSelectedFahrer(f);
    setStep(3);
  };

  const handleConfirm = async () => {
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
      setSubmitError(tx('Zuweisung fehlgeschlagen. Bitte erneut versuchen.'));
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

  if (success) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 px-4">
        <div className="rounded-full bg-primary/10 p-6">
          <IconCheck size={48} className="text-primary" stroke={1.5} />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-bold">{tx('Zuweisung erfolgreich')}</h2>
          <p className="text-muted-foreground">
            {tx('Fahrer')} <span className="font-medium">{selectedFahrer?.fields.driver_first_name} {selectedFahrer?.fields.driver_last_name}</span>{' '}
            {tx('wurde der Bestellung zugewiesen und ist nun im Einsatz.')}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
          <Button className="flex-1" onClick={handleReset}>
            {tx('Neue Zuweisung')}
          </Button>
          <Button variant="outline" className="flex-1" asChild>
            <a href="#/">{tx('Zurück zum Dashboard')}</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <IntentWizardShell
      title={tx('Bestellung zuweisen')}
      subtitle={tx('Offene Bestellung einem verfügbaren Fahrer zuweisen')}
      steps={[
        { label: tx('Bestellung') },
        { label: tx('Fahrer') },
        { label: tx('Bestätigen') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Schritt 1: Bestellung wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={offeneBestellungen.map((b) => ({
            id: b.record_id,
            title: b.fields.ordered_items ?? tx('Bestellung ohne Artikel'),
            subtitle: [
              b.fields.delivery_city,
              b.fields.order_date ? b.fields.order_date.slice(0, 10) : null,
            ]
              .filter(Boolean)
              .join(' · '),
            status: b.fields.order_status
              ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
              : undefined,
            stats: [
              {
                label: tx('Betrag'),
                value:
                  b.fields.total_amount != null
                    ? `${b.fields.total_amount.toFixed(2)} €`
                    : '—',
              },
              {
                label: tx('Stadt'),
                value: b.fields.delivery_city ?? '—',
              },
            ],
            icon: <IconPackage size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleBestellungSelect}
          searchPlaceholder={tx('Bestellung suchen …')}
          emptyText={tx('Keine offenen Bestellungen gefunden')}
          emptyIcon={<IconPackage size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* Schritt 2: Fahrer wählen */}
      {step === 2 && (
        selectedBestellung ? (
          <div className="space-y-4">
            <div className="rounded-2xl border bg-card p-4 flex items-start gap-3">
              <IconPackage size={20} className="text-primary mt-0.5" stroke={1.5} />
              <div className="min-w-0">
                <p className="font-medium truncate">{selectedBestellung.fields.ordered_items ?? tx('Bestellung')}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedBestellung.fields.delivery_city}
                  {selectedBestellung.fields.total_amount != null && ` · ${selectedBestellung.fields.total_amount.toFixed(2)} €`}
                </p>
              </div>
              {selectedBestellung.fields.order_status && (
                <StatusBadge
                  statusKey={selectedBestellung.fields.order_status.key}
                  label={selectedBestellung.fields.order_status.label}
                  className="ml-auto shrink-0"
                />
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {tx('Verfügbare Fahrer')}: <span className="font-medium text-foreground">{verfuegbareFahrer.length}</span>
            </p>

            <EntitySelectStep
              items={verfuegbareFahrer.map((f) => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || tx('Fahrer'),
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone,
                ].filter(Boolean).join(' · '),
                stats: [
                  {
                    label: tx('Telefon'),
                    value: f.fields.driver_phone ?? '—',
                  },
                  {
                    label: tx('Fahrzeug'),
                    value: f.fields.vehicle_type?.label ?? '—',
                  },
                ],
                icon: <IconUser size={20} className="text-primary" stroke={1.5} />,
              }))}
              onSelect={handleFahrerSelect}
              searchPlaceholder={tx('Fahrer suchen …')}
              emptyText={tx('Keine verfügbaren Fahrer gefunden')}
              emptyIcon={<IconUser size={32} className="text-muted-foreground" stroke={1.5} />}
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Schritt 3: Bestätigen */}
      {step === 3 && (
        selectedBestellung && selectedFahrer ? (
          <div className="space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Bestellungs-Karte */}
              <div className="rounded-2xl border bg-card p-5 space-y-3 overflow-hidden">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <IconPackage size={16} stroke={1.5} />
                  {tx('Bestellung')}
                </div>
                <p className="font-medium text-base line-clamp-2">{selectedBestellung.fields.ordered_items ?? '—'}</p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconMapPin size={14} stroke={1.5} />
                  <span className="truncate">{selectedBestellung.fields.delivery_city ?? '—'}</span>
                </div>
                {selectedBestellung.fields.total_amount != null && (
                  <p className="text-lg font-bold">{selectedBestellung.fields.total_amount.toFixed(2)} €</p>
                )}
                {selectedBestellung.fields.order_status && (
                  <StatusBadge
                    statusKey={selectedBestellung.fields.order_status.key}
                    label={selectedBestellung.fields.order_status.label}
                  />
                )}
              </div>

              {/* Fahrer-Karte */}
              <div className="rounded-2xl border bg-card p-5 space-y-3 overflow-hidden">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  <IconUser size={16} stroke={1.5} />
                  {tx('Fahrer')}
                </div>
                <p className="font-medium text-base">
                  {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name]
                    .filter(Boolean)
                    .join(' ') || '—'}
                </p>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <IconTruck size={14} stroke={1.5} />
                  <span className="truncate">{selectedFahrer.fields.vehicle_type?.label ?? '—'}</span>
                </div>
                {selectedFahrer.fields.driver_phone && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <IconPhone size={14} stroke={1.5} />
                    <span>{selectedFahrer.fields.driver_phone}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-secondary/30 p-4">
              <p className="text-sm text-muted-foreground">
                {tx('Nach der Bestätigung wird der Status der Bestellung auf')} <span className="font-medium text-foreground">{tx('Unterwegs')}</span> {tx('gesetzt und der Fahrer als')} <span className="font-medium text-foreground">{tx('Im Einsatz')}</span> {tx('markiert.')}
              </p>
            </div>

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                className="flex-1"
                onClick={handleConfirm}
                disabled={submitting}
              >
                {submitting ? tx('Wird gespeichert …') : tx('Zuweisung bestätigen')}
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setStep(2)}
                disabled={submitting}
              >
                {tx('Fahrer ändern')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
