/**
 * Neue Bestellung — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen oder neu anlegen → 2) Bestelldetails eingeben → 3) Fahrer zuweisen & Bestellung anlegen.
 * Reads: kundenverwaltung, fahrerverwaltung. Writes: bestellverwaltung (createBestellverwaltungEntry),
 *   fahrerverwaltung (updateFahrerverwaltungEntry if driver assigned).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import type { Kundenverwaltung, Fahrerverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  IconUser,
  IconTruckDelivery,
  IconCheck,
  IconCurrencyEuro,
  IconBike,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Neue Bestellung', /* i18n-exempt */
    subtitle: 'Kunde · Bestelldetails · Fahrer — in einem Ablauf',
    step1: 'Kunde',
    step2: 'Bestelldetails',
    step3: 'Fahrer',
    step4: 'Fertig',

    // Schritt 1
    selectCustomer: 'Kunden auswählen',
    createCustomer: 'Neuen Kunden anlegen',
    firstName: 'Vorname',
    lastName: 'Nachname',
    email: 'E-Mail',
    phone: 'Telefon',
    street: 'Straße',
    houseNumber: 'Hausnummer',
    postalCode: 'PLZ',
    city: 'Stadt',
    createCustomerBtn: 'Kunde anlegen',
    customerCreating: 'Wird angelegt…',
    requiredHint: '* Pflichtfelder',
    step1Next: 'Weiter zu Schritt 2',

    // Schritt 2
    orderDate: 'Bestelldatum & Uhrzeit',
    orderedItems: 'Bestellte Artikel',
    totalAmount: 'Gesamtbetrag (€)',
    paymentMethod: 'Zahlungsmethode',
    paymentMethodNone: 'Keine Angabe',
    desiredDeliveryTime: 'Gewünschter Lieferzeitpunkt',
    deliveryAddress: 'Lieferadresse',
    deliveryStreet: 'Straße',
    deliveryHouseNumber: 'Hausnummer',
    deliveryPostalCode: 'PLZ',
    deliveryCity: 'Stadt',
    deliveryNotes: 'Lieferhinweise',
    step2Back: 'Zurück',
    step2Next: 'Weiter zu Schritt 3',
    orderSummary: 'Bestellsumme',
    missingRequired: 'Bitte Pflichtfelder ausfüllen.',

    // Schritt 3
    assignDriver: 'Fahrer zuweisen (optional)',
    noDriver: 'Ohne Fahrer fortfahren',
    driverZone: 'Liefergebiet',
    driverVehicle: 'Fahrzeug',
    createOrderBtn: 'Bestellung anlegen',
    creating: 'Wird angelegt…',
    skipDriverBtn: 'Ohne Fahrer anlegen',
    step3Back: 'Zurück',
    noAvailableDrivers: 'Keine verfügbaren Fahrer',
    noAvailableDriversHint: 'Aktuell kein Fahrer mit Status "Verfügbar" gefunden.',
    placeholderPLZ: 'PLZ',
    placeholderHouseNr: 'Nr.',
    placeholderItems: 'z.B. 2x Pizza Margherita, 1x Cola',
    placeholderDeliveryNotes: 'z.B. Bitte klingeln, 2. OG links',
    fallbackStep1: 'Dieser Schritt braucht die Auswahl aus Schritt 1.',
    restartBtn: 'Neu starten',

    // Schritt 4 Erfolg
    successTitle: 'Bestellung angelegt!',
    successSubtitle: 'Die Bestellung wurde erfolgreich erfasst.',
    summaryCustomer: 'Kunde',
    summaryItems: 'Artikel',
    summaryAmount: 'Betrag',
    summaryDriver: 'Fahrer',
    summaryNoDriver: 'Kein Fahrer zugewiesen',
    newOrder: 'Neue Bestellung anlegen',
    toDashboard: 'Zurück zum Dashboard',
    errorCreate: 'Fehler beim Anlegen der Bestellung.',
  },
  en: {
    title: 'New Order', /* i18n-exempt */
    subtitle: 'Customer · Order details · Driver — in one flow',
    step1: 'Customer',
    step2: 'Order details',
    step3: 'Driver',
    step4: 'Done',

    selectCustomer: 'Select customer',
    createCustomer: 'Create new customer',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    street: 'Street',
    houseNumber: 'House no.',
    postalCode: 'Postal code',
    city: 'City',
    createCustomerBtn: 'Create customer',
    customerCreating: 'Creating…',
    requiredHint: '* Required fields',
    step1Next: 'Continue to step 2',

    orderDate: 'Order date & time',
    orderedItems: 'Ordered items',
    totalAmount: 'Total amount (€)',
    paymentMethod: 'Payment method',
    paymentMethodNone: 'Not specified',
    desiredDeliveryTime: 'Requested delivery time',
    deliveryAddress: 'Delivery address',
    deliveryStreet: 'Street',
    deliveryHouseNumber: 'House no.',
    deliveryPostalCode: 'Postal code',
    deliveryCity: 'City',
    deliveryNotes: 'Delivery notes',
    step2Back: 'Back',
    step2Next: 'Continue to step 3',
    orderSummary: 'Order total',
    missingRequired: 'Please fill in required fields.',

    assignDriver: 'Assign driver (optional)',
    noDriver: 'Continue without driver',
    driverZone: 'Delivery zone',
    driverVehicle: 'Vehicle',
    createOrderBtn: 'Create order',
    creating: 'Creating…',
    skipDriverBtn: 'Create without driver',
    step3Back: 'Back',
    noAvailableDrivers: 'No available drivers',
    noAvailableDriversHint: 'No driver with status "Available" found.',
    placeholderPLZ: 'Postcode',
    placeholderHouseNr: 'No.',
    placeholderItems: 'e.g. 2x Margherita pizza, 1x Coke',
    placeholderDeliveryNotes: 'e.g. Please ring bell, 2nd floor left',
    fallbackStep1: 'This step requires a selection from step 1.',
    restartBtn: 'Restart',

    successTitle: 'Order created!',
    successSubtitle: 'The order has been successfully recorded.',
    summaryCustomer: 'Customer',
    summaryItems: 'Items',
    summaryAmount: 'Amount',
    summaryDriver: 'Driver',
    summaryNoDriver: 'No driver assigned',
    newOrder: 'Create new order',
    toDashboard: 'Back to Dashboard',
    errorCreate: 'Error creating order.',
  },
  cs: {
    title: 'Nová objednávka', /* i18n-exempt */
    subtitle: 'Zákazník · Detaily objednávky · Řidič — v jednom postupu',
    step1: 'Zákazník',
    step2: 'Detaily',
    step3: 'Řidič',
    step4: 'Hotovo',

    selectCustomer: 'Vybrat zákazníka',
    createCustomer: 'Vytvořit nového zákazníka',
    firstName: 'Jméno',
    lastName: 'Příjmení',
    email: 'E-mail',
    phone: 'Telefon',
    street: 'Ulice',
    houseNumber: 'Číslo popisné',
    postalCode: 'PSČ',
    city: 'Město',
    createCustomerBtn: 'Vytvořit zákazníka',
    customerCreating: 'Vytváří se…',
    requiredHint: '* Povinná pole',
    step1Next: 'Pokračovat ke kroku 2',

    orderDate: 'Datum a čas objednávky',
    orderedItems: 'Objednané položky',
    totalAmount: 'Celková částka (€)',
    paymentMethod: 'Způsob platby',
    paymentMethodNone: 'Nezadáno',
    desiredDeliveryTime: 'Požadovaný čas doručení',
    deliveryAddress: 'Adresa doručení',
    deliveryStreet: 'Ulice',
    deliveryHouseNumber: 'Číslo popisné',
    deliveryPostalCode: 'PSČ',
    deliveryCity: 'Město',
    deliveryNotes: 'Pokyny k doručení',
    step2Back: 'Zpět',
    step2Next: 'Pokračovat ke kroku 3',
    orderSummary: 'Celkem',
    missingRequired: 'Prosím vyplňte povinná pole.',

    assignDriver: 'Přiřadit řidiče (volitelné)',
    noDriver: 'Pokračovat bez řidiče',
    driverZone: 'Oblast doručení',
    driverVehicle: 'Vozidlo',
    createOrderBtn: 'Vytvořit objednávku',
    creating: 'Vytváří se…',
    skipDriverBtn: 'Vytvořit bez řidiče',
    step3Back: 'Zpět',
    noAvailableDrivers: 'Žádní dostupní řidiči',
    noAvailableDriversHint: 'Nebyl nalezen žádný řidič se stavem „Dostupný".',
    placeholderPLZ: 'PSČ',
    placeholderHouseNr: 'č.',
    placeholderItems: 'např. 2x Pizza Margherita, 1x Cola',
    placeholderDeliveryNotes: 'např. Prosím zazvonit, 2. patro vlevo',
    fallbackStep1: 'Tento krok vyžaduje výběr z kroku 1.',
    restartBtn: 'Restartovat',

    successTitle: 'Objednávka vytvořena!',
    successSubtitle: 'Objednávka byla úspěšně zaznamenána.',
    summaryCustomer: 'Zákazník',
    summaryItems: 'Položky',
    summaryAmount: 'Částka',
    summaryDriver: 'Řidič',
    summaryNoDriver: 'Žádný řidič nepřiřazen',
    newOrder: 'Vytvořit novou objednávku',
    toDashboard: 'Zpět na dashboard',
    errorCreate: 'Chyba při vytváření objednávky.',
  },
});

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function NeueBestellungPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  // Wizard state
  const [step, setStep] = useState(1);

  // Step 1 — Kunde
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newStreet, setNewStreet] = useState('');
  const [newHouseNumber, setNewHouseNumber] = useState('');
  const [newPostalCode, setNewPostalCode] = useState('');
  const [newCity, setNewCity] = useState('');
  const [creatingKunde, setCreatingKunde] = useState(false);

  // Step 2 — Bestelldetails
  const [orderDate, setOrderDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState('none');
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [step2Error, setStep2Error] = useState('');

  // Step 3 — Fahrer + submit
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Derived: available drivers only
  const availableDrivers: Fahrerverwaltung[] = fahrerverwaltung.filter(
    (f) => f.fields.driver_status?.key === 'verfuegbar'
  );

  // Selected Kunde record
  const selectedKunde: Kundenverwaltung | undefined = selectedKundeId
    ? kundenverwaltung.find((k) => k.record_id === selectedKundeId)
    : undefined;

  // Selected driver record
  const selectedFahrer: Fahrerverwaltung | undefined = selectedFahrerId
    ? fahrerverwaltung.find((f) => f.record_id === selectedFahrerId)
    : undefined;

  // ── Step 1 handlers ────────────────────────────────────────────────
  const handleSelectKunde = (id: string) => {
    setSelectedKundeId(id);
    setStep(2);
  };

  const handleCreateKunde = async () => {
    if (!newFirstName.trim() || !newLastName.trim() || !newStreet.trim() || !newHouseNumber.trim() || !newPostalCode.trim() || !newCity.trim()) return;
    setCreatingKunde(true);
    try {
      const result = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newFirstName.trim(),
        last_name: newLastName.trim(),
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        street: newStreet.trim(),
        house_number: newHouseNumber.trim(),
        postal_code: newPostalCode.trim(),
        city: newCity.trim(),
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNewFirstName('');
      setNewLastName('');
      setNewEmail('');
      setNewPhone('');
      setNewStreet('');
      setNewHouseNumber('');
      setNewPostalCode('');
      setNewCity('');
      setSelectedKundeId(result.record_id);
      setStep(2);
    } finally {
      setCreatingKunde(false);
    }
  };

  // ── Step 2 handler ─────────────────────────────────────────────────
  const handleStep2Next = () => {
    if (!orderDate || !orderedItems.trim()) {
      setStep2Error(tt('missingRequired'));
      return;
    }
    setStep2Error('');
    setStep(3);
  };

  // ── Step 3: submit ─────────────────────────────────────────────────
  const handleSubmit = async (driverId: string | null) => {
    if (!selectedKundeId) return;
    // idempotency: only create once
    if (createdOrderId) return;

    setSubmitting(true);
    setSubmitError('');
    try {
      const kundeUrl = createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId);
      const fahrerUrl = driverId ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, driverId) : undefined;

      const order = await LivingAppsService.createBestellverwaltungEntry({
        kunde: kundeUrl,
        fahrer: fahrerUrl,
        order_date: orderDate,
        ordered_items: orderedItems.trim(),
        total_amount: totalAmount ? parseFloat(totalAmount) : undefined,
        order_status: 'neu',
        payment_method: paymentMethodKey !== 'none' ? paymentMethodKey : undefined,
        desired_delivery_time: desiredDeliveryTime || undefined,
        delivery_street: deliveryStreet.trim() || undefined,
        delivery_house_number: deliveryHouseNumber.trim() || undefined,
        delivery_postal_code: deliveryPostalCode.trim() || undefined,
        delivery_city: deliveryCity.trim() || undefined,
        delivery_notes: deliveryNotes.trim() || undefined,
      });

      if (driverId) {
        await LivingAppsService.updateFahrerverwaltungEntry(driverId, {
          driver_status: 'im_einsatz',
        });
      }

      setCreatedOrderId(order.record_id);
      await fetchAll();
      setSelectedFahrerId(driverId);
      setStep(4);
    } catch {
      setSubmitError(tt('errorCreate'));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Reset ──────────────────────────────────────────────────────────
  const handleReset = () => {
    setStep(1);
    setSelectedKundeId(null);
    setShowCreateKunde(false);
    setOrderDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setOrderedItems('');
    setTotalAmount('');
    setPaymentMethodKey('none');
    setDesiredDeliveryTime('');
    setDeliveryStreet('');
    setDeliveryHouseNumber('');
    setDeliveryPostalCode('');
    setDeliveryCity('');
    setDeliveryNotes('');
    setStep2Error('');
    setSelectedFahrerId(null);
    setSubmitError('');
    setCreatedOrderId(null);
  };

  // ── Render ─────────────────────────────────────────────────────────
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
      {/* ── Schritt 1: Kunde ── */}
      {step === 1 && (
        <EntitySelectStep
          items={kundenverwaltung.map((k) => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.phone].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectKunde}
          createLabel={tt('createCustomer')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={
            showCreateKunde ? (
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">
                      {tt('firstName')} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={newFirstName}
                      onChange={(e) => setNewFirstName(e.target.value)}
                      placeholder={tt('firstName')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">
                      {tt('lastName')} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={newLastName}
                      onChange={(e) => setNewLastName(e.target.value)}
                      placeholder={tt('lastName')}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">{tt('email')}</Label>
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder={tt('email')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">{tt('phone')}</Label>
                    <Input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder={tt('phone')}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-sm font-medium">
                      {tt('street')} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={newStreet}
                      onChange={(e) => setNewStreet(e.target.value)}
                      placeholder={tt('street')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">
                      {tt('houseNumber')} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={newHouseNumber}
                      onChange={(e) => setNewHouseNumber(e.target.value)}
                      placeholder={tt('placeholderHouseNr')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">
                      {tt('postalCode')} <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      value={newPostalCode}
                      onChange={(e) => setNewPostalCode(e.target.value)}
                      placeholder={tt('placeholderPLZ')}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-sm font-medium">
                    {tt('city')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    value={newCity}
                    onChange={(e) => setNewCity(e.target.value)}
                    placeholder={tt('city')}
                  />
                </div>
                <p className="text-xs text-muted-foreground">{tt('requiredHint')}</p>
                <div className="flex gap-2">
                  <Button
                    disabled={
                      creatingKunde ||
                      !newFirstName.trim() ||
                      !newLastName.trim() ||
                      !newStreet.trim() ||
                      !newHouseNumber.trim() ||
                      !newPostalCode.trim() ||
                      !newCity.trim()
                    }
                    onClick={handleCreateKunde}
                    className="flex-1"
                  >
                    {creatingKunde ? tt('customerCreating') : tt('createCustomerBtn')}
                  </Button>
                  <Button variant="outline" onClick={() => setShowCreateKunde(false)}>
                    ✕
                  </Button>
                </div>
              </div>
            ) : null
          }
        />
      )}

      {/* ── Schritt 2: Bestelldetails ── */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-6">
            {/* Kundenzusammenfassung */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex items-center gap-3">
              <IconUser size={20} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {[selectedKunde?.fields.first_name, selectedKunde?.fields.last_name]
                    .filter(Boolean)
                    .join(' ')}
                </p>
                {selectedKunde?.fields.email && (
                  <p className="text-sm text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                )}
              </div>
            </div>

            <div className="space-y-4">
              {/* Bestelldatum */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">
                  {tt('orderDate')} <span className="text-destructive">*</span>
                </Label>
                <Input
                  type="datetime-local"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>

              {/* Bestellte Artikel */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">
                  {tt('orderedItems')} <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  value={orderedItems}
                  onChange={(e) => setOrderedItems(e.target.value)}
                  placeholder={tt('placeholderItems')}
                  rows={3}
                />
              </div>

              {/* Gesamtbetrag */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">{tt('totalAmount')}</Label>
                <div className="relative">
                  <IconCurrencyEuro
                    size={16}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    stroke={1.5}
                  />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    placeholder="0.00"
                    className="pl-8"
                  />
                </div>
              </div>

              {/* Live-Feedback Betrag */}
              {totalAmount && parseFloat(totalAmount) > 0 && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-center gap-2">
                  <IconCurrencyEuro size={16} className="text-primary" stroke={1.5} />
                  <span className="text-sm font-semibold text-primary">
                    {tt('orderSummary')}: {parseFloat(totalAmount).toFixed(2)} €
                  </span>
                </div>
              )}

              {/* Zahlungsmethode */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">{tt('paymentMethod')}</Label>
                <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tt('paymentMethodNone')}</SelectItem>
                    {PAYMENT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.key} value={opt.key}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Gewünschter Lieferzeitpunkt */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">{tt('desiredDeliveryTime')}</Label>
                <Input
                  type="datetime-local"
                  value={desiredDeliveryTime}
                  onChange={(e) => setDesiredDeliveryTime(e.target.value)}
                />
              </div>

              {/* Lieferadresse */}
              <div className="space-y-2">
                <p className="text-sm font-medium">{tt('deliveryAddress')}</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-muted-foreground">{tt('deliveryStreet')}</Label>
                    <Input
                      value={deliveryStreet}
                      onChange={(e) => setDeliveryStreet(e.target.value)}
                      placeholder={tt('deliveryStreet')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{tt('deliveryHouseNumber')}</Label>
                    <Input
                      value={deliveryHouseNumber}
                      onChange={(e) => setDeliveryHouseNumber(e.target.value)}
                      placeholder={tt('placeholderHouseNr')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{tt('deliveryPostalCode')}</Label>
                    <Input
                      value={deliveryPostalCode}
                      onChange={(e) => setDeliveryPostalCode(e.target.value)}
                      placeholder={tt('placeholderPLZ')}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tt('deliveryCity')}</Label>
                  <Input
                    value={deliveryCity}
                    onChange={(e) => setDeliveryCity(e.target.value)}
                    placeholder={tt('deliveryCity')}
                  />
                </div>
              </div>

              {/* Lieferhinweise */}
              <div className="space-y-1">
                <Label className="text-sm font-medium">{tt('deliveryNotes')}</Label>
                <Textarea
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder={tt('placeholderDeliveryNotes')}
                  rows={2}
                />
              </div>

              {step2Error && (
                <p className="text-sm text-destructive">{step2Error}</p>
              )}
            </div>

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('step2Back')}
              </Button>
              <Button onClick={handleStep2Next} className="flex-1">
                {tt('step2Next')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('fallbackStep1')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('restartBtn')}
            </Button>
          </div>
        )
      )}

      {/* ── Schritt 3: Fahrer ── */}
      {step === 3 && (
        selectedKundeId ? (
          <div className="space-y-4">
            {submitError && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3">
                <p className="text-sm text-destructive">{submitError}</p>
              </div>
            )}

            {availableDrivers.length === 0 ? (
              <div className="rounded-2xl border bg-secondary/40 p-6 text-center space-y-2">
                <IconBike size={32} className="mx-auto text-muted-foreground" stroke={1.5} />
                <p className="font-medium">{tt('noAvailableDrivers')}</p>
                <p className="text-sm text-muted-foreground">{tt('noAvailableDriversHint')}</p>
              </div>
            ) : (
              <EntitySelectStep
                items={availableDrivers.map((f) => ({
                  id: f.record_id,
                  title: [f.fields.driver_first_name, f.fields.driver_last_name]
                    .filter(Boolean)
                    .join(' ') || f.record_id,
                  subtitle: [
                    f.fields.delivery_zone ? `${tt('driverZone')}: ${f.fields.delivery_zone}` : null,
                    f.fields.vehicle_type ? `${tt('driverVehicle')}: ${f.fields.vehicle_type.label}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  status: f.fields.driver_status
                    ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                    : undefined,
                  icon: <IconTruckDelivery size={20} className="text-primary" />,
                }))}
                onSelect={(id) => {
                  setSelectedFahrerId(id);
                  handleSubmit(id);
                }}
              />
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                {tt('step3Back')}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSubmit(null)}
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? tt('creating') : tt('skipDriverBtn')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('fallbackStep1')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('restartBtn')}
            </Button>
          </div>
        )
      )}

      {/* ── Schritt 4: Erfolg ── */}
      {step === 4 && (
        createdOrderId ? (
          <div className="space-y-6">
            <div className="rounded-2xl border bg-card p-6 text-center space-y-2">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-primary/10 mx-auto">
                <IconCheck size={24} className="text-primary" stroke={2} />
              </div>
              <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
              <p className="text-sm text-muted-foreground">{tt('successSubtitle')}</p>
            </div>

            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-3">
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-24 shrink-0">{tt('summaryCustomer')}</span>
                <span className="text-sm font-medium min-w-0 truncate">
                  {[selectedKunde?.fields.first_name, selectedKunde?.fields.last_name]
                    .filter(Boolean)
                    .join(' ')}
                </span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-24 shrink-0">{tt('summaryItems')}</span>
                <span className="text-sm min-w-0 line-clamp-2">{orderedItems}</span>
              </div>
              {totalAmount && parseFloat(totalAmount) > 0 && (
                <div className="flex items-start gap-2">
                  <span className="text-xs text-muted-foreground w-24 shrink-0">{tt('summaryAmount')}</span>
                  <span className="text-sm font-semibold">{parseFloat(totalAmount).toFixed(2)} €</span>
                </div>
              )}
              <div className="flex items-start gap-2">
                <span className="text-xs text-muted-foreground w-24 shrink-0">{tt('summaryDriver')}</span>
                <span className="text-sm min-w-0">
                  {selectedFahrer
                    ? [selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name]
                        .filter(Boolean)
                        .join(' ')
                    : tt('summaryNoDriver')}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button onClick={handleReset} className="flex-1">
                {tt('newOrder')}
              </Button>
              <a href="#/" className="flex-1">
                <Button variant="outline" className="w-full">
                  {tt('toDashboard')}
                </Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('fallbackStep1')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('restartBtn')}
            </Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
