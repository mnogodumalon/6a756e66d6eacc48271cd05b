/**
 * Bestellung aufgeben — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen (nur aktive Kunden) → 2) Bestelldetails erfassen →
 *        3) Fahrer zuweisen (nur verfügbare Fahrer) & Bestellung anlegen.
 * Reads: kundenverwaltung, fahrerverwaltung. Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kundenverwaltung, Fahrerverwaltung } from '@/types/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconUser, IconTruck, IconCheck, IconCurrencyEuro, IconMapPin, IconCalendar, IconClipboard } from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Bestellung aufgeben', /* i18n-exempt */
    subtitle: 'Schritt für Schritt zur neuen Bestellung',
    step1: 'Kunde',
    step2: 'Details',
    step3: 'Fahrer',
    step4: 'Fertig',
    searchKunde: 'Kunden suchen …',
    noKunde: 'Keine aktiven Kunden gefunden',
    newKunde: 'Neuen Kunden anlegen',
    newKundeFirstName: 'Vorname',
    newKundeLastName: 'Nachname',
    newKundeEmail: 'E-Mail',
    newKundePhone: 'Telefon',
    newKundeCity: 'Stadt',
    create: 'Anlegen',
    next: 'Weiter',
    back: 'Zurück',
    orderedItems: 'Bestellte Artikel',
    orderedItemsPlaceholder: 'z. B. 2x Pizza Margherita, 1x Cola',
    totalAmount: 'Gesamtbetrag (€)',
    orderDate: 'Bestelldatum & -zeit',
    desiredDelivery: 'Gewünschte Lieferzeit',
    paymentMethod: 'Zahlungsart',
    paymentNone: 'Keine Angabe',
    deliveryAddress: 'Lieferadresse',
    deliveryStreet: 'Straße',
    deliveryHouseNumber: 'Hausnummer',
    deliveryPostalCode: 'PLZ',
    deliveryCity: 'Stadt',
    deliveryNotes: 'Lieferhinweise',
    deliveryNotesPlaceholder: 'z. B. 2. OG, klingeln bei Müller',
    nextToDriver: 'Weiter zum Fahrer',
    searchDriver: 'Fahrer suchen …',
    noDriver: 'Keine verfügbaren Fahrer',
    orderSummary: 'Bestellübersicht',
    selectedCustomer: 'Kunde',
    selectedDriver: 'Fahrer',
    orderTotal: 'Gesamtbetrag',
    confirmOrder: 'Bestellung aufgeben',
    successTitle: 'Bestellung erfolgreich aufgegeben!',
    successMsg: 'Die Bestellung wurde angelegt und dem Fahrer zugewiesen.',
    newOrder: 'Neue Bestellung aufgeben',
    backToDash: 'Zurück zum Dashboard',
    requiredFields: 'Bitte fülle alle Pflichtfelder aus.',
    submitting: 'Wird gespeichert …',
    zone: 'Zone',
    vehicle: 'Fahrzeug',
    noKundeSelected: 'Bitte wähle zuerst einen Kunden aus.',
    restart: 'Neu starten',
    noDetailsEntered: 'Bitte erfasse zuerst die Bestelldetails.',
  },
  en: {
    title: 'Place Order', /* i18n-exempt */
    subtitle: 'Step by step to a new order',
    step1: 'Customer',
    step2: 'Details',
    step3: 'Driver',
    step4: 'Done',
    searchKunde: 'Search customers …',
    noKunde: 'No active customers found',
    newKunde: 'Add new customer',
    newKundeFirstName: 'First name',
    newKundeLastName: 'Last name',
    newKundeEmail: 'Email',
    newKundePhone: 'Phone',
    newKundeCity: 'City',
    create: 'Create',
    next: 'Next',
    back: 'Back',
    orderedItems: 'Ordered items',
    orderedItemsPlaceholder: 'e.g. 2x Margherita pizza, 1x Cola',
    totalAmount: 'Total amount (€)',
    orderDate: 'Order date & time',
    desiredDelivery: 'Desired delivery time',
    paymentMethod: 'Payment method',
    paymentNone: 'Not specified',
    deliveryAddress: 'Delivery address',
    deliveryStreet: 'Street',
    deliveryHouseNumber: 'House number',
    deliveryPostalCode: 'Postal code',
    deliveryCity: 'City',
    deliveryNotes: 'Delivery notes',
    deliveryNotesPlaceholder: 'e.g. 2nd floor, ring at Müller',
    nextToDriver: 'Continue to driver',
    searchDriver: 'Search drivers …',
    noDriver: 'No available drivers',
    orderSummary: 'Order summary',
    selectedCustomer: 'Customer',
    selectedDriver: 'Driver',
    orderTotal: 'Total',
    confirmOrder: 'Place order',
    successTitle: 'Order placed successfully!',
    successMsg: 'The order has been created and assigned to the driver.',
    newOrder: 'Place new order',
    backToDash: 'Back to dashboard',
    requiredFields: 'Please fill in all required fields.',
    submitting: 'Saving …',
    zone: 'Zone',
    vehicle: 'Vehicle',
    noKundeSelected: 'Please select a customer first.',
    restart: 'Restart',
    noDetailsEntered: 'Please fill in order details first.',
  },
});

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function BestellungAufgebenPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  // Step state
  const [step, setStep] = useState(1);

  // Step 1 — Kunde
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newKundeFirstName, setNewKundeFirstName] = useState('');
  const [newKundeLastName, setNewKundeLastName] = useState('');
  const [newKundeEmail, setNewKundeEmail] = useState('');
  const [newKundePhone, setNewKundePhone] = useState('');
  const [newKundeCity, setNewKundeCity] = useState('');
  const [creatingKunde, setCreatingKunde] = useState(false);

  // Step 2 — Bestelldetails
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [orderDate, setOrderDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState('none');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Step 3 — Fahrer + submit
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Derived data
  const aktiveKunden = (kundenverwaltung as Kundenverwaltung[]).filter(
    k => k.fields.customer_status?.key === 'aktiv'
  );

  const verfuegbareFahrer = (fahrerverwaltung as Fahrerverwaltung[]).filter(
    f => f.fields.driver_status?.key === 'verfuegbar'
  );

  const selectedKunde = aktiveKunden.find(k => k.record_id === selectedKundeId) ?? null;
  const selectedFahrer = verfuegbareFahrer.find(f => f.record_id === selectedFahrerId) ?? null;

  const handleCreateKunde = async () => {
    if (!newKundeFirstName || !newKundeLastName) return;
    setCreatingKunde(true);
    try {
      const created = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newKundeFirstName,
        last_name: newKundeLastName,
        email: newKundeEmail || undefined,
        phone: newKundePhone || undefined,
        city: newKundeCity || undefined,
        customer_status: 'aktiv',
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNewKundeFirstName('');
      setNewKundeLastName('');
      setNewKundeEmail('');
      setNewKundePhone('');
      setNewKundeCity('');
      setSelectedKundeId(created.record_id);
      setStep(2);
    } finally {
      setCreatingKunde(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (!selectedKundeId || !selectedFahrerId) return;
    if (!orderedItems || !totalAmount || !orderDate) {
      setSubmitError(tt('requiredFields'));
      return;
    }

    // Idempotency guard — do not re-create if already done
    if (createdOrderId) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await LivingAppsService.createBestellverwaltungEntry({
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId),
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId),
        order_status: 'neu',
        ordered_items: orderedItems,
        total_amount: parseFloat(totalAmount),
        order_date: orderDate,
        desired_delivery_time: desiredDeliveryTime || undefined,
        payment_method: paymentMethodKey !== 'none' ? paymentMethodKey : undefined,
        delivery_street: deliveryStreet || undefined,
        delivery_house_number: deliveryHouseNumber || undefined,
        delivery_postal_code: deliveryPostalCode || undefined,
        delivery_city: deliveryCity || undefined,
        delivery_notes: deliveryNotes || undefined,
      });
      setCreatedOrderId(created.record_id);
      setStep(4);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKundeId(null);
    setShowCreateKunde(false);
    setOrderedItems('');
    setTotalAmount('');
    setOrderDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setDesiredDeliveryTime('');
    setPaymentMethodKey('none');
    setDeliveryStreet('');
    setDeliveryHouseNumber('');
    setDeliveryPostalCode('');
    setDeliveryCity('');
    setDeliveryNotes('');
    setSelectedFahrerId(null);
    setSubmitError(null);
    setCreatedOrderId(null);
  };

  const step2Valid = orderedItems.trim() && totalAmount && orderDate;

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
      {/* Step 1 — Kunde auswählen */}
      {step === 1 && (
        <EntitySelectStep
          items={aktiveKunden.map(k => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.city].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            stats: [
              ...(k.fields.phone ? [{ label: 'Tel.', value: k.fields.phone }] : []), /* i18n-exempt */
            ],
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={id => { setSelectedKundeId(id); setStep(2); }}
          searchPlaceholder={tt('searchKunde')}
          emptyText={tt('noKunde')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
          createLabel={tt('newKunde')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={showCreateKunde ? (
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">{tt('newKunde')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  value={newKundeFirstName}
                  onChange={e => setNewKundeFirstName(e.target.value)}
                  placeholder={tt('newKundeFirstName')}
                />
                <Input
                  value={newKundeLastName}
                  onChange={e => setNewKundeLastName(e.target.value)}
                  placeholder={tt('newKundeLastName')}
                />
                <Input
                  value={newKundeEmail}
                  onChange={e => setNewKundeEmail(e.target.value)}
                  placeholder={tt('newKundeEmail')}
                  type="email"
                />
                <Input
                  value={newKundePhone}
                  onChange={e => setNewKundePhone(e.target.value)}
                  placeholder={tt('newKundePhone')}
                  type="tel"
                />
                <Input
                  value={newKundeCity}
                  onChange={e => setNewKundeCity(e.target.value)}
                  placeholder={tt('newKundeCity')}
                  className="sm:col-span-2"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleCreateKunde}
                  disabled={!newKundeFirstName || !newKundeLastName || creatingKunde}
                  className="flex-1"
                >
                  {tt('create')}
                </Button>
                <Button variant="outline" onClick={() => setShowCreateKunde(false)}>
                  {tt('back')}
                </Button>
              </div>
            </div>
          ) : undefined}
        />
      )}

      {/* Step 2 — Bestelldetails erfassen */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-6">
            {/* Context: selected customer */}
            {selectedKunde && (
              <div className="flex items-center gap-3 rounded-2xl border bg-secondary/40 p-3">
                <IconUser size={18} className="text-primary shrink-0" />
                <span className="text-sm font-medium truncate min-w-0">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </span>
                {selectedKunde.fields.customer_status && (
                  <StatusBadge
                    statusKey={selectedKunde.fields.customer_status.key}
                    label={selectedKunde.fields.customer_status.label}
                    className="ml-auto shrink-0"
                  />
                )}
              </div>
            )}

            {/* Order items */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-1">
                <IconClipboard size={16} className="text-muted-foreground" />
                {tt('orderedItems')} *
              </label>
              <Textarea
                value={orderedItems}
                onChange={e => setOrderedItems(e.target.value)}
                placeholder={tt('orderedItemsPlaceholder')}
                rows={3}
              />
            </div>

            {/* Total amount */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-1">
                <IconCurrencyEuro size={16} className="text-muted-foreground" />
                {tt('totalAmount')} *
              </label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={totalAmount}
                onChange={e => setTotalAmount(e.target.value)}
                placeholder="0.00"
              />
              {totalAmount && !isNaN(parseFloat(totalAmount)) && (
                <p className="text-xs text-muted-foreground">
                  {parseFloat(totalAmount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </p>
              )}
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-1">
                  <IconCalendar size={16} className="text-muted-foreground" />
                  {tt('orderDate')} *
                </label>
                <Input
                  type="datetime-local"
                  value={orderDate}
                  onChange={e => setOrderDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-1">
                  <IconCalendar size={16} className="text-muted-foreground" />
                  {tt('desiredDelivery')}
                </label>
                <Input
                  type="datetime-local"
                  value={desiredDeliveryTime}
                  onChange={e => setDesiredDeliveryTime(e.target.value)}
                />
              </div>
            </div>

            {/* Payment method */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{tt('paymentMethod')}</label>
              <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                <SelectTrigger className="w-full">
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

            {/* Delivery address */}
            <div className="space-y-3">
              <label className="text-sm font-medium text-foreground flex items-center gap-1">
                <IconMapPin size={16} className="text-muted-foreground" />
                {tt('deliveryAddress')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  value={deliveryStreet}
                  onChange={e => setDeliveryStreet(e.target.value)}
                  placeholder={tt('deliveryStreet')}
                  className="sm:col-span-2"
                />
                <Input
                  value={deliveryHouseNumber}
                  onChange={e => setDeliveryHouseNumber(e.target.value)}
                  placeholder={tt('deliveryHouseNumber')}
                />
                <Input
                  value={deliveryPostalCode}
                  onChange={e => setDeliveryPostalCode(e.target.value)}
                  placeholder={tt('deliveryPostalCode')}
                />
                <Input
                  value={deliveryCity}
                  onChange={e => setDeliveryCity(e.target.value)}
                  placeholder={tt('deliveryCity')}
                  className="sm:col-span-2"
                />
              </div>
            </div>

            {/* Delivery notes */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">{tt('deliveryNotes')}</label>
              <Textarea
                value={deliveryNotes}
                onChange={e => setDeliveryNotes(e.target.value)}
                placeholder={tt('deliveryNotesPlaceholder')}
                rows={2}
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} className="shrink-0">
                {tt('back')}
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!step2Valid}
                className="flex-1"
              >
                {tt('nextToDriver')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noKundeSelected')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3 — Fahrer zuweisen & bestätigen */}
      {step === 3 && (
        selectedKundeId && orderedItems ? (
          <div className="space-y-6">
            {/* Live order summary */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tt('orderSummary')}</p>
              <div className="flex items-center gap-2 text-sm">
                <IconUser size={16} className="text-primary shrink-0" />
                <span className="font-medium min-w-0 truncate">
                  {selectedKunde
                    ? [selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')
                    : selectedKundeId}
                </span>
              </div>
              {totalAmount && (
                <div className="flex items-center gap-2 text-sm">
                  <IconCurrencyEuro size={16} className="text-primary shrink-0" />
                  <span className="font-semibold">
                    {parseFloat(totalAmount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>
              )}
            </div>

            {/* Driver selection */}
            <EntitySelectStep
              items={verfuegbareFahrer.map(f => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || f.record_id,
                subtitle: [
                  f.fields.delivery_zone ? `${tt('zone')}: ${f.fields.delivery_zone}` : null,
                  f.fields.vehicle_type?.label ? `${tt('vehicle')}: ${f.fields.vehicle_type.label}` : null,
                ].filter(Boolean).join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconTruck size={20} className="text-primary" />,
              }))}
              onSelect={id => setSelectedFahrerId(id)}
              searchPlaceholder={tt('searchDriver')}
              emptyText={tt('noDriver')}
              emptyIcon={<IconTruck size={32} className="text-muted-foreground" />}
            />

            {/* Selected driver display + confirm */}
            {selectedFahrerId && selectedFahrer && (
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <div className="flex items-center gap-3">
                  <IconTruck size={18} className="text-primary shrink-0" />
                  <span className="text-sm font-medium min-w-0 truncate">
                    {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name].filter(Boolean).join(' ')}
                  </span>
                  {selectedFahrer.fields.driver_status && (
                    <StatusBadge
                      statusKey={selectedFahrer.fields.driver_status.key}
                      label={selectedFahrer.fields.driver_status.label}
                      className="ml-auto shrink-0"
                    />
                  )}
                </div>
              </div>
            )}

            {submitError && (
              <p className="text-sm text-destructive rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)} className="shrink-0">
                {tt('back')}
              </Button>
              <Button
                onClick={handleSubmitOrder}
                disabled={!selectedFahrerId || submitting}
                className="flex-1"
              >
                {submitting ? tt('submitting') : tt('confirmOrder')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noDetailsEntered')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 4 — Erfolg */}
      {step === 4 && (
        <div className="text-center py-12 space-y-4">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <IconCheck size={32} className="text-primary" stroke={2} />
          </div>
          <h2 className="text-lg font-semibold text-foreground">{tt('successTitle')}</h2>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto">{tt('successMsg')}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button onClick={handleReset} variant="outline">
              {tt('newOrder')}
            </Button>
            <a href="#/">
              <Button className="w-full sm:w-auto">{tt('backToDash')}</Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
