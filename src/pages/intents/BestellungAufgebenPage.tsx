/**
 * Bestellung aufgeben — 4-Schritt-Wizard.
 * Steps: 1) Kunde auswählen → 2) Bestellung erfassen → 3) Fahrer zuweisen (optional) → 4) Bestätigen & Erstellen.
 * Reads: kundenverwaltung (filter: customer_status=aktiv), fahrerverwaltung (filter: driver_status=verfuegbar).
 * Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
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
import { IconUser, IconTruck, IconPackage, IconCheck, IconMapPin, IconCurrencyEuro } from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Bestellung aufgeben', /* i18n-exempt */
    subtitle: 'Schritt-für-Schritt zur neuen Lieferbestellung',
    stepKunde: 'Kunde',
    stepBestellung: 'Bestellung',
    stepFahrer: 'Fahrer',
    stepBestaetigung: 'Bestätigung',
    kundeSearch: 'Kunden suchen…',
    kundeEmpty: 'Keine aktiven Kunden gefunden',
    kundeNew: 'Neuen Kunden anlegen',
    kundeNewFirstName: 'Vorname',
    kundeNewLastName: 'Nachname',
    kundeNewEmail: 'E-Mail',
    kundeNewPhone: 'Telefon',
    kundeNewCity: 'Stadt',
    kundeCreate: 'Anlegen',
    orderItems: 'Bestellte Artikel',
    orderItemsPlaceholder: 'z.B. 2x Pizza Margherita, 1x Cola',
    orderTotal: 'Gesamtbetrag (€)',
    orderDate: 'Bestelldatum & -uhrzeit',
    orderDeliveryTime: 'Gewünschte Lieferzeit',
    deliveryAddress: 'Lieferadresse',
    deliveryStreet: 'Straße',
    deliveryHouseNumber: 'Hausnummer',
    deliveryPostalCode: 'PLZ',
    deliveryCity: 'Stadt',
    paymentMethod: 'Zahlungsmethode',
    paymentMethodNone: 'Zahlungsmethode wählen',
    deliveryNotes: 'Lieferhinweise',
    deliveryNotesPlaceholder: 'z.B. Klingel defekt, bitte anrufen',
    nextToStep2: 'Weiter zu Schritt 2',
    nextToStep3: 'Weiter zu Schritt 3',
    nextToStep4: 'Weiter zur Bestätigung',
    fahrerzuweisung: 'Fahrer zuweisen',
    fahrerEmpty: 'Kein verfügbarer Fahrer gefunden',
    fahrerSearch: 'Fahrer suchen…',
    fahrerSkip: 'Ohne Fahrer fortfahren',
    confirmTitle: 'Bestellung bestätigen',
    confirmKunde: 'Kunde',
    confirmItems: 'Bestellte Artikel',
    confirmTotal: 'Gesamtbetrag',
    confirmDelivery: 'Lieferadresse',
    confirmDeliveryTime: 'Lieferzeit',
    confirmPayment: 'Zahlung',
    confirmFahrer: 'Fahrer',
    confirmNoFahrer: 'Kein Fahrer zugewiesen',
    confirmCreate: 'Bestellung anlegen',
    confirmLoading: 'Wird angelegt…',
    successTitle: 'Bestellung erfolgreich aufgegeben!',
    successId: 'Bestellungs-ID',
    successNew: 'Neue Bestellung aufgeben',
    successDashboard: 'Zurück zum Dashboard',
    missingKunde: 'Bitte erst einen Kunden auswählen.',
    missingItems: 'Bitte die bestellten Artikel angeben.',
    goToStep1: 'Zum ersten Schritt',
    backStep: 'Zurück',
    liveTotal: 'Gesamtbetrag',
    noDeliveryAddress: 'Keine Adresse',
  },
  en: {
    title: 'Place Order', /* i18n-exempt */
    subtitle: 'Step-by-step to a new delivery order',
    stepKunde: 'Customer',
    stepBestellung: 'Order',
    stepFahrer: 'Driver',
    stepBestaetigung: 'Confirmation',
    kundeSearch: 'Search customers…',
    kundeEmpty: 'No active customers found',
    kundeNew: 'Add new customer',
    kundeNewFirstName: 'First name',
    kundeNewLastName: 'Last name',
    kundeNewEmail: 'Email',
    kundeNewPhone: 'Phone',
    kundeNewCity: 'City',
    kundeCreate: 'Create',
    orderItems: 'Ordered items',
    orderItemsPlaceholder: 'e.g. 2x Margherita pizza, 1x Cola',
    orderTotal: 'Total amount (€)',
    orderDate: 'Order date & time',
    orderDeliveryTime: 'Desired delivery time',
    deliveryAddress: 'Delivery address',
    deliveryStreet: 'Street',
    deliveryHouseNumber: 'House number',
    deliveryPostalCode: 'Postal code',
    deliveryCity: 'City',
    paymentMethod: 'Payment method',
    paymentMethodNone: 'Select payment method',
    deliveryNotes: 'Delivery notes',
    deliveryNotesPlaceholder: 'e.g. Doorbell broken, please call',
    nextToStep2: 'Continue to step 2',
    nextToStep3: 'Continue to step 3',
    nextToStep4: 'Continue to confirmation',
    fahrerzuweisung: 'Assign driver',
    fahrerEmpty: 'No available driver found',
    fahrerSearch: 'Search drivers…',
    fahrerSkip: 'Continue without driver',
    confirmTitle: 'Confirm order',
    confirmKunde: 'Customer',
    confirmItems: 'Ordered items',
    confirmTotal: 'Total amount',
    confirmDelivery: 'Delivery address',
    confirmDeliveryTime: 'Delivery time',
    confirmPayment: 'Payment',
    confirmFahrer: 'Driver',
    confirmNoFahrer: 'No driver assigned',
    confirmCreate: 'Place order',
    confirmLoading: 'Creating…',
    successTitle: 'Order placed successfully!',
    successId: 'Order ID',
    successNew: 'Place new order',
    successDashboard: 'Back to dashboard',
    missingKunde: 'Please select a customer first.',
    missingItems: 'Please enter the ordered items.',
    goToStep1: 'Go to step 1',
    backStep: 'Back',
    liveTotal: 'Total amount',
    noDeliveryAddress: 'No address',
  },
  cs: {
    title: 'Zadat objednávku', /* i18n-exempt */
    subtitle: 'Krok za krokem k nové objednávce doručení',
    stepKunde: 'Zákazník',
    stepBestellung: 'Objednávka',
    stepFahrer: 'Řidič',
    stepBestaetigung: 'Potvrzení',
    kundeSearch: 'Hledat zákazníky…',
    kundeEmpty: 'Žádní aktivní zákazníci nenalezeni',
    kundeNew: 'Přidat nového zákazníka',
    kundeNewFirstName: 'Jméno',
    kundeNewLastName: 'Příjmení',
    kundeNewEmail: 'E-mail',
    kundeNewPhone: 'Telefon',
    kundeNewCity: 'Město',
    kundeCreate: 'Vytvořit',
    orderItems: 'Objednané položky',
    orderItemsPlaceholder: 'např. 2x Pizza Margherita, 1x Cola',
    orderTotal: 'Celková částka (€)',
    orderDate: 'Datum a čas objednávky',
    orderDeliveryTime: 'Požadovaný čas doručení',
    deliveryAddress: 'Adresa doručení',
    deliveryStreet: 'Ulice',
    deliveryHouseNumber: 'Číslo domu',
    deliveryPostalCode: 'PSČ',
    deliveryCity: 'Město',
    paymentMethod: 'Způsob platby',
    paymentMethodNone: 'Vyberte způsob platby',
    deliveryNotes: 'Poznámky k doručení',
    deliveryNotesPlaceholder: 'např. Zvonek nefunguje, prosím zavolejte',
    nextToStep2: 'Pokračovat na krok 2',
    nextToStep3: 'Pokračovat na krok 3',
    nextToStep4: 'Pokračovat na potvrzení',
    fahrerzuweisung: 'Přiřadit řidiče',
    fahrerEmpty: 'Žádný dostupný řidič nenalezen',
    fahrerSearch: 'Hledat řidiče…',
    fahrerSkip: 'Pokračovat bez řidiče',
    confirmTitle: 'Potvrdit objednávku',
    confirmKunde: 'Zákazník',
    confirmItems: 'Objednané položky',
    confirmTotal: 'Celková částka',
    confirmDelivery: 'Adresa doručení',
    confirmDeliveryTime: 'Čas doručení',
    confirmPayment: 'Platba',
    confirmFahrer: 'Řidič',
    confirmNoFahrer: 'Žádný řidič nepřiřazen',
    confirmCreate: 'Zadat objednávku',
    confirmLoading: 'Vytváření…',
    successTitle: 'Objednávka úspěšně zadána!',
    successId: 'ID objednávky',
    successNew: 'Zadat novou objednávku',
    successDashboard: 'Zpět na přehled',
    missingKunde: 'Nejprve vyberte zákazníka.',
    missingItems: 'Zadejte objednané položky.',
    goToStep1: 'Na první krok',
    backStep: 'Zpět',
    liveTotal: 'Celková částka',
    noDeliveryAddress: 'Žádná adresa',
  },
});

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function BestellungAufgebenPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  // Step state
  const [step, setStep] = useState(1);

  // Step 1: Kunde
  const [selectedKunde, setSelectedKunde] = useState<Kundenverwaltung | null>(null);
  const [showKundeCreate, setShowKundeCreate] = useState(false);
  const [newKundeFirstName, setNewKundeFirstName] = useState('');
  const [newKundeLastName, setNewKundeLastName] = useState('');
  const [newKundeEmail, setNewKundeEmail] = useState('');
  const [newKundePhone, setNewKundePhone] = useState('');
  const [newKundeCity, setNewKundeCity] = useState('');
  const [kundeCreating, setKundeCreating] = useState(false);

  // Step 2: Bestellung
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [orderDate, setOrderDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState('none');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Step 3: Fahrer
  const [selectedFahrer, setSelectedFahrer] = useState<Fahrerverwaltung | null>(null);
  const [fahrerSkipped, setFahrerSkipped] = useState(false);

  // Step 4: Confirm
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Filtered data
  const activeKunden = useMemo(
    () => kundenverwaltung.filter(k => k.fields.customer_status?.key === 'aktiv'),
    [kundenverwaltung]
  );

  const availableFahrer = useMemo(
    () => fahrerverwaltung.filter(f => f.fields.driver_status?.key === 'verfuegbar'),
    [fahrerverwaltung]
  );

  // Prefill delivery address when customer is selected
  const handleKundeSelect = (id: string) => {
    const kunde = kundenverwaltung.find(k => k.record_id === id) ?? null;
    setSelectedKunde(kunde);
    if (kunde) {
      setDeliveryStreet(kunde.fields.street ?? '');
      setDeliveryHouseNumber(kunde.fields.house_number ?? '');
      setDeliveryPostalCode(kunde.fields.postal_code ?? '');
      setDeliveryCity(kunde.fields.city ?? '');
    }
    setStep(2);
  };

  const handleKundeCreate = async () => {
    if (!newKundeFirstName || !newKundeLastName) return;
    setKundeCreating(true);
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
      setShowKundeCreate(false);
      setNewKundeFirstName('');
      setNewKundeLastName('');
      setNewKundeEmail('');
      setNewKundePhone('');
      setNewKundeCity('');
      const newKunde = kundenverwaltung.find(k => k.record_id === created.record_id);
      if (newKunde) {
        setSelectedKunde(newKunde);
        setDeliveryStreet(newKunde.fields.street ?? '');
        setDeliveryHouseNumber(newKunde.fields.house_number ?? '');
        setDeliveryPostalCode(newKunde.fields.postal_code ?? '');
        setDeliveryCity(newKunde.fields.city ?? '');
      } else {
        // fetchAll is async; store id for lookup after re-render
        setSelectedKunde({ record_id: created.record_id, created_at: '', updated_at: null, createdat: '', updatedat: null, fields: { first_name: newKundeFirstName, last_name: newKundeLastName, customer_status: { key: 'aktiv', label: 'Aktiv' /* i18n-exempt */ } } });
      }
      setStep(2);
    } finally {
      setKundeCreating(false);
    }
  };

  const handleFahrerSelect = (id: string) => {
    const fahrer = fahrerverwaltung.find(f => f.record_id === id) ?? null;
    setSelectedFahrer(fahrer);
    setFahrerSkipped(false);
    setStep(4);
  };

  const handleFahrerSkip = () => {
    setSelectedFahrer(null);
    setFahrerSkipped(true);
    setStep(4);
  };

  const handleConfirm = async () => {
    if (!selectedKunde) return;
    if (createdOrderId) return; // idempotency guard

    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Parameters<typeof LivingAppsService.createBestellverwaltungEntry>[0] = {
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id),
        ordered_items: orderedItems,
        total_amount: totalAmount ? parseFloat(totalAmount) : undefined,
        order_date: orderDate,
        desired_delivery_time: desiredDeliveryTime || undefined,
        delivery_street: deliveryStreet || undefined,
        delivery_house_number: deliveryHouseNumber || undefined,
        delivery_postal_code: deliveryPostalCode || undefined,
        delivery_city: deliveryCity || undefined,
        delivery_notes: deliveryNotes || undefined,
        order_status: 'neu',
      };

      if (paymentMethodKey && paymentMethodKey !== 'none') {
        payload.payment_method = paymentMethodKey;
      }

      if (selectedFahrer) {
        payload.fahrer = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrer.record_id);
      }

      const result = await LivingAppsService.createBestellverwaltungEntry(payload);
      setCreatedOrderId(result.record_id);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKunde(null);
    setShowKundeCreate(false);
    setOrderedItems('');
    setTotalAmount('');
    setOrderDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setDesiredDeliveryTime('');
    setDeliveryStreet('');
    setDeliveryHouseNumber('');
    setDeliveryPostalCode('');
    setDeliveryCity('');
    setPaymentMethodKey('none');
    setDeliveryNotes('');
    setSelectedFahrer(null);
    setFahrerSkipped(false);
    setSubmitError(null);
    setCreatedOrderId(null);
  };

  const kundeName = selectedKunde
    ? `${selectedKunde.fields.first_name ?? ''} ${selectedKunde.fields.last_name ?? ''}`.trim()
    : '';

  const fahrerName = selectedFahrer
    ? `${selectedFahrer.fields.driver_first_name ?? ''} ${selectedFahrer.fields.driver_last_name ?? ''}`.trim()
    : '';

  const deliveryAddressFull = [deliveryStreet, deliveryHouseNumber, deliveryPostalCode, deliveryCity]
    .filter(Boolean)
    .join(' ');

  const paymentLabel = PAYMENT_OPTIONS.find(o => o.key === paymentMethodKey)?.label ?? '';

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('stepKunde') },
        { label: tt('stepBestellung') },
        { label: tt('stepFahrer') },
        { label: tt('stepBestaetigung') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Kunde auswählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={activeKunden.map(k => ({
            id: k.record_id,
            title: `${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || k.record_id,
            subtitle: [k.fields.email, k.fields.phone, k.fields.city].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          searchPlaceholder={tt('kundeSearch')}
          emptyText={tt('kundeEmpty')}
          createLabel={tt('kundeNew')}
          onCreateNew={() => setShowKundeCreate(true)}
          createDialog={showKundeCreate && (
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  value={newKundeFirstName}
                  onChange={e => setNewKundeFirstName(e.target.value)}
                  placeholder={tt('kundeNewFirstName')}
                />
                <Input
                  value={newKundeLastName}
                  onChange={e => setNewKundeLastName(e.target.value)}
                  placeholder={tt('kundeNewLastName')}
                />
              </div>
              <Input
                type="email"
                value={newKundeEmail}
                onChange={e => setNewKundeEmail(e.target.value)}
                placeholder={tt('kundeNewEmail')}
              />
              <Input
                type="tel"
                value={newKundePhone}
                onChange={e => setNewKundePhone(e.target.value)}
                placeholder={tt('kundeNewPhone')}
              />
              <Input
                value={newKundeCity}
                onChange={e => setNewKundeCity(e.target.value)}
                placeholder={tt('kundeNewCity')}
              />
              <Button
                className="w-full"
                disabled={!newKundeFirstName || !newKundeLastName || kundeCreating}
                onClick={handleKundeCreate}
              >
                {tt('kundeCreate')}
              </Button>
            </div>
          )}
        />
      )}

      {/* ── Step 2: Bestellung erfassen ── */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-5">
            {/* Selected customer banner */}
            <div className="rounded-2xl border bg-secondary/40 px-4 py-3 flex items-center gap-3">
              <IconUser size={18} className="text-primary shrink-0" />
              <span className="font-medium truncate">{kundeName}</span>
              {selectedKunde.fields.customer_status && (
                <StatusBadge
                  statusKey={selectedKunde.fields.customer_status.key}
                  label={selectedKunde.fields.customer_status.label}
                />
              )}
            </div>

            {/* Live total card */}
            {totalAmount && parseFloat(totalAmount) > 0 && (
              <div className="rounded-2xl border bg-card p-4 flex items-center gap-3">
                <IconCurrencyEuro size={20} className="text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{tt('liveTotal')}</p>
                  <p className="text-2xl font-bold">
                    {parseFloat(totalAmount).toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* Ordered items */}
              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('orderItems')} *</label>
                <Textarea
                  value={orderedItems}
                  onChange={e => setOrderedItems(e.target.value)}
                  placeholder={tt('orderItemsPlaceholder')}
                  rows={3}
                  className="resize-none"
                />
              </div>

              {/* Total amount */}
              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('orderTotal')} *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {/* Dates */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tt('orderDate')} *</label>
                  <Input
                    type="datetime-local"
                    value={orderDate}
                    onChange={e => setOrderDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tt('orderDeliveryTime')}</label>
                  <Input
                    type="datetime-local"
                    value={desiredDeliveryTime}
                    onChange={e => setDesiredDeliveryTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Delivery address */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <IconMapPin size={16} className="text-muted-foreground" />
                  <span className="text-sm font-medium">{tt('deliveryAddress')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    value={deliveryStreet}
                    onChange={e => setDeliveryStreet(e.target.value)}
                    placeholder={tt('deliveryStreet')}
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
                  />
                </div>
              </div>

              {/* Payment method */}
              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('paymentMethod')}</label>
                <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tt('paymentMethodNone')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tt('paymentMethodNone')}</SelectItem>
                    {PAYMENT_OPTIONS.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Delivery notes */}
              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('deliveryNotes')}</label>
                <Textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={tt('deliveryNotesPlaceholder')}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} className="shrink-0">
                {tt('backStep')}
              </Button>
              <Button
                className="flex-1"
                disabled={!orderedItems || !totalAmount || !orderDate}
                onClick={() => setStep(3)}
              >
                {tt('nextToStep3')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('missingKunde')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('goToStep1')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Fahrer zuweisen ── */}
      {step === 3 && (
        selectedKunde ? (
          <div className="space-y-4">
            <EntitySelectStep
              items={availableFahrer.map(f => ({
                id: f.record_id,
                title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || f.record_id,
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone,
                ].filter(Boolean).join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconTruck size={20} className="text-primary" />,
              }))}
              onSelect={handleFahrerSelect}
              searchPlaceholder={tt('fahrerSearch')}
              emptyText={tt('fahrerEmpty')}
            />
            <div className="flex gap-3 pt-1">
              <Button variant="outline" onClick={() => setStep(2)} className="shrink-0">
                {tt('backStep')}
              </Button>
              <Button variant="outline" className="flex-1" onClick={handleFahrerSkip}>
                {tt('fahrerSkip')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('missingKunde')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('goToStep1')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: Bestätigung & Erstellen ── */}
      {step === 4 && (
        selectedKunde ? (
          createdOrderId ? (
            /* Success state */
            <div className="text-center py-10 space-y-4">
              <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                <IconCheck size={28} className="text-primary" />
              </div>
              <div>
                <p className="text-lg font-semibold">{tt('successTitle')}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {tt('successId')}: <span className="font-mono">{createdOrderId}</span>
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={handleReset}>
                  {tt('successNew')}
                </Button>
                <a href="#/">
                  <Button variant="outline" className="w-full">{tt('successDashboard')}</Button>
                </a>
              </div>
            </div>
          ) : (
            /* Confirmation summary */
            <div className="space-y-5">
              <h2 className="text-base font-semibold">{tt('confirmTitle')}</h2>

              <div className="rounded-2xl border bg-card divide-y overflow-hidden">
                {/* Kunde */}
                <div className="px-4 py-3 flex items-start gap-3">
                  <IconUser size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('confirmKunde')}</p>
                    <p className="font-medium truncate">{kundeName}</p>
                    {selectedKunde.fields.email && (
                      <p className="text-sm text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                    )}
                  </div>
                </div>

                {/* Items */}
                <div className="px-4 py-3 flex items-start gap-3">
                  <IconPackage size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('confirmItems')}</p>
                    <p className="text-sm whitespace-pre-wrap break-words">{orderedItems}</p>
                  </div>
                </div>

                {/* Total */}
                <div className="px-4 py-3 flex items-start gap-3">
                  <IconCurrencyEuro size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('confirmTotal')}</p>
                    <p className="font-bold text-lg">
                      {parseFloat(totalAmount || '0').toLocaleString('de-DE', { minimumFractionDigits: 2 })} €
                    </p>
                  </div>
                </div>

                {/* Delivery address */}
                <div className="px-4 py-3 flex items-start gap-3">
                  <IconMapPin size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('confirmDelivery')}</p>
                    <p className="text-sm">{deliveryAddressFull || tt('noDeliveryAddress')}</p>
                    {desiredDeliveryTime && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {tt('confirmDeliveryTime')}: {desiredDeliveryTime.replace('T', ' ')}
                      </p>
                    )}
                  </div>
                </div>

                {/* Payment */}
                {paymentMethodKey !== 'none' && (
                  <div className="px-4 py-3 flex items-start gap-3">
                    <IconCurrencyEuro size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tt('confirmPayment')}</p>
                      <p className="text-sm">{paymentLabel}</p>
                    </div>
                  </div>
                )}

                {/* Driver */}
                <div className="px-4 py-3 flex items-start gap-3">
                  <IconTruck size={16} className="text-muted-foreground mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tt('confirmFahrer')}</p>
                    <p className="text-sm">
                      {selectedFahrer
                        ? `${fahrerName}${selectedFahrer.fields.vehicle_type ? ` · ${selectedFahrer.fields.vehicle_type.label}` : ''}`
                        : tt('confirmNoFahrer')}
                    </p>
                  </div>
                </div>
              </div>

              {submitError && (
                <p className="text-sm text-destructive rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2">
                  {submitError}
                </p>
              )}

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  className="shrink-0"
                  disabled={submitting}
                  onClick={() => setStep(fahrerSkipped ? 3 : 3)}
                >
                  {tt('backStep')}
                </Button>
                <Button
                  className="flex-1"
                  disabled={submitting}
                  onClick={handleConfirm}
                >
                  {submitting ? tt('confirmLoading') : tt('confirmCreate')}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('missingKunde')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('goToStep1')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
