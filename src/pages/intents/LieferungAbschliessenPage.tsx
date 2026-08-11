/**
 * Lieferung abschließen — 3-Schritt-Wizard.
 * Steps: 1) Aktive Bestellung auswählen → 2) Zahlungsmethode & Lieferhinweise bestätigen → 3) Status auf "geliefert" setzen & Erfolgsmeldung.
 * Reads: bestellverwaltung, kundenverwaltung (via enrichment). Writes: bestellverwaltung (updateBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 * Deep-link: ?bestellungId=xxx skips step 1 if a valid eligible order is found.
 */
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService } from '@/services/livingAppsService';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import { LOOKUP_OPTIONS } from '@/types/app';
import { formatDateTime, formatCurrency, lookupKey } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { IconTruck, IconCircleCheck, IconPackage } from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Lieferung abschließen', /* i18n-exempt */
    subtitle: 'Bestellung als geliefert markieren', /* i18n-exempt */
    step1: 'Bestellung',
    step2: 'Bestätigen',
    step3: 'Abschluss',
    selectHeading: 'Aktive Bestellung auswählen',
    noEligible: 'Keine aktiven Bestellungen vorhanden.',
    confirmHeading: 'Lieferung bestätigen',
    paymentLabel: 'Zahlungsmethode',
    paymentPlaceholder: 'Zahlungsmethode wählen…',
    notesLabel: 'Lieferhinweise',
    notesPlaceholder: 'Optionale Hinweise zur Lieferung…',
    customerLabel: 'Kunde',
    itemsLabel: 'Bestellte Artikel',
    amountLabel: 'Gesamtbetrag',
    statusLabel: 'Aktueller Status',
    orderDateLabel: 'Bestelldatum',
    cityLabel: 'Lieferstadt',
    markDelivered: 'Als geliefert abschließen',
    submitting: 'Wird gespeichert…',
    successHeading: 'Lieferung erfolgreich abgeschlossen!',
    successDesc: 'Die Bestellung wurde als geliefert markiert.',
    newDelivery: 'Weitere Lieferung abschließen',
    backDashboard: 'Zurück zum Dashboard',
    back: 'Zurück',
    noSelection: 'Kein Auftrag ausgewählt. Bitte starte neu.',
    restart: 'Neu starten',
    summaryHeading: 'Zusammenfassung',
    paymentNone: 'Keine Angabe',
  },
  en: {
    title: 'Complete Delivery', /* i18n-exempt */
    subtitle: 'Mark order as delivered', /* i18n-exempt */
    step1: 'Order',
    step2: 'Confirm',
    step3: 'Done',
    selectHeading: 'Select active order',
    noEligible: 'No active orders available.',
    confirmHeading: 'Confirm delivery',
    paymentLabel: 'Payment method',
    paymentPlaceholder: 'Select payment method…',
    notesLabel: 'Delivery notes',
    notesPlaceholder: 'Optional delivery notes…',
    customerLabel: 'Customer',
    itemsLabel: 'Ordered items',
    amountLabel: 'Total amount',
    statusLabel: 'Current status',
    orderDateLabel: 'Order date',
    cityLabel: 'Delivery city',
    markDelivered: 'Mark as delivered',
    submitting: 'Saving…',
    successHeading: 'Delivery successfully completed!',
    successDesc: 'The order has been marked as delivered.',
    newDelivery: 'Complete another delivery',
    backDashboard: 'Back to Dashboard',
    back: 'Back',
    noSelection: 'No order selected. Please restart.',
    restart: 'Restart',
    summaryHeading: 'Summary',
    paymentNone: 'Not specified',
  },
});

