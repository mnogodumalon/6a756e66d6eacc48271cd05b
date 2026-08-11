/**
 * Neue Bestellung — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen (nur aktive Kunden) → 2) Bestelldetails erfassen (creates Bestellverwaltung) → 3) Fahrer zuweisen (optional, nur verfügbare Fahrer).
 * Reads: kundenverwaltung (filter: customer_status='aktiv'), fahrerverwaltung (filter: driver_status='verfuegbar').
 * Writes: bestellverwaltung (createBestellverwaltungEntry), ggf. updateBestellverwaltungEntry für Fahrerzuweisung.
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState, useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import type { Kundenverwaltung, Fahrerverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { IconUser, IconShoppingCart, IconTruck, IconCheck, IconCircleCheck } from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Neue Bestellung', /* i18n-exempt */
    subtitle: 'Kunde wählen, Bestelldetails eingeben und Fahrer zuweisen',
    step1: 'Kunde',
    step2: 'Bestelldetails',
    step3: 'Fahrer',
    step4: 'Fertig',
    selectCustomer: 'Aktiven Kunden auswählen',
    noActiveCustomers: 'Keine aktiven Kunden vorhanden',
    orderedItems: 'Bestellte Artikel',
    orderedItemsPlaceholder: 'Artikel, Mengen und Beschreibung eingeben …',
    totalAmount: 'Gesamtbetrag (€)',
    orderDate: 'Bestelldatum und -uhrzeit',
    desiredDelivery: 'Gewünschter Lieferzeitpunkt (optional)',
    paymentMethod: 'Zahlungsmethode (optional)',
    paymentNone: 'Keine Angabe',
    deliveryAddress: 'Lieferadresse',
    deliveryStreet: 'Straße',
    deliveryHouseNumber: 'Hausnummer',
    deliveryPostalCode: 'Postleitzahl',
    deliveryCity: 'Stadt',
    addressPrefilled: 'Adresse aus Kundendaten übernommen — bitte prüfen',
    createOrder: 'Bestellung anlegen',
    creating: 'Wird angelegt …',
    selectDriver: 'Verfügbaren Fahrer zuweisen',
    noAvailableDrivers: 'Keine verfügbaren Fahrer',
    skipDriver: 'Ohne Fahrer fortfahren',
    assignDriver: 'Fahrer zuweisen',
    assigning: 'Wird zugewiesen …',
    successTitle: 'Bestellung erfolgreich angelegt!',
    summaryItems: 'Bestellte Artikel',
    summaryAmount: 'Gesamtbetrag',
    summaryCustomer: 'Kunde',
    summaryDriver: 'Fahrer',
    noDriverAssigned: 'Kein Fahrer zugewiesen',
    newOrder: 'Neue Bestellung anlegen',
    backToDashboard: 'Zurück zum Dashboard',
    required: 'Pflichtfeld',
    fillRequired: 'Bitte alle Pflichtfelder ausfüllen',
    vehicle: 'Fahrzeug',
    zone: 'Liefergebiet',
    phone: 'Telefon',
    city: 'Stadt',
    customerSelected: 'Kunde ausgewählt',
    continueToDetails: 'Weiter zu den Bestelldetails',
    backToCustomer: 'Zurück zur Kundenauswahl',
    backToDetails: 'Zurück zu den Bestelldetails',
    step2Restart: 'Bitte zuerst einen Kunden auswählen.',
    step3Restart: 'Bitte zuerst die Bestelldetails eingeben.',
    restart: 'Neu starten',
  },
  en: {
    title: 'New Order', /* i18n-exempt */
    subtitle: 'Choose customer, enter order details and assign a driver',
    step1: 'Customer',
    step2: 'Order Details',
    step3: 'Driver',
    step4: 'Done',
    selectCustomer: 'Select an active customer',
    noActiveCustomers: 'No active customers available',
    orderedItems: 'Ordered Items',
    orderedItemsPlaceholder: 'Enter items, quantities and description …',
    totalAmount: 'Total Amount (€)',
    orderDate: 'Order Date and Time',
    desiredDelivery: 'Requested Delivery Time (optional)',
    paymentMethod: 'Payment Method (optional)',
    paymentNone: 'No selection',
    deliveryAddress: 'Delivery Address',
    deliveryStreet: 'Street',
    deliveryHouseNumber: 'House Number',
    deliveryPostalCode: 'Postal Code',
    deliveryCity: 'City',
    addressPrefilled: 'Address pre-filled from customer data — please verify',
    createOrder: 'Create Order',
    creating: 'Creating …',
    selectDriver: 'Assign an available driver',
    noAvailableDrivers: 'No available drivers',
    skipDriver: 'Continue without driver',
    assignDriver: 'Assign Driver',
    assigning: 'Assigning …',
    successTitle: 'Order created successfully!',
    summaryItems: 'Ordered Items',
    summaryAmount: 'Total Amount',
    summaryCustomer: 'Customer',
    summaryDriver: 'Driver',
    noDriverAssigned: 'No driver assigned',
    newOrder: 'Create New Order',
    backToDashboard: 'Back to Dashboard',
    required: 'Required',
    fillRequired: 'Please fill in all required fields',
    vehicle: 'Vehicle',
    zone: 'Delivery Zone',
    phone: 'Phone',
    city: 'City',
    customerSelected: 'Customer selected',
    continueToDetails: 'Continue to Order Details',
    backToCustomer: 'Back to Customer Selection',
    backToDetails: 'Back to Order Details',
    step2Restart: 'Please select a customer first.',
    step3Restart: 'Please fill in order details first.',
    restart: 'Start over',
  },
});

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function NeueBestellungPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  // Wizard step state
  const [step, setStep] = useState(1);

  // Step 1 state
  const [selectedKunde, setSelectedKunde] = useState<Kundenverwaltung | null>(null);

  // Step 2 state
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [orderDate, setOrderDate] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState('none');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [newOrderId, setNewOrderId] = useState<string | null>(null);
  const [showRequiredHint, setShowRequiredHint] = useState(false);

  // Step 3 state
  const [selectedFahrer, setSelectedFahrer] = useState<Fahrerverwaltung | null>(null);
  const [isAssigning, setIsAssigning] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Summary state
  const [summaryFahrerName, setSummaryFahrerName] = useState<string | null>(null);

  // Filter active customers
  const activeKunden = useMemo(
    () => kundenverwaltung.filter(k => k.fields.customer_status?.key === 'aktiv'),
    [kundenverwaltung]
  );

  // Filter available drivers
  const availableFahrer = useMemo(
    () => fahrerverwaltung.filter(f => f.fields.driver_status?.key === 'verfuegbar'),
    [fahrerverwaltung]
  );

  // Pre-fill delivery address from selected customer
  const prefillFromCustomer = useCallback((kunde: Kundenverwaltung) => {
    setDeliveryStreet(kunde.fields.street ?? '');
    setDeliveryHouseNumber(kunde.fields.house_number ?? '');
    setDeliveryPostalCode(kunde.fields.postal_code ?? '');
    setDeliveryCity(kunde.fields.city ?? '');
  }, []);

  const handleSelectKunde = useCallback((id: string) => {
    const kunde = kundenverwaltung.find(k => k.record_id === id);
    if (!kunde) return;
    setSelectedKunde(kunde);
    prefillFromCustomer(kunde);
    setStep(2);
  }, [kundenverwaltung, prefillFromCustomer]);

  const handleCreateOrder = useCallback(async () => {
    if (!selectedKunde || !orderedItems.trim() || !totalAmount || !orderDate) {
      setShowRequiredHint(true);
      return;
    }
    setShowRequiredHint(false);

    // Idempotency guard — if already created, skip to step 3
    if (newOrderId) {
      setStep(3);
      return;
    }

    setIsCreating(true);
    setCreateError(null);
    try {
      const payload: Record<string, unknown> = {
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id),
        ordered_items: orderedItems,
        total_amount: parseFloat(totalAmount),
        order_date: orderDate,
        order_status: 'neu',
      };
      if (desiredDeliveryTime) payload.desired_delivery_time = desiredDeliveryTime;
      if (paymentMethodKey && paymentMethodKey !== 'none') payload.payment_method = paymentMethodKey;
      if (deliveryStreet) payload.delivery_street = deliveryStreet;
      if (deliveryHouseNumber) payload.delivery_house_number = deliveryHouseNumber;
      if (deliveryPostalCode) payload.delivery_postal_code = deliveryPostalCode;
      if (deliveryCity) payload.delivery_city = deliveryCity;

      const result = await LivingAppsService.createBestellverwaltungEntry(payload as Parameters<typeof LivingAppsService.createBestellverwaltungEntry>[0]);
      setNewOrderId(result.record_id);
      await fetchAll();
      setStep(3);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Fehler beim Anlegen der Bestellung');
    } finally {
      setIsCreating(false);
    }
  }, [selectedKunde, orderedItems, totalAmount, orderDate, desiredDeliveryTime, paymentMethodKey, deliveryStreet, deliveryHouseNumber, deliveryPostalCode, deliveryCity, newOrderId, fetchAll]);

  const handleAssignDriver = useCallback(async (fahrer: Fahrerverwaltung) => {
    if (!newOrderId) return;
    setIsAssigning(true);
    setAssignError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(newOrderId, {
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, fahrer.record_id),
      });
      const name = [fahrer.fields.driver_first_name, fahrer.fields.driver_last_name].filter(Boolean).join(' ');
      setSelectedFahrer(fahrer);
      setSummaryFahrerName(name || null);
      await fetchAll();
      setStep(4);
    } catch (err) {
      setAssignError(err instanceof Error ? err.message : 'Fehler beim Zuweisen des Fahrers');
    } finally {
      setIsAssigning(false);
    }
  }, [newOrderId, fetchAll]);

  const handleSkipDriver = useCallback(() => {
    setSummaryFahrerName(null);
    setSelectedFahrer(null);
    setStep(4);
  }, []);

  const handleReset = useCallback(() => {
    setSelectedKunde(null);
    setOrderedItems('');
    setTotalAmount('');
    setOrderDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setDesiredDeliveryTime('');
    setPaymentMethodKey('none');
    setDeliveryStreet('');
    setDeliveryHouseNumber('');
    setDeliveryPostalCode('');
    setDeliveryCity('');
    setIsCreating(false);
    setCreateError(null);
    setNewOrderId(null);
    setShowRequiredHint(false);
    setSelectedFahrer(null);
    setIsAssigning(false);
    setAssignError(null);
    setSummaryFahrerName(null);
    setStep(1);
  }, []);

  const kundeName = selectedKunde
    ? [selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')
    : '';

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
        { label: tt('step4') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Kunde wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={activeKunden.map(k => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.city, k.fields.phone].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleSelectKunde}
          emptyText={tt('noActiveCustomers')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* Step 2: Bestelldetails */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-6">
            {/* Kunde Info */}
            <div className="rounded-2xl border bg-secondary/30 p-4 flex items-center gap-3">
              <IconUser size={20} className="text-primary shrink-0" stroke={1.5} />
              <div className="min-w-0">
                <p className="font-medium truncate">{kundeName}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {[selectedKunde.fields.city, selectedKunde.fields.phone].filter(Boolean).join(' · ')}
                </p>
              </div>
              {selectedKunde.fields.customer_status && (
                <StatusBadge
                  statusKey={selectedKunde.fields.customer_status.key}
                  label={selectedKunde.fields.customer_status.label}
                  className="ml-auto shrink-0"
                />
              )}
            </div>

            {/* Bestellformular */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="ordered_items">
                  {tt('orderedItems')} <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="ordered_items"
                  value={orderedItems}
                  onChange={e => setOrderedItems(e.target.value)}
                  placeholder={tt('orderedItemsPlaceholder')}
                  rows={3}
                  className={showRequiredHint && !orderedItems.trim() ? 'border-destructive' : ''}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="total_amount">
                    {tt('totalAmount')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="total_amount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalAmount}
                    onChange={e => setTotalAmount(e.target.value)}
                    className={showRequiredHint && !totalAmount ? 'border-destructive' : ''}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="payment_method">{tt('paymentMethod')}</Label>
                  <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                    <SelectTrigger id="payment_method">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tt('paymentNone')}</SelectItem>
                      {PAYMENT_OPTIONS.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="order_date">
                    {tt('orderDate')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="order_date"
                    type="datetime-local"
                    value={orderDate}
                    onChange={e => setOrderDate(e.target.value)}
                    className={showRequiredHint && !orderDate ? 'border-destructive' : ''}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="desired_delivery_time">{tt('desiredDelivery')}</Label>
                  <Input
                    id="desired_delivery_time"
                    type="datetime-local"
                    value={desiredDeliveryTime}
                    onChange={e => setDesiredDeliveryTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Lieferadresse */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <IconTruck size={16} className="text-muted-foreground" stroke={1.5} />
                  <span className="text-sm font-medium">{tt('deliveryAddress')}</span>
                </div>
                {(selectedKunde.fields.street || selectedKunde.fields.city) && (
                  <p className="text-xs text-muted-foreground">{tt('addressPrefilled')}</p>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor="delivery_street" className="text-xs">{tt('deliveryStreet')}</Label>
                    <Input
                      id="delivery_street"
                      value={deliveryStreet}
                      onChange={e => setDeliveryStreet(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="delivery_house_number" className="text-xs">{tt('deliveryHouseNumber')}</Label>
                    <Input
                      id="delivery_house_number"
                      value={deliveryHouseNumber}
                      onChange={e => setDeliveryHouseNumber(e.target.value)}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="delivery_postal_code" className="text-xs">{tt('deliveryPostalCode')}</Label>
                    <Input
                      id="delivery_postal_code"
                      value={deliveryPostalCode}
                      onChange={e => setDeliveryPostalCode(e.target.value)}
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor="delivery_city" className="text-xs">{tt('deliveryCity')}</Label>
                    <Input
                      id="delivery_city"
                      value={deliveryCity}
                      onChange={e => setDeliveryCity(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Fehlermeldungen */}
            {showRequiredHint && (
              <p className="text-sm text-destructive">{tt('fillRequired')}</p>
            )}
            {createError && (
              <p className="text-sm text-destructive">{createError}</p>
            )}

            {/* Navigation */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="sm:w-auto">
                {tt('backToCustomer')}
              </Button>
              <Button
                onClick={handleCreateOrder}
                disabled={isCreating}
                className="sm:flex-1"
              >
                <IconShoppingCart size={16} stroke={1.5} className="mr-2" />
                {isCreating ? tt('creating') : tt('createOrder')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step2Restart')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3: Fahrer zuweisen */}
      {step === 3 && (
        newOrderId ? (
          <div className="space-y-6">
            <EntitySelectStep
              items={availableFahrer.map(f => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || f.record_id,
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone ? `${tt('zone')}: ${f.fields.delivery_zone}` : null,
                  f.fields.driver_phone ? `${tt('phone')}: ${f.fields.driver_phone}` : null,
                ].filter(Boolean).join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconTruck size={20} className="text-primary" stroke={1.5} />,
              }))}
              onSelect={(id) => {
                const fahrer = fahrerverwaltung.find(f => f.record_id === id);
                if (fahrer) void handleAssignDriver(fahrer);
              }}
              emptyText={tt('noAvailableDrivers')}
              emptyIcon={<IconTruck size={32} className="text-muted-foreground" stroke={1.5} />}
            />

            {assignError && (
              <p className="text-sm text-destructive">{assignError}</p>
            )}

            {isAssigning && (
              <p className="text-sm text-muted-foreground">{tt('assigning')}</p>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={() => setStep(2)} className="sm:w-auto">
                {tt('backToDetails')}
              </Button>
              <Button
                variant="outline"
                onClick={handleSkipDriver}
                disabled={isAssigning}
                className="sm:flex-1"
              >
                {tt('skipDriver')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step3Restart')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 4: Zusammenfassung */}
      {step === 4 && (
        newOrderId ? (
          <div className="space-y-6">
            {/* Erfolg-Banner */}
            <div className="rounded-2xl border bg-primary/5 p-6 text-center space-y-3">
              <IconCircleCheck size={48} className="text-primary mx-auto" stroke={1.5} />
              <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
            </div>

            {/* Zusammenfassung */}
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="divide-y">
                <div className="flex items-start gap-3 p-4">
                  <IconUser size={16} className="text-muted-foreground mt-0.5 shrink-0" stroke={1.5} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('summaryCustomer')}</p>
                    <p className="font-medium truncate">{kundeName}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4">
                  <IconShoppingCart size={16} className="text-muted-foreground mt-0.5 shrink-0" stroke={1.5} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('summaryItems')}</p>
                    <p className="text-sm whitespace-pre-wrap break-words">{orderedItems}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4">
                  <IconCheck size={16} className="text-muted-foreground mt-0.5 shrink-0" stroke={1.5} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('summaryAmount')}</p>
                    <p className="font-medium">
                      {parseFloat(totalAmount || '0').toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-4">
                  <IconTruck size={16} className="text-muted-foreground mt-0.5 shrink-0" stroke={1.5} />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('summaryDriver')}</p>
                    <p className="font-medium truncate">
                      {summaryFahrerName ?? tt('noDriverAssigned')}
                    </p>
                    {selectedFahrer?.fields.vehicle_type && (
                      <p className="text-sm text-muted-foreground">{selectedFahrer.fields.vehicle_type.label}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Aktionen */}
            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleReset} className="sm:flex-1">
                <IconShoppingCart size={16} stroke={1.5} className="mr-2" />
                {tt('newOrder')}
              </Button>
              <Button variant="outline" asChild className="sm:flex-1">
                <a href="#/">{tt('backToDashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('step3Restart')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
