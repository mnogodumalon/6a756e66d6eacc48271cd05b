/**
 * Bestellung aufgeben — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen (nur aktive) → 2) Bestelldetails eingeben → 3) Fahrer zuweisen & bestätigen.
 * Reads: kundenverwaltung (filter: customer_status === 'aktiv'), fahrerverwaltung (filter: driver_status === 'verfuegbar').
 * Writes: bestellverwaltung (createBestellverwaltungEntry), fahrerverwaltung (updateFahrerverwaltungEntry status → 'im_einsatz').
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
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
import { IconUser, IconTruck, IconCheck, IconAlertCircle } from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Bestellung aufgeben', /* i18n-exempt */
    subtitle: 'Kunde wählen, Artikel erfassen, Fahrer zuweisen', /* i18n-exempt */
    step1: 'Kunde', /* i18n-exempt */
    step2: 'Details', /* i18n-exempt */
    step3: 'Fahrer', /* i18n-exempt */
    step1Placeholder: 'Kunden suchen...', /* i18n-exempt */
    step1Empty: 'Keine aktiven Kunden gefunden', /* i18n-exempt */
    step1CreateLabel: 'Neuen Kunden anlegen', /* i18n-exempt */
    newFirstName: 'Vorname', /* i18n-exempt */
    newLastName: 'Nachname', /* i18n-exempt */
    newEmail: 'E-Mail', /* i18n-exempt */
    newPhone: 'Telefon', /* i18n-exempt */
    newCity: 'Stadt', /* i18n-exempt */
    createCustomer: 'Kunde anlegen', /* i18n-exempt */
    orderedItems: 'Bestellte Artikel', /* i18n-exempt */
    orderedItemsPlaceholder: 'z.B. 2x Pizza Margherita, 1x Cola', /* i18n-exempt */
    totalAmount: 'Gesamtbetrag (€)', /* i18n-exempt */
    orderDate: 'Bestelldatum und -uhrzeit', /* i18n-exempt */
    deliveryTime: 'Gewünschter Lieferzeitpunkt', /* i18n-exempt */
    deliveryStreet: 'Lieferstraße', /* i18n-exempt */
    deliveryHouseNumber: 'Hausnummer', /* i18n-exempt */
    deliveryPostalCode: 'PLZ', /* i18n-exempt */
    deliveryCity: 'Lieferstadt', /* i18n-exempt */
    deliveryNotes: 'Lieferhinweise', /* i18n-exempt */
    paymentMethod: 'Zahlungsmethode', /* i18n-exempt */
    paymentPlaceholder: 'Zahlungsmethode wählen', /* i18n-exempt */
    orderStatus: 'Bestellstatus', /* i18n-exempt */
    toStep3: 'Weiter zu Fahrerzuweisung', /* i18n-exempt */
    step3Placeholder: 'Fahrer suchen...', /* i18n-exempt */
    step3Empty: 'Keine verfügbaren Fahrer', /* i18n-exempt */
    skipDriver: 'Ohne Fahrer fortfahren', /* i18n-exempt */
    confirmOrder: 'Bestellung anlegen', /* i18n-exempt */
    selectedCustomer: 'Ausgewählter Kunde', /* i18n-exempt */
    availableDrivers: 'verfügbare Fahrer', /* i18n-exempt */
    submitting: 'Wird gespeichert...', /* i18n-exempt */
    successTitle: 'Bestellung erfolgreich angelegt!', /* i18n-exempt */
    successDesc: 'Die Bestellung wurde gespeichert und der Fahrer wurde als "Im Einsatz" markiert.', /* i18n-exempt */
    successDescNoDriver: 'Die Bestellung wurde ohne Fahrerzuweisung gespeichert.', /* i18n-exempt */
    newOrder: 'Neue Bestellung anlegen', /* i18n-exempt */
    backToDashboard: 'Zurück zum Dashboard', /* i18n-exempt */
    errorOccurred: 'Fehler beim Anlegen der Bestellung', /* i18n-exempt */
    backToStep1: 'Neu starten', /* i18n-exempt */
    backToStep2: 'Zurück zu Bestelldetails', /* i18n-exempt */
    phoneLabel: 'Tel.', /* i18n-exempt */
    stepNeedsStep1: 'Dieser Schritt braucht die Auswahl aus Schritt 1.', /* i18n-exempt */
  },
  en: {
    title: 'Place Order', /* i18n-exempt */
    subtitle: 'Select customer, enter items, assign driver', /* i18n-exempt */
    step1: 'Customer', /* i18n-exempt */
    step2: 'Details', /* i18n-exempt */
    step3: 'Driver', /* i18n-exempt */
    step1Placeholder: 'Search customers...', /* i18n-exempt */
    step1Empty: 'No active customers found', /* i18n-exempt */
    step1CreateLabel: 'Create new customer', /* i18n-exempt */
    newFirstName: 'First name', /* i18n-exempt */
    newLastName: 'Last name', /* i18n-exempt */
    newEmail: 'Email', /* i18n-exempt */
    newPhone: 'Phone', /* i18n-exempt */
    newCity: 'City', /* i18n-exempt */
    createCustomer: 'Create customer', /* i18n-exempt */
    orderedItems: 'Ordered items', /* i18n-exempt */
    orderedItemsPlaceholder: 'e.g. 2x Pizza Margherita, 1x Cola', /* i18n-exempt */
    totalAmount: 'Total amount (€)', /* i18n-exempt */
    orderDate: 'Order date and time', /* i18n-exempt */
    deliveryTime: 'Requested delivery time', /* i18n-exempt */
    deliveryStreet: 'Delivery street', /* i18n-exempt */
    deliveryHouseNumber: 'House number', /* i18n-exempt */
    deliveryPostalCode: 'Postal code', /* i18n-exempt */
    deliveryCity: 'Delivery city', /* i18n-exempt */
    deliveryNotes: 'Delivery notes', /* i18n-exempt */
    paymentMethod: 'Payment method', /* i18n-exempt */
    paymentPlaceholder: 'Select payment method', /* i18n-exempt */
    orderStatus: 'Order status', /* i18n-exempt */
    toStep3: 'Continue to driver assignment', /* i18n-exempt */
    step3Placeholder: 'Search drivers...', /* i18n-exempt */
    step3Empty: 'No available drivers', /* i18n-exempt */
    skipDriver: 'Continue without driver', /* i18n-exempt */
    confirmOrder: 'Place order', /* i18n-exempt */
    selectedCustomer: 'Selected customer', /* i18n-exempt */
    availableDrivers: 'available drivers', /* i18n-exempt */
    submitting: 'Saving...', /* i18n-exempt */
    successTitle: 'Order placed successfully!', /* i18n-exempt */
    successDesc: 'The order has been saved and the driver is now marked as "On Duty".', /* i18n-exempt */
    successDescNoDriver: 'The order was saved without a driver assignment.', /* i18n-exempt */
    newOrder: 'Place new order', /* i18n-exempt */
    backToDashboard: 'Back to dashboard', /* i18n-exempt */
    errorOccurred: 'Error placing order', /* i18n-exempt */
    backToStep1: 'Start over', /* i18n-exempt */
    backToStep2: 'Back to order details', /* i18n-exempt */
    phoneLabel: 'Tel.', /* i18n-exempt */
    stepNeedsStep1: 'This step requires a selection from step 1.', /* i18n-exempt */
  },
  cs: {
    title: 'Zadat objednávku', /* i18n-exempt */
    subtitle: 'Vybrat zákazníka, zadat položky, přiřadit řidiče', /* i18n-exempt */
    step1: 'Zákazník', /* i18n-exempt */
    step2: 'Detaily', /* i18n-exempt */
    step3: 'Řidič', /* i18n-exempt */
    step1Placeholder: 'Hledat zákazníky...', /* i18n-exempt */
    step1Empty: 'Žádní aktivní zákazníci', /* i18n-exempt */
    step1CreateLabel: 'Vytvořit nového zákazníka', /* i18n-exempt */
    newFirstName: 'Jméno', /* i18n-exempt */
    newLastName: 'Příjmení', /* i18n-exempt */
    newEmail: 'E-mail', /* i18n-exempt */
    newPhone: 'Telefon', /* i18n-exempt */
    newCity: 'Město', /* i18n-exempt */
    createCustomer: 'Vytvořit zákazníka', /* i18n-exempt */
    orderedItems: 'Objednané položky', /* i18n-exempt */
    orderedItemsPlaceholder: 'např. 2x Pizza Margherita, 1x Cola', /* i18n-exempt */
    totalAmount: 'Celková částka (€)', /* i18n-exempt */
    orderDate: 'Datum a čas objednávky', /* i18n-exempt */
    deliveryTime: 'Požadovaný čas doručení', /* i18n-exempt */
    deliveryStreet: 'Ulice doručení', /* i18n-exempt */
    deliveryHouseNumber: 'Číslo popisné', /* i18n-exempt */
    deliveryPostalCode: 'PSČ', /* i18n-exempt */
    deliveryCity: 'Město doručení', /* i18n-exempt */
    deliveryNotes: 'Pokyny k doručení', /* i18n-exempt */
    paymentMethod: 'Způsob platby', /* i18n-exempt */
    paymentPlaceholder: 'Vybrat způsob platby', /* i18n-exempt */
    orderStatus: 'Stav objednávky', /* i18n-exempt */
    toStep3: 'Pokračovat k přiřazení řidiče', /* i18n-exempt */
    step3Placeholder: 'Hledat řidiče...', /* i18n-exempt */
    step3Empty: 'Žádní dostupní řidiči', /* i18n-exempt */
    skipDriver: 'Pokračovat bez řidiče', /* i18n-exempt */
    confirmOrder: 'Zadat objednávku', /* i18n-exempt */
    selectedCustomer: 'Vybraný zákazník', /* i18n-exempt */
    availableDrivers: 'dostupní řidiči', /* i18n-exempt */
    submitting: 'Ukládám...', /* i18n-exempt */
    successTitle: 'Objednávka úspěšně zadána!', /* i18n-exempt */
    successDesc: 'Objednávka byla uložena a řidič je označen jako "Ve službě".', /* i18n-exempt */
    successDescNoDriver: 'Objednávka byla uložena bez přiřazeného řidiče.', /* i18n-exempt */
    newOrder: 'Zadat novou objednávku', /* i18n-exempt */
    backToDashboard: 'Zpět na dashboard', /* i18n-exempt */
    errorOccurred: 'Chyba při zadávání objednávky', /* i18n-exempt */
    backToStep1: 'Začít znovu', /* i18n-exempt */
    backToStep2: 'Zpět na detaily objednávky', /* i18n-exempt */
    phoneLabel: 'Tel.', /* i18n-exempt */
    stepNeedsStep1: 'Tento krok vyžaduje výběr z kroku 1.', /* i18n-exempt */
  },
});

