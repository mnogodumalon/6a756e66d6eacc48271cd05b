/**
 * Lieferung abwickeln — 3-Schritt-Wizard.
 * Steps: 1) Bestellung wählen (nur bereit_zur_lieferung) →
 *        2) Fahrer zuweisen (nur verfuegbar) →
 *        3) Lieferung bestätigen & Auftrag abschließen.
 * Reads: bestellverwaltung, fahrerverwaltung, kundenverwaltung.
 * Writes: updateBestellverwaltungEntry (order_status, fahrer),
 *         updateFahrerverwaltungEntry (driver_status).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { APP_IDS } from '@/types/app';
import type { Bestellverwaltung, Fahrerverwaltung } from '@/types/app';
import { formatCurrency } from '@/lib/formatters';
import { tx } from '@/i18n';
import { Button } from '@/components/ui/button';
import { IconTruckDelivery, IconUser, IconMapPin, IconCheck, IconPackage, IconBike } from '@tabler/icons-react';

export default function LieferungAbwickelnPage() {
  const { bestellverwaltung, fahrerverwaltung, kundenverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedBestellung, setSelectedBestellung] = useState<Bestellverwaltung | null>(null);
  const [selectedFahrer, setSelectedFahrer] = useState<Fahrerverwaltung | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Step 1: only bereit_zur_lieferung orders
  const lieferbereiteBestellungen = bestellverwaltung.filter(
    b => b.fields.order_status?.key === 'bereit_zur_lieferung'
  );

  // Step 2: only verfuegbar drivers
  const verfuegbareFahrer = fahrerverwaltung.filter(
    f => f.fields.driver_status?.key === 'verfuegbar'
  );

  // Resolve customer name for a Bestellung
  function resolveKundeName(bestellung: Bestellverwaltung): string {
    if (!bestellung.fields.kunde) return '—';
    const kundeId = extractRecordId(bestellung.fields.kunde);
    if (!kundeId) return '—';
    const kunde = kundenverwaltung.find(k => k.record_id === kundeId);
    if (!kunde) return '—';
    return [kunde.fields.first_name, kunde.fields.last_name].filter(Boolean).join(' ') || '—';
  }

  const handleSelectBestellung = (id: string) => {
    const b = bestellverwaltung.find(x => x.record_id === id) ?? null;
    setSelectedBestellung(b);
    setSelectedFahrer(null);
    setSaveError(null);
    setStep(2);
  };

  const handleSelectFahrer = async (id: string) => {
    const f = fahrerverwaltung.find(x => x.record_id === id) ?? null;
    setSelectedFahrer(f);
    setSaveError(null);

    if (!selectedBestellung) return;
    setSaving(true);
    try {
      // Assign driver to order and set order to unterwegs
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellung.record_id, {
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, id),
        order_status: 'unterwegs',
      });
      // Mark driver as im_einsatz
      await LivingAppsService.updateFahrerverwaltungEntry(id, {
        driver_status: 'im_einsatz',
      });
      await fetchAll();
      setStep(3);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : tx('Fehler beim Zuweisen des Fahrers'));
    } finally {
      setSaving(false);
    }
  };

  const handleLieferungBestaetigen = async () => {
    if (!selectedBestellung || !selectedFahrer) return;
    setSaving(true);
    setSaveError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellung.record_id, {
        order_status: 'geliefert',
      });
      await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrer.record_id, {
        driver_status: 'verfuegbar',
      });
      await fetchAll();
      setDone(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : tx('Fehler beim Bestätigen der Lieferung'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedBestellung(null);
    setSelectedFahrer(null);
    setSaveError(null);
    setDone(false);
    setStep(1);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-6 p-6">
        <div className="rounded-full bg-primary/10 p-6">
          <IconCheck size={48} className="text-primary" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">{tx('Lieferung erfolgreich abgeschlossen!')}</h2>
          <p className="text-muted-foreground">
            {tx('Die Bestellung wurde als geliefert markiert und der Fahrer ist wieder verfügbar.')}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleReset} variant="outline">
            {tx('Neue Lieferung abwickeln')}
          </Button>
          <a href="#/">
            <Button>{tx('Zurück zum Dashboard')}</Button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <IntentWizardShell
      title={tx('Lieferung abwickeln')}
      subtitle={tx('Bestellung zuweisen, Fahrer einteilen, Lieferung bestätigen')}
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
      {/* Step 1: Bestellung wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={lieferbereiteBestellungen.map(b => ({
            id: b.record_id,
            title: b.fields.ordered_items
              ? (b.fields.ordered_items.length > 60
                ? b.fields.ordered_items.slice(0, 60) + '…'
                : b.fields.ordered_items)
              : tx('Bestellung'),
            subtitle: [
              b.fields.delivery_city,
              resolveKundeName(b),
              b.fields.total_amount != null ? formatCurrency(b.fields.total_amount) : null,
            ].filter(Boolean).join(' · '),
            status: b.fields.order_status
              ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
              : undefined,
            icon: <IconPackage size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectBestellung}
          searchPlaceholder={tx('Bestellung suchen …')}
          emptyText={tx('Keine Bestellungen bereit zur Lieferung')}
          emptyIcon={<IconPackage size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Fahrer zuweisen */}
      {step === 2 && (
        selectedBestellung ? (
          <div className="space-y-4">
            {/* Selected order summary */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2">
              <div className="flex items-start gap-3">
                <IconPackage size={20} className="text-primary mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">
                    {selectedBestellung.fields.ordered_items
                      ? (selectedBestellung.fields.ordered_items.length > 80
                        ? selectedBestellung.fields.ordered_items.slice(0, 80) + '…'
                        : selectedBestellung.fields.ordered_items)
                      : tx('Bestellung')}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-sm text-muted-foreground">
                    {selectedBestellung.fields.delivery_city && (
                      <span className="flex items-center gap-1">
                        <IconMapPin size={14} />
                        {selectedBestellung.fields.delivery_city}
                      </span>
                    )}
                    {selectedBestellung.fields.total_amount != null && (
                      <span>{formatCurrency(selectedBestellung.fields.total_amount)}</span>
                    )}
                    <span>{resolveKundeName(selectedBestellung)}</span>
                  </div>
                </div>
                {selectedBestellung.fields.order_status && (
                  <StatusBadge
                    statusKey={selectedBestellung.fields.order_status.key}
                    label={selectedBestellung.fields.order_status.label}
                  />
                )}
              </div>
            </div>

            {saveError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {saveError}
              </div>
            )}

            <EntitySelectStep
              items={verfuegbareFahrer.map(f => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || tx('Fahrer'),
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone,
                  f.fields.driver_phone,
                ].filter(Boolean).join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconBike size={20} className="text-primary" />,
              }))}
              onSelect={saving ? () => {} : handleSelectFahrer}
              searchPlaceholder={tx('Fahrer suchen …')}
              emptyText={tx('Kein Fahrer verfügbar')}
              emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
            />

            {saving && (
              <p className="text-sm text-muted-foreground text-center">{tx('Fahrer wird zugewiesen …')}</p>
            )}
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht eine Bestellung aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 3: Lieferung bestätigen */}
      {step === 3 && (
        selectedBestellung && selectedFahrer ? (
          <div className="space-y-6">
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-5 py-4 border-b bg-secondary/30">
                <h3 className="font-semibold text-base">{tx('Zusammenfassung')}</h3>
              </div>
              <div className="p-5 space-y-4">
                {/* Order details */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{tx('Bestellung')}</p>
                  <div className="flex items-start gap-3">
                    <IconPackage size={18} className="text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium">
                        {selectedBestellung.fields.ordered_items
                          ? (selectedBestellung.fields.ordered_items.length > 100
                            ? selectedBestellung.fields.ordered_items.slice(0, 100) + '…'
                            : selectedBestellung.fields.ordered_items)
                          : tx('Bestellung')}
                      </p>
                      <p className="text-sm text-muted-foreground">{resolveKundeName(selectedBestellung)}</p>
                      {selectedBestellung.fields.total_amount != null && (
                        <p className="text-sm font-semibold mt-1">{formatCurrency(selectedBestellung.fields.total_amount)}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t" />

                {/* Delivery address */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{tx('Lieferadresse')}</p>
                  <div className="flex items-start gap-3">
                    <IconMapPin size={18} className="text-primary mt-0.5 shrink-0" />
                    <div className="text-sm space-y-0.5">
                      {(selectedBestellung.fields.delivery_street || selectedBestellung.fields.delivery_house_number) && (
                        <p>{[selectedBestellung.fields.delivery_street, selectedBestellung.fields.delivery_house_number].filter(Boolean).join(' ')}</p>
                      )}
                      {(selectedBestellung.fields.delivery_postal_code || selectedBestellung.fields.delivery_city) && (
                        <p>{[selectedBestellung.fields.delivery_postal_code, selectedBestellung.fields.delivery_city].filter(Boolean).join(' ')}</p>
                      )}
                      {!selectedBestellung.fields.delivery_street && !selectedBestellung.fields.delivery_city && (
                        <p className="text-muted-foreground">{tx('Keine Adresse angegeben')}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="border-t" />

                {/* Assigned driver */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{tx('Zugewiesener Fahrer')}</p>
                  <div className="flex items-start gap-3">
                    <IconTruckDelivery size={18} className="text-primary mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium">
                        {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name].filter(Boolean).join(' ') || tx('Fahrer')}
                      </p>
                      <div className="text-sm text-muted-foreground space-y-0.5">
                        {selectedFahrer.fields.vehicle_type?.label && (
                          <p>{selectedFahrer.fields.vehicle_type.label}</p>
                        )}
                        {selectedFahrer.fields.delivery_zone && (
                          <p>{tx('Zone')}: {selectedFahrer.fields.delivery_zone}</p>
                        )}
                        {selectedFahrer.fields.driver_phone && (
                          <p>{selectedFahrer.fields.driver_phone}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {saveError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {saveError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                disabled={saving}
                className="w-full sm:w-auto"
              >
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleLieferungBestaetigen}
                disabled={saving}
                className="w-full sm:flex-1"
              >
                <IconCheck size={16} className="mr-2" />
                {saving ? tx('Wird gespeichert …') : tx('Geliefert')}
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