const ELIGIBLE_STATUSES = ['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs'];
const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function LieferungAbschliessenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { bestellverwaltung, kundenverwaltung, kundenverwaltungMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(() => {
    const s = parseInt(searchParams.get('step') ?? '1', 10);
    return isNaN(s) || s < 1 || s > 3 ? 1 : s;
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [paymentMethodKey, setPaymentMethodKey] = useState<string>('none');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const enrichedBestellungen = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap: new Map(), kundenverwaltungMap }),
    [bestellverwaltung, kundenverwaltungMap]
  );

  const eligibleOrders = useMemo(
    () => enrichedBestellungen.filter(r => ELIGIBLE_STATUSES.includes(lookupKey(r.fields.order_status) ?? '')),
    [enrichedBestellungen]
  );

  const selectedOrder = useMemo<EnrichedBestellverwaltung | null>(
    () => (selectedId ? eligibleOrders.find(r => r.record_id === selectedId) ?? null : null),
    [selectedId, eligibleOrders]
  );

  // Deep-link: ?bestellungId=xxx — auto-select if eligible, skip to step 2
  useEffect(() => {
    const bestellungId = searchParams.get('bestellungId');
    if (!bestellungId || loading) return;
    const found = eligibleOrders.find(r => r.record_id === bestellungId);
    if (found && !selectedId) {
      setSelectedId(bestellungId);
      const existing = lookupKey(found.fields.payment_method);
      if (existing) setPaymentMethodKey(existing);
      if (found.fields.delivery_notes) setDeliveryNotes(found.fields.delivery_notes);
      goToStep(2);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, eligibleOrders.length]);

  function goToStep(n: number) {
    setStep(n);
    setSearchParams(prev => { prev.set('step', String(n)); return prev; }, { replace: true });
  }

  function handleSelectOrder(id: string) {
    setSelectedId(id);
    const found = eligibleOrders.find(r => r.record_id === id);
    if (found) {
      const existing = lookupKey(found.fields.payment_method);
      setPaymentMethodKey(existing ?? 'none');
      setDeliveryNotes(found.fields.delivery_notes ?? '');
    }
    goToStep(2);
  }

  async function handleSubmit() {
    if (!selectedId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedId, {
        order_status: 'geliefert',
        payment_method: paymentMethodKey !== 'none' ? paymentMethodKey : undefined,
        delivery_notes: deliveryNotes.trim() || undefined,
      });
      await fetchAll();
      setSuccess(true);
      goToStep(3);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Fehler beim Speichern.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelectedId(null);
    setPaymentMethodKey('none');
    setDeliveryNotes('');
    setSubmitError(null);
    setSuccess(false);
    setSearchParams({}, { replace: true });
    goToStep(1);
  }

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]}
      currentStep={step}
      onStepChange={goToStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Bestellung auswählen */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleOrders.map(r => ({
            id: r.record_id,
            title: r.kundeName
              ? `${r.kundeName} — ${formatCurrency(r.fields.total_amount)}`
              : `Bestellung ${r.record_id.slice(-6)} — ${formatCurrency(r.fields.total_amount)}`,
            subtitle: [
              r.fields.order_date ? formatDateTime(r.fields.order_date) : null,
              r.fields.delivery_city ?? null,
              r.fields.ordered_items
                ? r.fields.ordered_items.length > 60
                  ? r.fields.ordered_items.slice(0, 60) + '…'
                  : r.fields.ordered_items
                : null,
            ]
              .filter(Boolean)
              .join(' · '),
            status: r.fields.order_status
              ? { key: lookupKey(r.fields.order_status) ?? '', label: String(r.fields.order_status && typeof r.fields.order_status === 'object' && 'label' in r.fields.order_status ? (r.fields.order_status as { label: string }).label : r.fields.order_status) }
              : undefined,
            icon: <IconTruck size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectOrder}
          emptyText={tt('noEligible')}
          emptyIcon={<IconPackage size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Lieferung bestätigen */}
      {step === 2 && (
        selectedOrder ? (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold">{tt('confirmHeading')}</h2>

            {/* Live-Zusammenfassung */}
            <div className="rounded-2xl border bg-card p-4 space-y-3 overflow-hidden">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <IconPackage size={16} />
                <span>{tt('summaryHeading')}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                {selectedOrder.kundeName && (
                  <div>
                    <p className="text-muted-foreground text-xs">{tt('customerLabel')}</p>
                    <p className="font-medium truncate">{selectedOrder.kundeName}</p>
                  </div>
                )}
                {selectedOrder.fields.delivery_city && (
                  <div>
                    <p className="text-muted-foreground text-xs">{tt('cityLabel')}</p>
                    <p className="font-medium truncate">{selectedOrder.fields.delivery_city}</p>
                  </div>
                )}
                {selectedOrder.fields.order_date && (
                  <div>
                    <p className="text-muted-foreground text-xs">{tt('orderDateLabel')}</p>
                    <p className="font-medium">{formatDateTime(selectedOrder.fields.order_date)}</p>
                  </div>
                )}
                {selectedOrder.fields.total_amount != null && (
                  <div>
                    <p className="text-muted-foreground text-xs">{tt('amountLabel')}</p>
                    <p className="font-medium">{formatCurrency(selectedOrder.fields.total_amount)}</p>
                  </div>
                )}
                {selectedOrder.fields.ordered_items && (
                  <div className="sm:col-span-2">
                    <p className="text-muted-foreground text-xs">{tt('itemsLabel')}</p>
                    <p className="font-medium line-clamp-2">{selectedOrder.fields.ordered_items}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground text-xs">{tt('statusLabel')}</p>
                  <StatusBadge
                    statusKey={lookupKey(selectedOrder.fields.order_status)}
                    label={
                      selectedOrder.fields.order_status && typeof selectedOrder.fields.order_status === 'object' && 'label' in selectedOrder.fields.order_status
                        ? String((selectedOrder.fields.order_status as { label: string }).label)
                        : undefined
                    }
                  />
                </div>
              </div>
            </div>

            {/* Zahlungsmethode */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{tt('paymentLabel')}</label>
              <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tt('paymentPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{tt('paymentNone')}</SelectItem>
                  {PAYMENT_OPTIONS.map(opt => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Lieferhinweise */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{tt('notesLabel')}</label>
              <Textarea
                value={deliveryNotes}
                onChange={e => setDeliveryNotes(e.target.value)}
                placeholder={tt('notesPlaceholder')}
                rows={3}
                className="w-full resize-none"
              />
            </div>

            {submitError && (
              <div className="rounded-xl bg-destructive/10 text-destructive text-sm p-3">
                {submitError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={() => goToStep(1)}
                className="w-full sm:w-auto"
                disabled={submitting}
              >
                {tt('back')}
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full sm:flex-1"
              >
                <IconTruck size={16} className="mr-2" />
                {submitting ? tt('submitting') : tt('markDelivered')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noSelection')}</p>
            <Button variant="outline" onClick={() => goToStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3: Abschluss */}
      {step === 3 && (
        success && selectedOrder ? (
          <div className="text-center py-12 space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-4">
                <IconCircleCheck size={48} className="text-green-600" stroke={1.5} />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{tt('successHeading')}</h2>
              <p className="text-muted-foreground text-sm">{tt('successDesc')}</p>
            </div>

            {/* Abschluss-Zusammenfassung */}
            <div className="rounded-2xl border bg-card p-4 text-left space-y-2 max-w-sm mx-auto overflow-hidden">
              {selectedOrder.kundeName && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{tt('customerLabel')}</span>
                  <span className="font-medium truncate ml-2">{selectedOrder.kundeName}</span>
                </div>
              )}
              {selectedOrder.fields.total_amount != null && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{tt('amountLabel')}</span>
                  <span className="font-medium">{formatCurrency(selectedOrder.fields.total_amount)}</span>
                </div>
              )}
              {paymentMethodKey !== 'none' && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{tt('paymentLabel')}</span>
                  <span className="font-medium truncate ml-2">
                    {PAYMENT_OPTIONS.find(o => o.key === paymentMethodKey)?.label ?? paymentMethodKey}
                  </span>
                </div>
              )}
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">{tt('statusLabel')}</span>
                <StatusBadge statusKey="geliefert" label="Geliefert" /* i18n-exempt */ />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="outline" onClick={handleReset}>
                {tt('newDelivery')}
              </Button>
              <a href="#/">
                <Button className="w-full">{tt('backDashboard')}</Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noSelection')}</p>
            <Button variant="outline" onClick={() => goToStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
