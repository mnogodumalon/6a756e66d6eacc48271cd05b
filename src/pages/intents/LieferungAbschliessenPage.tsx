/**
 * Lieferung abschließen — 3-Schritt-Wizard.
 * Steps: 1) Offene Bestellung auswählen → 2) Fahrer zuweisen (optional) → 3) Status setzen & bestätigen.
 * Reads: bestellverwaltung, fahrerverwaltung, kundenverwaltung.
 * Writes: bestellverwaltung (updateBestellverwaltungEntry), fahrerverwaltung (updateFahrerverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Fahrerverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { formatDateTime, formatCurrency, lookupKey } from '@/lib/formatters';
import { tx } from '@/i18n';
import { Button } from '@/components/ui/button';
import {
  IconTruck,
  IconUser,
  IconCheck,
  IconAlertCircle,
  IconPackage,
  IconMapPin,
  IconCoin,
  IconClipboardList,
} from '@tabler/icons-react';

const ACTIVE_ORDER_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs']);

const FINAL_STATUS_OPTIONS = (LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? []).filter(
  o => o.key === 'geliefert' || o.key === 'storniert'
);

export default function LieferungAbschliessenPage() {
  const { bestellverwaltung, fahrerverwaltung, kundenverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<EnrichedBestellverwaltung | null>(null);
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [finalStatus, setFinalStatus] = useState<string>('geliefert');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Build a kundenverwaltung map for name resolution
  const kundenMap = new Map(kundenverwaltung.map(k => [k.record_id, k]));
  const fahrerMap = new Map(fahrerverwaltung.map(f => [f.record_id, f]));

  // Step 1: eligible orders — only active ones
  const eligibleOrders = bestellverwaltung.filter(b => {
    const key = lookupKey(b.fields.order_status);
    return key && ACTIVE_ORDER_STATUSES.has(key);
  });

  // Resolve customer name for an order
  function resolveKundeName(order: typeof bestellverwaltung[number]): string {
    const kundeUrl = order.fields.kunde;
    if (!kundeUrl) return '';
    const kundeId = extractRecordId(kundeUrl);
    if (!kundeId) return '';
    const kunde = kundenMap.get(kundeId);
    if (!kunde) return '';
    return [kunde.fields.first_name, kunde.fields.last_name].filter(Boolean).join(' ');
  }

  // Step 2: eligible drivers — verfuegbar OR already assigned to this order
  const currentFahrerId = selectedOrder
    ? extractRecordId(selectedOrder.fields.fahrer ?? '')
    : null;

  const eligibleDrivers: Fahrerverwaltung[] = fahrerverwaltung.filter(f => {
    const key = lookupKey(f.fields.driver_status);
    return key === 'verfuegbar' || f.record_id === currentFahrerId;
  });

  function handleSelectOrder(id: string) {
    const order = bestellverwaltung.find(b => b.record_id === id);
    if (!order) return;
    // Cast: EnrichedBestellverwaltung adds fahrerName/kundeName as derived fields
    const enriched = order as EnrichedBestellverwaltung;
    setSelectedOrder(enriched);
    // Pre-select existing driver if set
    if (currentFahrerId) {
      setSelectedFahrerId(currentFahrerId);
    } else {
      setSelectedFahrerId(null);
    }
    setStep(2);
  }

  function handleSelectDriver(id: string) {
    setSelectedFahrerId(id);
    setStep(3);
  }

  function handleSkipDriver() {
    setSelectedFahrerId(null);
    setStep(3);
  }

  async function handleConfirm() {
    if (!selectedOrder) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedOrder.record_id, {
        order_status: finalStatus,
        fahrer: selectedFahrerId
          ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId)
          : undefined,
      });

      // Free the driver if delivery completed
      if (selectedFahrerId && finalStatus === 'geliefert') {
        await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrerId, {
          driver_status: 'verfuegbar',
        });
      }

      await fetchAll();
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tx('Fehler beim Abschließen der Lieferung'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelectedOrder(null);
    setSelectedFahrerId(null);
    setFinalStatus('geliefert');
    setSubmitError(null);
    setDone(false);
    setStep(1);
  }

  if (done) {
    const assignedDriver = selectedFahrerId ? fahrerMap.get(selectedFahrerId) : null;
    return (
      <div className="max-w-2xl mx-auto py-16 flex flex-col items-center gap-6 text-center">
        <div className="w-16 h-16 rounded-2xl bg-green-100 flex items-center justify-center">
          <IconCheck size={32} className="text-green-600" stroke={2} />
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold">{tx('Lieferung abgeschlossen')}</h2>
          <p className="text-muted-foreground text-sm">
            {finalStatus === 'geliefert'
              ? tx('Die Bestellung wurde erfolgreich als geliefert markiert.')
              : tx('Die Bestellung wurde storniert.')}
          </p>
          {assignedDriver && (
            <p className="text-sm text-muted-foreground">
              {tx('Fahrer')}: <span className="font-medium text-foreground">
                {[assignedDriver.fields.driver_first_name, assignedDriver.fields.driver_last_name].filter(Boolean).join(' ')}
              </span>
              {finalStatus === 'geliefert' && ` ${tx('ist nun wieder verfügbar.')}`}
            </p>
          )}
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
          <Button onClick={handleReset} className="flex-1">
            {tx('Weitere Lieferung abschließen')}
          </Button>
          <a href="#/" className="flex-1">
            <Button variant="outline" className="w-full">{tx('Zurück zum Dashboard')}</Button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <IntentWizardShell
      title={tx('Lieferung abschließen')}
      subtitle={tx('Offene Bestellung auswählen, Fahrer zuweisen und Status setzen')}
      steps={[
        { label: tx('Bestellung') },
        { label: tx('Fahrer') },
        { label: tx('Abschließen') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Bestellung auswählen */}
      {step === 1 && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {tx('Wähle eine offene Bestellung zum Abschließen aus.')}
          </p>
          <EntitySelectStep
            items={eligibleOrders.map(order => {
              const statusKey = lookupKey(order.fields.order_status);
              const statusLabel = order.fields.order_status?.label;
              const kundeName = resolveKundeName(order);
              const addressParts = [order.fields.delivery_city].filter(Boolean).join(', ');
              return {
                id: order.record_id,
                title: kundeName || tx('Unbekannter Kunde'),
                subtitle: [
                  order.fields.order_date ? formatDateTime(order.fields.order_date) : undefined,
                  addressParts || undefined,
                ].filter(Boolean).join(' · '),
                status: statusKey && statusLabel ? { key: statusKey, label: statusLabel } : undefined,
                stats: [
                  { label: tx('Betrag'), value: formatCurrency(order.fields.total_amount) },
                  ...(order.fields.ordered_items
                    ? [{ label: tx('Artikel'), value: order.fields.ordered_items.substring(0, 40) + (order.fields.ordered_items.length > 40 ? '…' : '') }]
                    : []),
                ],
                icon: <IconTruck size={20} className="text-primary" />,
              };
            })}
            onSelect={handleSelectOrder}
            searchPlaceholder={tx('Bestellung suchen…')}
            emptyText={tx('Keine offenen Bestellungen vorhanden')}
            emptyIcon={<IconPackage size={32} />}
          />
        </div>
      )}

      {/* Step 2: Fahrer zuweisen */}
      {step === 2 && (
        selectedOrder ? (
          <div className="space-y-4">
            {/* Context: selected order */}
            <div className="rounded-xl border bg-card p-4 flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <IconTruck size={20} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm truncate">
                  {resolveKundeName(selectedOrder) || tx('Unbekannter Kunde')}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {selectedOrder.fields.delivery_city || tx('Kein Lieferort')} · {formatCurrency(selectedOrder.fields.total_amount)}
                </p>
              </div>
              {selectedOrder.fields.order_status && (
                <StatusBadge
                  statusKey={lookupKey(selectedOrder.fields.order_status)}
                  label={selectedOrder.fields.order_status.label}
                />
              )}
            </div>

            <p className="text-sm text-muted-foreground">
              {tx('Wähle einen verfügbaren Fahrer oder überspringe diesen Schritt.')}
            </p>

            {currentFahrerId && (
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">
                {tx('Diese Bestellung hat bereits einen Fahrer. Du kannst den Fahrer wechseln oder beibehalten.')}
              </div>
            )}

            <EntitySelectStep
              items={eligibleDrivers.map(driver => {
                const statusKey = lookupKey(driver.fields.driver_status);
                const statusLabel = driver.fields.driver_status?.label;
                const isPreSelected = driver.record_id === currentFahrerId;
                return {
                  id: driver.record_id,
                  title: [driver.fields.driver_first_name, driver.fields.driver_last_name].filter(Boolean).join(' ') || tx('Fahrer'),
                  subtitle: [
                    driver.fields.vehicle_type?.label,
                    driver.fields.delivery_zone,
                    isPreSelected ? tx('(aktuell zugewiesen)') : undefined,
                  ].filter(Boolean).join(' · '),
                  status: statusKey && statusLabel ? { key: statusKey, label: statusLabel } : undefined,
                  icon: <IconUser size={20} className="text-primary" />,
                };
              })}
              onSelect={handleSelectDriver}
              searchPlaceholder={tx('Fahrer suchen…')}
              emptyText={tx('Keine verfügbaren Fahrer')}
              emptyIcon={<IconUser size={32} />}
            />

            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} className="flex-1">
                {tx('Zurück')}
              </Button>
              <Button variant="outline" onClick={handleSkipDriver} className="flex-1">
                {tx('Ohne Fahrer fortfahren')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt benötigt eine ausgewählte Bestellung aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 3: Abschließen */}
      {step === 3 && (
        selectedOrder ? (
          <div className="space-y-5">
            {/* Order summary */}
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="px-4 py-3 border-b bg-secondary/50">
                <h3 className="text-sm font-semibold">{tx('Bestellübersicht')}</h3>
              </div>
              <div className="p-4 space-y-3">
                {resolveKundeName(selectedOrder) && (
                  <div className="flex items-start gap-3">
                    <IconUser size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tx('Kunde')}</p>
                      <p className="text-sm font-medium">{resolveKundeName(selectedOrder)}</p>
                    </div>
                  </div>
                )}

                {selectedOrder.fields.ordered_items && (
                  <div className="flex items-start gap-3">
                    <IconClipboardList size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tx('Bestellte Artikel')}</p>
                      <p className="text-sm whitespace-pre-line line-clamp-3">{selectedOrder.fields.ordered_items}</p>
                    </div>
                  </div>
                )}

                {selectedOrder.fields.total_amount != null && (
                  <div className="flex items-start gap-3">
                    <IconCoin size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tx('Gesamtbetrag')}</p>
                      <p className="text-sm font-semibold">{formatCurrency(selectedOrder.fields.total_amount)}</p>
                    </div>
                  </div>
                )}

                {(selectedOrder.fields.delivery_street || selectedOrder.fields.delivery_city) && (
                  <div className="flex items-start gap-3">
                    <IconMapPin size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tx('Lieferadresse')}</p>
                      <p className="text-sm">
                        {[
                          selectedOrder.fields.delivery_street,
                          selectedOrder.fields.delivery_house_number,
                        ].filter(Boolean).join(' ')}
                        {(selectedOrder.fields.delivery_postal_code || selectedOrder.fields.delivery_city) && (
                          <span className="block">
                            {[selectedOrder.fields.delivery_postal_code, selectedOrder.fields.delivery_city].filter(Boolean).join(' ')}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                )}

                {/* Assigned driver */}
                {selectedFahrerId && (() => {
                  const driver = fahrerMap.get(selectedFahrerId);
                  return driver ? (
                    <div className="flex items-start gap-3">
                      <IconUser size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{tx('Fahrer')}</p>
                        <p className="text-sm font-medium">
                          {[driver.fields.driver_first_name, driver.fields.driver_last_name].filter(Boolean).join(' ')}
                          {driver.fields.vehicle_type?.label && (
                            <span className="text-muted-foreground font-normal"> · {driver.fields.vehicle_type.label}</span>
                          )}
                        </p>
                      </div>
                    </div>
                  ) : null;
                })()}
              </div>
            </div>

            {/* Final status selector */}
            <div className="space-y-2">
              <p className="text-sm font-medium">{tx('Abschlussstatus')}</p>
              <div className="grid grid-cols-2 gap-3">
                {FINAL_STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.key}
                    onClick={() => setFinalStatus(opt.key)}
                    className={`p-4 rounded-xl border text-sm font-medium transition-colors text-left ${
                      finalStatus === opt.key
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border bg-card hover:border-primary/40 hover:bg-accent'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {opt.key === 'geliefert' ? (
                        <IconCheck size={16} stroke={2} />
                      ) : (
                        <IconAlertCircle size={16} stroke={2} />
                      )}
                      {opt.label}
                    </div>
                    <p className="text-xs font-normal text-muted-foreground mt-1">
                      {opt.key === 'geliefert'
                        ? tx('Bestellung wurde erfolgreich zugestellt')
                        : tx('Bestellung wird abgebrochen')}
                    </p>
                  </button>
                ))}
              </div>
            </div>

            {submitError && (
              <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <IconAlertCircle size={16} className="shrink-0" />
                {submitError}
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting} className="flex-1">
                {tx('Zurück')}
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={submitting}
                className={`flex-1 ${finalStatus === 'storniert' ? 'bg-destructive hover:bg-destructive/90' : ''}`}
              >
                {submitting
                  ? tx('Wird gespeichert…')
                  : finalStatus === 'geliefert'
                  ? tx('Als geliefert abschließen')
                  : tx('Bestellung stornieren')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt benötigt eine ausgewählte Bestellung aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
