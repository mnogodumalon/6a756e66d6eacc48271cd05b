/**
 * Lieferung abschließen — 4-Schritt-Wizard.
 * Steps: 1) Bestellung auswählen → 2) Lieferung bestätigen (Status + Notiz) →
 *         3) Fahrer freistellen (optional, nur wenn Bestellung einen Fahrer hat) →
 *         4) Bestätigung / Zusammenfassung.
 * Reads: bestellverwaltung, fahrerverwaltung, kundenverwaltung.
 * Writes: bestellverwaltung (updateBestellverwaltungEntry), fahrerverwaltung (updateFahrerverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Bestellverwaltung, Fahrerverwaltung } from '@/types/app';
import { LOOKUP_OPTIONS, APP_IDS } from '@/types/app';
import { LivingAppsService, extractRecordId } from '@/services/livingAppsService';
import { formatCurrency, formatDateTime } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconTruckDelivery, IconUser, IconCheck, IconAlertTriangle } from '@tabler/icons-react';

const tt = makeT({
  de: {
    pageTitle: 'Lieferung abschließen',
    subtitle: 'Bestellung als geliefert markieren und Fahrer freistellen',
    step1: 'Bestellung',
    step2: 'Bestätigen',
    step3: 'Fahrer',
    step4: 'Fertig',
    selectOrder: 'Bestellung auswählen',
    selectOrderSub: 'Aktive Bestellungen, die geliefert werden können',
    orderItems: 'Artikel',
    amount: 'Betrag',
    deliveryTime: 'Gewünschte Lieferzeit',
    customer: 'Kunde',
    confirmTitle: 'Lieferung bestätigen',
    confirmSub: 'Bestelldetails prüfen und Status setzen',
    statusLabel: 'Bestellstatus',
    notesLabel: 'Abschlussnotiz (optional)',
    notesPlaceholder: 'Hinweise zur Lieferung…',
    confirmBtn: 'Lieferung bestätigen',
    confirming: 'Wird gespeichert…',
    driverTitle: 'Fahrer freistellen',
    driverSub: 'Fahrer auf verfügbar setzen?',
    driverName: 'Fahrer',
    driverStatus: 'Aktueller Status',
    freeDriverBtn: 'Fahrer freistellen',
    skipDriverBtn: 'Fahrer-Status behalten',
    settingDriver: 'Wird gespeichert…',
    doneTitle: 'Erfolgreich abgeschlossen',
    doneSub: 'Die Bestellung wurde als geliefert markiert.',
    orderUpdated: 'Bestellstatus aktualisiert',
    driverFreed: 'Fahrer freigestellt',
    noDriver: 'Kein Fahrer zugewiesen',
    newDelivery: 'Neue Lieferung abschließen',
    backDashboard: 'Zurück zum Dashboard',
    errorTitle: 'Fehler',
    noOrderSelected: 'Keine Bestellung ausgewählt. Bitte neu starten.',
    restart: 'Neu starten',
    noEligibleOrders: 'Keine aktiven Bestellungen',
    noEligibleOrdersSub: 'Alle Bestellungen sind bereits abgeschlossen oder storniert.',
    statusLabel2: 'Status',
    zoneLabel: 'Zone',
  },
  en: {
    pageTitle: 'Complete Delivery',
    subtitle: 'Mark order as delivered and release driver',
    step1: 'Order',
    step2: 'Confirm',
    step3: 'Driver',
    step4: 'Done',
    selectOrder: 'Select Order',
    selectOrderSub: 'Active orders that can be delivered',
    orderItems: 'Items',
    amount: 'Amount',
    deliveryTime: 'Desired Delivery Time',
    customer: 'Customer',
    confirmTitle: 'Confirm Delivery',
    confirmSub: 'Review order details and set status',
    statusLabel: 'Order Status',
    notesLabel: 'Closing note (optional)',
    notesPlaceholder: 'Notes about the delivery…',
    confirmBtn: 'Confirm Delivery',
    confirming: 'Saving…',
    driverTitle: 'Release Driver',
    driverSub: 'Set driver to available?',
    driverName: 'Driver',
    driverStatus: 'Current Status',
    freeDriverBtn: 'Release Driver',
    skipDriverBtn: 'Keep Driver Status',
    settingDriver: 'Saving…',
    doneTitle: 'Successfully Completed',
    doneSub: 'The order has been marked as delivered.',
    orderUpdated: 'Order status updated',
    driverFreed: 'Driver released',
    noDriver: 'No driver assigned',
    newDelivery: 'Complete new delivery',
    backDashboard: 'Back to Dashboard',
    errorTitle: 'Error',
    noOrderSelected: 'No order selected. Please restart.',
    restart: 'Restart',
    noEligibleOrders: 'No active orders',
    noEligibleOrdersSub: 'All orders are already completed or cancelled.',
    statusLabel2: 'Status',
    zoneLabel: 'Zone',
  },
  cs: {
    pageTitle: 'Dokončit doručení',
    subtitle: 'Označit objednávku jako doručenou a uvolnit řidiče',
    step1: 'Objednávka',
    step2: 'Potvrdit',
    step3: 'Řidič',
    step4: 'Hotovo',
    selectOrder: 'Vybrat objednávku',
    selectOrderSub: 'Aktivní objednávky, které lze doručit',
    orderItems: 'Položky',
    amount: 'Částka',
    deliveryTime: 'Požadovaný čas doručení',
    customer: 'Zákazník',
    confirmTitle: 'Potvrdit doručení',
    confirmSub: 'Zkontrolovat detaily objednávky a nastavit stav',
    statusLabel: 'Stav objednávky',
    notesLabel: 'Závěrečná poznámka (volitelné)',
    notesPlaceholder: 'Poznámky k doručení…',
    confirmBtn: 'Potvrdit doručení',
    confirming: 'Ukládá se…',
    driverTitle: 'Uvolnit řidiče',
    driverSub: 'Nastavit řidiče jako dostupného?',
    driverName: 'Řidič',
    driverStatus: 'Aktuální stav',
    freeDriverBtn: 'Uvolnit řidiče',
    skipDriverBtn: 'Zachovat stav řidiče',
    settingDriver: 'Ukládá se…',
    doneTitle: 'Úspěšně dokončeno',
    doneSub: 'Objednávka byla označena jako doručená.',
    orderUpdated: 'Stav objednávky aktualizován',
    driverFreed: 'Řidič uvolněn',
    noDriver: 'Žádný řidič přiřazen',
    newDelivery: 'Dokončit nové doručení',
    backDashboard: 'Zpět na přehled',
    errorTitle: 'Chyba',
    noOrderSelected: 'Žádná objednávka nebyla vybrána. Restartujte prosím.',
    restart: 'Restartovat',
    noEligibleOrders: 'Žádné aktivní objednávky',
    noEligibleOrdersSub: 'Všechny objednávky jsou již dokončeny nebo zrušeny.',
    statusLabel2: 'Stav',
    zoneLabel: 'Zóna',
  },
});

const ELIGIBLE_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs']);
const ORDER_STATUS_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? [];
const DRIVER_STATUS_OPTIONS = LOOKUP_OPTIONS['fahrerverwaltung']?.['driver_status'] ?? [];

export default function LieferungAbschliessenPage() {
  const { bestellverwaltung, fahrerverwaltung, kundenverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<Bestellverwaltung | null>(null);
  const [selectedFahrer, setSelectedFahrer] = useState<Fahrerverwaltung | null>(null);
  const [orderStatusKey, setOrderStatusKey] = useState('geliefert');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [settingDriver, setSettingDriver] = useState(false);
  const [driverFreed, setDriverFreed] = useState(false);
  const [driverSkipped, setDriverSkipped] = useState(false);

  const kundenverwaltungMap = useMemo(() => {
    const m = new Map<string, string>();
    kundenverwaltung.forEach(k => {
      const name = [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id;
      m.set(k.record_id, name);
    });
    return m;
  }, [kundenverwaltung]);

  const eligibleOrders = useMemo(
    () => bestellverwaltung.filter(o => {
      const statusKey = o.fields.order_status?.key;
      return statusKey !== undefined && ELIGIBLE_STATUSES.has(statusKey);
    }),
    [bestellverwaltung]
  );

  const handleSelectOrder = (id: string) => {
    const order = bestellverwaltung.find(o => o.record_id === id) ?? null;
    setSelectedOrder(order);

    if (order) {
      const fahrerId = extractRecordId(order.fields.fahrer);
      if (fahrerId) {
        const fahrer = fahrerverwaltung.find(f => f.record_id === fahrerId) ?? null;
        setSelectedFahrer(fahrer);
      } else {
        setSelectedFahrer(null);
      }
    }
    setStep(2);
  };

  const handleConfirmDelivery = async () => {
    if (!selectedOrder) return;
    setConfirming(true);
    setConfirmError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedOrder.record_id, {
        order_status: orderStatusKey,
        delivery_notes: deliveryNotes || undefined,
      });
      await fetchAll();
      if (selectedFahrer) {
        setStep(3);
      } else {
        setStep(4);
      }
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Fehler beim Speichern');
    } finally {
      setConfirming(false);
    }
  };

  const handleFreeDriver = async () => {
    if (!selectedFahrer) return;
    setSettingDriver(true);
    setConfirmError(null);
    try {
      await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrer.record_id, {
        driver_status: 'verfuegbar',
      });
      await fetchAll();
      setDriverFreed(true);
      setStep(4);
    } catch (err) {
      setConfirmError(err instanceof Error ? err.message : 'Fehler beim Freistellen');
    } finally {
      setSettingDriver(false);
    }
  };

  const handleSkipDriver = () => {
    setDriverSkipped(true);
    setStep(4);
  };

  const handleReset = () => {
    setSelectedOrder(null);
    setSelectedFahrer(null);
    setOrderStatusKey('geliefert');
    setDeliveryNotes('');
    setConfirmError(null);
    setDriverFreed(false);
    setDriverSkipped(false);
    setStep(1);
  };

  const kundeLabel = selectedOrder
    ? (() => {
        const kid = extractRecordId(selectedOrder.fields.kunde);
        return kid ? (kundenverwaltungMap.get(kid) ?? '—') : '—';
      })()
    : '—';

  const orderStatusLabel = ORDER_STATUS_OPTIONS.find(o => o.key === orderStatusKey)?.label ?? orderStatusKey;

  const wizardSteps = [
    { label: tt('step1') },
    { label: tt('step2') },
    { label: tt('step3') },
    { label: tt('step4') },
  ];

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={wizardSteps}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1 — Bestellung auswählen */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleOrders.map(o => {
            const kid = extractRecordId(o.fields.kunde);
            const kundeName = kid ? (kundenverwaltungMap.get(kid) ?? '—') : '—';
            return {
              id: o.record_id,
              title: kundeName,
              subtitle: [
                o.fields.ordered_items ? `${tt('orderItems')}: ${o.fields.ordered_items}` : null,
                o.fields.total_amount != null ? formatCurrency(o.fields.total_amount) : null,
                o.fields.desired_delivery_time ? `${tt('deliveryTime')}: ${formatDateTime(o.fields.desired_delivery_time)}` : null,
              ].filter(Boolean).join(' · '),
              status: o.fields.order_status
                ? { key: o.fields.order_status.key, label: o.fields.order_status.label }
                : undefined,
              icon: <IconTruckDelivery size={20} className="text-primary" />,
            };
          })}
          onSelect={handleSelectOrder}
          emptyText={tt('noEligibleOrders')}
        />
      )}

      {/* Step 2 — Lieferung bestätigen */}
      {step === 2 && (
        selectedOrder ? (
          <div className="space-y-6 max-w-xl">
            <div>
              <h2 className="text-lg font-semibold">{tt('confirmTitle')}</h2>
              <p className="text-sm text-muted-foreground">{tt('confirmSub')}</p>
            </div>

            {/* Readonly summary */}
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-2">
                <IconUser size={16} className="text-muted-foreground" />
                <span className="text-sm font-medium">{tt('customer')}:</span>
                <span className="text-sm">{kundeLabel}</span>
              </div>
              {selectedOrder.fields.ordered_items && (
                <div className="flex gap-2">
                  <span className="text-sm font-medium">{tt('orderItems')}:</span>
                  <span className="text-sm text-muted-foreground">{selectedOrder.fields.ordered_items}</span>
                </div>
              )}
              {selectedOrder.fields.total_amount != null && (
                <div className="flex gap-2">
                  <span className="text-sm font-medium">{tt('amount')}:</span>
                  <span className="text-sm text-muted-foreground">{formatCurrency(selectedOrder.fields.total_amount)}</span>
                </div>
              )}
              {selectedOrder.fields.desired_delivery_time && (
                <div className="flex gap-2">
                  <span className="text-sm font-medium">{tt('deliveryTime')}:</span>
                  <span className="text-sm text-muted-foreground">{formatDateTime(selectedOrder.fields.desired_delivery_time)}</span>
                </div>
              )}
              {selectedOrder.fields.order_status && (
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{tt('statusLabel2')}:</span>
                  <StatusBadge statusKey={selectedOrder.fields.order_status.key} label={selectedOrder.fields.order_status.label} />
                </div>
              )}
            </div>

            {/* Status select */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{tt('statusLabel')}</label>
              <Select value={orderStatusKey} onValueChange={setOrderStatusKey}>
                <SelectTrigger className="w-full">
                  <SelectValue>{orderStatusLabel}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Delivery notes */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{tt('notesLabel')}</label>
              <Textarea
                value={deliveryNotes}
                onChange={e => setDeliveryNotes(e.target.value)}
                placeholder={tt('notesPlaceholder')}
                rows={3}
                className="w-full"
              />
            </div>

            {confirmError && (
              <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <IconAlertTriangle size={16} />
                {confirmError}
              </div>
            )}

            <Button onClick={handleConfirmDelivery} disabled={confirming} className="w-full">
              {confirming ? tt('confirming') : tt('confirmBtn')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noOrderSelected')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3 — Fahrer freistellen */}
      {step === 3 && (
        selectedOrder ? (
          selectedFahrer ? (
            <div className="space-y-6 max-w-xl">
              <div>
                <h2 className="text-lg font-semibold">{tt('driverTitle')}</h2>
                <p className="text-sm text-muted-foreground">{tt('driverSub')}</p>
              </div>

              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <IconUser size={16} className="text-muted-foreground" />
                  <span className="text-sm font-medium">{tt('driverName')}:</span>
                  <span className="text-sm">
                    {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name].filter(Boolean).join(' ') || selectedFahrer.record_id}
                  </span>
                </div>
                {selectedFahrer.fields.driver_status && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{tt('driverStatus')}:</span>
                    <StatusBadge statusKey={selectedFahrer.fields.driver_status.key} label={selectedFahrer.fields.driver_status.label} />
                  </div>
                )}
                {selectedFahrer.fields.delivery_zone && (
                  <div className="flex gap-2">
                    <span className="text-sm font-medium">{tt('zoneLabel')}:</span>
                    <span className="text-sm text-muted-foreground">{selectedFahrer.fields.delivery_zone}</span>
                  </div>
                )}
              </div>

              {confirmError && (
                <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  <IconAlertTriangle size={16} />
                  {confirmError}
                </div>
              )}

              <div className="flex flex-col gap-3 sm:flex-row">
                <Button onClick={handleFreeDriver} disabled={settingDriver} className="flex-1">
                  {settingDriver ? tt('settingDriver') : tt('freeDriverBtn')}
                </Button>
                <Button variant="outline" onClick={handleSkipDriver} disabled={settingDriver} className="flex-1">
                  {tt('skipDriverBtn')}
                </Button>
              </div>
            </div>
          ) : (
            // No fahrer — should normally be skipped automatically
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noDriver')}</p>
              <Button onClick={() => setStep(4)}>{tt('confirmBtn')}</Button>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noOrderSelected')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 4 — Bestätigung */}
      {step === 4 && (
        <div className="space-y-6 max-w-xl">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <IconCheck size={24} className="text-primary" />
            </div>
            <div>
              <h2 className="text-lg font-semibold">{tt('doneTitle')}</h2>
              <p className="text-sm text-muted-foreground">{tt('doneSub')}</p>
            </div>
          </div>

          <div className="rounded-2xl border bg-card p-4 space-y-3">
            {selectedOrder && (
              <div className="flex items-center gap-2">
                <IconCheck size={16} className="text-green-600" />
                <span className="text-sm">{tt('orderUpdated')}: </span>
                <StatusBadge
                  statusKey={orderStatusKey}
                  label={ORDER_STATUS_OPTIONS.find(o => o.key === orderStatusKey)?.label ?? orderStatusKey}
                />
              </div>
            )}

            {selectedFahrer && (driverFreed || driverSkipped) && (
              <div className="flex items-center gap-2">
                <IconCheck size={16} className={driverFreed ? 'text-green-600' : 'text-muted-foreground'} />
                <span className="text-sm">
                  {driverFreed ? (
                    <>
                      {tt('driverFreed')}: {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name].filter(Boolean).join(' ')} →{' '}
                      <StatusBadge
                        statusKey="verfuegbar"
                        label={DRIVER_STATUS_OPTIONS.find(o => o.key === 'verfuegbar')?.label ?? 'Verfügbar'}
                      />
                    </>
                  ) : (
                    tt('skipDriverBtn')
                  )}
                </span>
              </div>
            )}

            {!selectedFahrer && (
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-sm">{tt('noDriver')}</span>
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button variant="outline" onClick={handleReset} className="flex-1">
              {tt('newDelivery')}
            </Button>
            <a href="#/" className="flex-1">
              <Button className="w-full">{tt('backDashboard')}</Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
