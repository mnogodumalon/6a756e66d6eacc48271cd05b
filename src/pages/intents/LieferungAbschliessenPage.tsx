/**
 * Lieferung abschließen — 3-Schritt-Wizard.
 * Steps: 1) Bestellung wählen (status: neu|in_bearbeitung|bereit_zur_lieferung|unterwegs)
 *        → 2) Zahlung & Details prüfen (payment_method, delivery_notes)
 *        → 3) Abschließen bestätigen (update order_status='geliefert', Fahrer auf 'verfuegbar').
 * Reads: bestellverwaltung, fahrerverwaltung. Writes: bestellverwaltung (updateBestellverwaltungEntry), fahrerverwaltung (updateFahrerverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IconTruckDelivery, IconCreditCard, IconCircleCheck, IconMapPin } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import { LOOKUP_OPTIONS } from '@/types/app';
import { tx } from '@/i18n';
import { format } from 'date-fns';

const ACTIVE_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs']);
const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

function formatCurrency(amount?: number): string {
  if (amount == null) return '—';
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
}

function formatDeliveryTime(val?: string): string {
  if (!val) return '—';
  try {
    const d = new Date(val);
    return format(d, 'dd.MM.yyyy HH:mm');
  } catch {
    return val;
  }
}

export default function LieferungAbschliessenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStep = parseInt(searchParams.get('step') ?? '1', 10);
  const initialBestellungId = searchParams.get('bestellungId') ?? '';

  const [step, setStep] = useState(initialStep);
  const [selectedBestellungId, setSelectedBestellungId] = useState(initialBestellungId);
  const [paymentMethodKey, setPaymentMethodKey] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [done, setDone] = useState(false);
  const [completedFahrerName, setCompletedFahrerName] = useState('');

  const { bestellverwaltung, fahrerverwaltung, loading, error, fetchAll, fahrerverwaltungMap } = useDashboardData();

  const activeOrders = useMemo(
    () => bestellverwaltung.filter(b => ACTIVE_STATUSES.has(b.fields.order_status?.key ?? '')),
    [bestellverwaltung]
  );

  const selectedOrder = useMemo(
    () => bestellverwaltung.find(b => b.record_id === selectedBestellungId) ?? null,
    [bestellverwaltung, selectedBestellungId]
  );

  function handleStepChange(s: number) {
    setStep(s);
    const params = new URLSearchParams(searchParams);
    params.set('step', String(s));
    setSearchParams(params, { replace: true });
  }

  function handleSelectOrder(id: string) {
    const order = bestellverwaltung.find(b => b.record_id === id);
    setSelectedBestellungId(id);
    setPaymentMethodKey(order?.fields.payment_method?.key ?? '');
    setDeliveryNotes(order?.fields.delivery_notes ?? '');
    const params = new URLSearchParams(searchParams);
    params.set('bestellungId', id);
    params.set('step', '2');
    setSearchParams(params, { replace: true });
    setStep(2);
  }

  async function handleConfirm() {
    if (!selectedOrder) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const updatePayload: Record<string, unknown> = {
        order_status: 'geliefert',
        delivery_notes: deliveryNotes || undefined,
      };
      if (paymentMethodKey && paymentMethodKey !== 'none') {
        updatePayload.payment_method = paymentMethodKey;
      }
      await LivingAppsService.updateBestellverwaltungEntry(selectedOrder.record_id, updatePayload);

      const fahrerId = selectedOrder.fields.fahrer
        ? extractRecordId(selectedOrder.fields.fahrer)
        : null;

      let fahrerName = '';
      if (fahrerId) {
        const fahrer = fahrerverwaltungMap.get(fahrerId);
        fahrerName = [fahrer?.fields.driver_first_name, fahrer?.fields.driver_last_name]
          .filter(Boolean).join(' ');
        await LivingAppsService.updateFahrerverwaltungEntry(fahrerId, { driver_status: 'verfuegbar' });
      }

      setCompletedFahrerName(fahrerName);
      await fetchAll();
      setDone(true);
      handleStepChange(3);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tx('Fehler beim Abschließen der Lieferung'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelectedBestellungId('');
    setPaymentMethodKey('');
    setDeliveryNotes('');
    setDone(false);
    setCompletedFahrerName('');
    setSubmitError('');
    const params = new URLSearchParams();
    params.set('step', '1');
    setSearchParams(params, { replace: true });
    setStep(1);
  }

  // Enrich orders for display
  const enrichedActiveOrders = useMemo((): EnrichedBestellverwaltung[] =>
    activeOrders.map(o => {
      const fahrerId = o.fields.fahrer ? extractRecordId(o.fields.fahrer) : null;
      const fahrer = fahrerId ? fahrerverwaltungMap.get(fahrerId) : undefined;
      const fahrerName = fahrer
        ? [fahrer.fields.driver_first_name, fahrer.fields.driver_last_name].filter(Boolean).join(' ')
        : '';
      return { ...o, fahrerName, kundeName: '' };
    }),
    [activeOrders, fahrerverwaltungMap]
  );

  // Fahrer name for the selected order
  const selectedFahrerName = useMemo(() => {
    if (!selectedOrder?.fields.fahrer) return '';
    const fahrerId = extractRecordId(selectedOrder.fields.fahrer);
    if (!fahrerId) return '';
    const fahrer = fahrerverwaltungMap.get(fahrerId);
    return fahrer
      ? [fahrer.fields.driver_first_name, fahrer.fields.driver_last_name].filter(Boolean).join(' ')
      : '';
  }, [selectedOrder, fahrerverwaltungMap]);

  return (
    <IntentWizardShell
      title={tx('Lieferung abschließen')}
      subtitle={tx('Bestellung als geliefert markieren und Fahrer freigeben')}
      steps={[
        { label: tx('Bestellung') },
        { label: tx('Zahlung & Details') },
        { label: tx('Abschließen') },
      ]}
      currentStep={step}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Bestellung wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={enrichedActiveOrders.map(o => ({
            id: o.record_id,
            title: o.fields.ordered_items
              ? o.fields.ordered_items.length > 60
                ? o.fields.ordered_items.slice(0, 60) + '…'
                : o.fields.ordered_items
              : tx('Keine Artikelangabe'),
            subtitle: [
              o.fields.delivery_city,
              o.fields.desired_delivery_time
                ? formatDeliveryTime(o.fields.desired_delivery_time)
                : null,
              o.fahrerName ? `${tx('Fahrer')}: ${o.fahrerName}` : null,
            ].filter(Boolean).join(' · '),
            status: o.fields.order_status
              ? { key: o.fields.order_status.key, label: o.fields.order_status.label }
              : undefined,
            stats: [
              { label: tx('Betrag'), value: formatCurrency(o.fields.total_amount) },
            ],
            icon: <IconTruckDelivery size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectOrder}
          searchPlaceholder={tx('Bestellung suchen …')}
          emptyText={tx('Keine aktiven Bestellungen gefunden')}
          emptyIcon={<IconTruckDelivery size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Step 2: Zahlung & Details prüfen */}
      {step === 2 && (
        selectedOrder ? (
          <div className="space-y-6 max-w-xl mx-auto">
            {/* Order summary */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b flex items-center justify-between gap-3">
                <h2 className="font-semibold text-foreground truncate">
                  {selectedOrder.fields.ordered_items
                    ? selectedOrder.fields.ordered_items.length > 70
                      ? selectedOrder.fields.ordered_items.slice(0, 70) + '…'
                      : selectedOrder.fields.ordered_items
                    : tx('Keine Artikelangabe')}
                </h2>
                <StatusBadge
                  statusKey={selectedOrder.fields.order_status?.key}
                  label={selectedOrder.fields.order_status?.label}
                />
              </div>
              <div className="px-5 py-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                <div className="space-y-0.5">
                  <p className="text-muted-foreground">{tx('Betrag')}</p>
                  <p className="font-medium text-foreground">{formatCurrency(selectedOrder.fields.total_amount)}</p>
                </div>
                <div className="space-y-0.5">
                  <p className="text-muted-foreground">{tx('Gewünschte Lieferzeit')}</p>
                  <p className="font-medium text-foreground">{formatDeliveryTime(selectedOrder.fields.desired_delivery_time)}</p>
                </div>
                <div className="space-y-0.5 sm:col-span-2">
                  <p className="text-muted-foreground flex items-center gap-1">
                    <IconMapPin size={14} />
                    {tx('Lieferadresse')}
                  </p>
                  <p className="font-medium text-foreground">
                    {[
                      selectedOrder.fields.delivery_street,
                      selectedOrder.fields.delivery_house_number,
                      selectedOrder.fields.delivery_postal_code,
                      selectedOrder.fields.delivery_city,
                    ].filter(Boolean).join(' ') || '—'}
                  </p>
                </div>
                {selectedFahrerName && (
                  <div className="space-y-0.5">
                    <p className="text-muted-foreground">{tx('Fahrer')}</p>
                    <p className="font-medium text-foreground">{selectedFahrerName}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Editable fields */}
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b">
                <h3 className="font-semibold text-foreground flex items-center gap-2">
                  <IconCreditCard size={18} />
                  {tx('Zahlung & Abschlussnotiz')}
                </h3>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Zahlungsmethode')}
                  </label>
                  <Select
                    value={paymentMethodKey || 'none'}
                    onValueChange={v => setPaymentMethodKey(v === 'none' ? '' : v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={tx('Zahlungsmethode wählen')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tx('Nicht angegeben')}</SelectItem>
                      {PAYMENT_OPTIONS.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Abschlussnotiz')} <span className="text-muted-foreground font-normal">({tx('optional')})</span>
                  </label>
                  <Textarea
                    value={deliveryNotes}
                    onChange={e => setDeliveryNotes(e.target.value)}
                    placeholder={tx('Hinweise zur Lieferung …')}
                    rows={3}
                    className="resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => handleStepChange(1)} className="flex-1">
                {tx('Zurück')}
              </Button>
              <Button onClick={() => handleStepChange(3)} className="flex-1">
                {tx('Weiter zur Bestätigung')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>{tx('Zurück zu Schritt 1')}</Button>
          </div>
        )
      )}

      {/* Step 3: Abschließen bestätigen */}
      {step === 3 && (
        done ? (
          <div className="max-w-md mx-auto text-center space-y-6 py-8">
            <div className="flex justify-center">
              <div className="rounded-full bg-green-100 p-4">
                <IconCircleCheck size={48} className="text-green-600" stroke={1.5} />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold text-foreground">{tx('Lieferung abgeschlossen!')}</h2>
              <p className="text-muted-foreground text-sm">
                {tx('Die Bestellung wurde als geliefert markiert.')}
                {completedFahrerName && (
                  <> {tx('Fahrer')} <strong>{completedFahrerName}</strong> {tx('ist wieder verfügbar.')}</>
                )}
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset} variant="outline">
                {tx('Weitere Lieferung abschließen')}
              </Button>
              <Button asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : selectedOrder ? (
          <div className="space-y-6 max-w-xl mx-auto">
            <div className="rounded-2xl border bg-card shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b">
                <h2 className="font-semibold text-foreground">{tx('Zusammenfassung')}</h2>
              </div>
              <div className="px-5 py-4 space-y-3 text-sm">
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{tx('Bestellung')}</span>
                  <span className="font-medium text-foreground truncate max-w-[60%] text-right">
                    {selectedOrder.fields.ordered_items
                      ? selectedOrder.fields.ordered_items.length > 50
                        ? selectedOrder.fields.ordered_items.slice(0, 50) + '…'
                        : selectedOrder.fields.ordered_items
                      : '—'}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{tx('Betrag')}</span>
                  <span className="font-medium text-foreground">{formatCurrency(selectedOrder.fields.total_amount)}</span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{tx('Zahlungsmethode')}</span>
                  <span className="font-medium text-foreground">
                    {paymentMethodKey && paymentMethodKey !== 'none'
                      ? PAYMENT_OPTIONS.find(o => o.key === paymentMethodKey)?.label ?? paymentMethodKey
                      : tx('Nicht angegeben')}
                  </span>
                </div>
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">{tx('Lieferadresse')}</span>
                  <span className="font-medium text-foreground text-right">
                    {[
                      selectedOrder.fields.delivery_street,
                      selectedOrder.fields.delivery_house_number,
                      selectedOrder.fields.delivery_postal_code,
                      selectedOrder.fields.delivery_city,
                    ].filter(Boolean).join(' ') || '—'}
                  </span>
                </div>
                {selectedFahrerName && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{tx('Fahrer')}</span>
                    <span className="font-medium text-foreground">{selectedFahrerName}</span>
                  </div>
                )}
                {deliveryNotes && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{tx('Notiz')}</span>
                    <span className="font-medium text-foreground text-right max-w-[60%]">{deliveryNotes}</span>
                  </div>
                )}
                <div className="pt-2 border-t flex justify-between gap-2">
                  <span className="text-muted-foreground">{tx('Neuer Status')}</span>
                  <StatusBadge statusKey="geliefert" label={tx('Geliefert')} />
                </div>
                {selectedFahrerName && (
                  <div className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{tx('Fahrerstatus')}</span>
                    <StatusBadge statusKey="verfuegbar" label={tx('Verfügbar')} />
                  </div>
                )}
              </div>
            </div>

            {submitError && (
              <p className="text-sm text-destructive bg-destructive/10 rounded-lg px-4 py-3">{submitError}</p>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => handleStepChange(2)} className="flex-1" disabled={submitting}>
                {tx('Zurück')}
              </Button>
              <Button onClick={handleConfirm} disabled={submitting} className="flex-1">
                {submitting ? tx('Wird abgeschlossen …') : tx('Lieferung abschließen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => handleStepChange(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