const ORDER_STATUS_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? [];
const PAYMENT_METHOD_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function BestellungAufgebenPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1 — Kunde
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newCity, setNewCity] = useState('');
  const [creatingKunde, setCreatingKunde] = useState(false);

  // Step 2 — Bestelldetails
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [orderDate, setOrderDate] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState('none');
  const [orderStatusKey] = useState('neu');

  // Step 3 — Fahrer
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  const activeKunden = useMemo(
    () => kundenverwaltung.filter(k => k.fields.customer_status?.key === 'aktiv'),
    [kundenverwaltung]
  );

  const availableFahrer = useMemo(
    () => fahrerverwaltung.filter(f => f.fields.driver_status?.key === 'verfuegbar'),
    [fahrerverwaltung]
  );

  const selectedKunde = useMemo(
    () => (selectedKundeId ? kundenverwaltung.find(k => k.record_id === selectedKundeId) : null),
    [selectedKundeId, kundenverwaltung]
  );

  const canProceedToStep3 = orderedItems.trim() !== '' && totalAmount !== '' && orderDate !== '';

  const handleCreateKunde = async () => {
    if (!newFirstName.trim() || !newLastName.trim()) return;
    setCreatingKunde(true);
    try {
      const created = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newFirstName.trim(),
        last_name: newLastName.trim(),
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        city: newCity.trim() || undefined,
        customer_status: 'aktiv',
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNewFirstName('');
      setNewLastName('');
      setNewEmail('');
      setNewPhone('');
      setNewCity('');
      setSelectedKundeId(created.record_id);
      setStep(2);
    } finally {
      setCreatingKunde(false);
    }
  };

  const handleConfirmOrder = async (fahrerId: string | null = selectedFahrerId) => {
    if (!selectedKundeId) return;
    if (submitting) return;

    setSubmitting(true);
    setSubmitError(null);

    let orderId = createdOrderId;
    try {
      if (!orderId) {
        const created = await LivingAppsService.createBestellverwaltungEntry({
          ordered_items: orderedItems.trim(),
          total_amount: parseFloat(totalAmount),
          order_date: orderDate,
          desired_delivery_time: desiredDeliveryTime || undefined,
          delivery_street: deliveryStreet.trim() || undefined,
          delivery_house_number: deliveryHouseNumber.trim() || undefined,
          delivery_postal_code: deliveryPostalCode.trim() || undefined,
          delivery_city: deliveryCity.trim() || undefined,
          delivery_notes: deliveryNotes.trim() || undefined,
          payment_method: paymentMethodKey !== 'none' ? paymentMethodKey : undefined,
          order_status: orderStatusKey,
          kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId),
          fahrer: fahrerId
            ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, fahrerId)
            : undefined,
        });
        orderId = created.record_id;
        setCreatedOrderId(orderId);
      }

      if (fahrerId) {
        await LivingAppsService.updateFahrerverwaltungEntry(fahrerId, {
          driver_status: 'im_einsatz',
        });
      }

      await fetchAll();
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKundeId(null);
    setShowCreateKunde(false);
    setNewFirstName('');
    setNewLastName('');
    setNewEmail('');
    setNewPhone('');
    setNewCity('');
    setOrderedItems('');
    setTotalAmount('');
    setOrderDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setDesiredDeliveryTime('');
    setDeliveryStreet('');
    setDeliveryHouseNumber('');
    setDeliveryPostalCode('');
    setDeliveryCity('');
    setDeliveryNotes('');
    setPaymentMethodKey('none');
    setSelectedFahrerId(null);
    setSubmitError(null);
    setCreatedOrderId(null);
  };

  const steps = [
    { label: tt('step1') },
    { label: tt('step2') },
    { label: tt('step3') },
  ];

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={steps}
      currentStep={Math.min(step, 3)}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1 — Kunde wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={activeKunden.map(k => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.city].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            stats: [
              ...(k.fields.phone ? [{ label: tt('phoneLabel'), value: k.fields.phone }] : []),
            ],
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={(id) => {
            setSelectedKundeId(id);
            setStep(2);
          }}
          searchPlaceholder={tt('step1Placeholder')}
          emptyText={tt('step1Empty')}
          createLabel={tt('step1CreateLabel')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={showCreateKunde && (
            <div className="rounded-2xl border p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{tt('newFirstName')} *</label>
                  <Input
                    value={newFirstName}
                    onChange={e => setNewFirstName(e.target.value)}
                    placeholder={tt('newFirstName')}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{tt('newLastName')} *</label>
                  <Input
                    value={newLastName}
                    onChange={e => setNewLastName(e.target.value)}
                    placeholder={tt('newLastName')}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{tt('newEmail')}</label>
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder={tt('newEmail')}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{tt('newPhone')}</label>
                  <Input
                    type="tel"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder={tt('newPhone')}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">{tt('newCity')}</label>
                <Input
                  value={newCity}
                  onChange={e => setNewCity(e.target.value)}
                  placeholder={tt('newCity')}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={!newFirstName.trim() || !newLastName.trim() || creatingKunde}
                  onClick={handleCreateKunde}
                  className="flex-1"
                >
                  {creatingKunde ? '...' : tt('createCustomer')}
                </Button>
                <Button variant="outline" onClick={() => setShowCreateKunde(false)}>
                  ✕
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* Step 2 — Bestelldetails */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-6">
            {/* Kontext: gewählter Kunde */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex items-center gap-3">
              <IconUser size={18} className="text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{tt('selectedCustomer')}</p>
                <p className="font-medium truncate">
                  {[selectedKunde?.fields.first_name, selectedKunde?.fields.last_name].filter(Boolean).join(' ')}
                  {selectedKunde?.fields.city ? ` · ${selectedKunde.fields.city}` : ''}
                </p>
              </div>
              {selectedKunde?.fields.customer_status && (
                <StatusBadge
                  statusKey={selectedKunde.fields.customer_status.key}
                  label={selectedKunde.fields.customer_status.label}
                  className="ml-auto flex-shrink-0"
                />
              )}
            </div>

            {/* Mini-Form */}
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('orderedItems')} *</label>
                <Textarea
                  value={orderedItems}
                  onChange={e => setOrderedItems(e.target.value)}
                  placeholder={tt('orderedItemsPlaceholder')}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tt('totalAmount')} *</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalAmount}
                    onChange={e => setTotalAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tt('orderDate')} *</label>
                  <Input
                    type="datetime-local"
                    value={orderDate}
                    onChange={e => setOrderDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('deliveryTime')}</label>
                <Input
                  type="datetime-local"
                  value={desiredDeliveryTime}
                  onChange={e => setDesiredDeliveryTime(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2 space-y-1">
                  <label className="text-sm font-medium">{tt('deliveryStreet')}</label>
                  <Input
                    value={deliveryStreet}
                    onChange={e => setDeliveryStreet(e.target.value)}
                    placeholder={tt('deliveryStreet')}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tt('deliveryHouseNumber')}</label>
                  <Input
                    value={deliveryHouseNumber}
                    onChange={e => setDeliveryHouseNumber(e.target.value)}
                    placeholder="12a"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tt('deliveryPostalCode')}</label>
                  <Input
                    value={deliveryPostalCode}
                    onChange={e => setDeliveryPostalCode(e.target.value)}
                    placeholder="12345"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tt('deliveryCity')}</label>
                  <Input
                    value={deliveryCity}
                    onChange={e => setDeliveryCity(e.target.value)}
                    placeholder={tt('deliveryCity')}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('paymentMethod')}</label>
                <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tt('paymentPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tt('paymentPlaceholder')}</SelectItem>
                    {PAYMENT_METHOD_OPTIONS.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('deliveryNotes')}</label>
                <Textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={tt('deliveryNotes')}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                onClick={() => setStep(3)}
                disabled={!canProceedToStep3}
                className="w-full sm:w-auto"
              >
                {tt('toStep3')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('stepNeedsStep1')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('backToStep1')}</Button>
          </div>
        )
      )}

      {/* Step 3 — Fahrer zuweisen */}
      {step === 3 && (
        selectedKundeId ? (
          <div className="space-y-6">
            {/* Kontext */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex items-center gap-3">
              <IconUser size={18} className="text-primary flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">{tt('selectedCustomer')}</p>
                <p className="font-medium truncate">
                  {[selectedKunde?.fields.first_name, selectedKunde?.fields.last_name].filter(Boolean).join(' ')}
                  {selectedKunde?.fields.city ? ` · ${selectedKunde.fields.city}` : ''}
                </p>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-xs text-muted-foreground">{tt('availableDrivers')}</p>
                <p className="font-semibold text-primary">{availableFahrer.length}</p>
              </div>
            </div>

            {/* Fahrer-Auswahl */}
            <EntitySelectStep
              items={availableFahrer.map(f => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || f.record_id,
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone,
                ].filter(Boolean).join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconTruck size={20} className="text-primary" />,
              }))}
              onSelect={(id) => setSelectedFahrerId(id)}
              searchPlaceholder={tt('step3Placeholder')}
              emptyText={tt('step3Empty')}
            />

            {/* Fehleranzeige */}
            {submitError && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 flex items-start gap-2">
                <IconAlertCircle size={16} className="text-destructive mt-0.5 flex-shrink-0" />
                <p className="text-sm text-destructive">{tt('errorOccurred')}: {submitError}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                onClick={() => handleConfirmOrder()}
                disabled={submitting}
                className="flex-1"
              >
                {submitting ? tt('submitting') : tt('confirmOrder')}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleConfirmOrder(null)}
                disabled={submitting}
                className="flex-1 sm:flex-none"
              >
                {tt('skipDriver')}
              </Button>
              <Button variant="ghost" onClick={() => setStep(2)} disabled={submitting}>
                {tt('backToStep2')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('stepNeedsStep1')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('backToStep1')}</Button>
          </div>
        )
      )}

      {/* Step 4 — Erfolg */}
      {step === 4 && (
        <div className="text-center py-12 space-y-6">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <IconCheck size={32} className="text-primary" stroke={2} />
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-semibold">{tt('successTitle')}</h3>
            <p className="text-muted-foreground text-sm max-w-md mx-auto">
              {selectedFahrerId ? tt('successDesc') : tt('successDescNoDriver')}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleReset}>{tt('newOrder')}</Button>
            <Button variant="outline" asChild>
              <a href="#/">{tt('backToDashboard')}</a>
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
