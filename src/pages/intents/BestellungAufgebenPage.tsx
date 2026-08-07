/**
 * Bestellung aufgeben — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen (nur aktive Kunden) → 2) Bestelldetails eingeben → 3) Bestätigen & absenden.
 * Reads: kundenverwaltung. Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconShoppingCart, IconUser, IconCheck, IconUserPlus } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kundenverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { makeT, fieldLabel, lookupLabel } from '@/i18n';

const tt = makeT({
  de: {
    title: 'Bestellung aufgeben', /* i18n-exempt */
    subtitle: 'In 3 Schritten eine neue Bestellung anlegen',
    step1: 'Kunde',
    step2: 'Details',
    step3: 'Bestätigen',
    selectKunde: 'Kunden auswählen',
    searchKunde: 'Kunden suchen…',
    emptyKunden: 'Keine aktiven Kunden gefunden.',
    newKunde: 'Neuen Kunden anlegen',
    createKunde: 'Kunden anlegen',
    kundeLabel: 'Ausgewählter Kunde',
    orderedItems: 'Bestellte Artikel',
    orderedItemsPlaceholder: 'Artikel, Mengen und Beschreibungen eingeben…',
    totalAmount: 'Gesamtbetrag (€)',
    orderDate: 'Bestelldatum & -uhrzeit',
    desiredDelivery: 'Gewünschte Lieferzeit',
    deliveryAddress: 'Lieferadresse',
    deliveryStreet: 'Straße',
    deliveryHouseNumber: 'Hausnummer',
    deliveryPostalCode: 'PLZ',
    deliveryCity: 'Stadt',
    deliveryNotes: 'Lieferhinweise',
    deliveryNotesPlaceholder: 'Besondere Hinweise für die Lieferung…',
    paymentMethod: 'Zahlungsmethode',
    paymentPlaceholder: 'Zahlungsmethode wählen…',
    weiter: 'Weiter',
    zurueck: 'Zurück',
    absenden: 'Bestellung absenden',
    absendenLoading: 'Wird gespeichert…',
    successTitle: 'Bestellung erfolgreich aufgegeben!',
    successSub: 'Die Bestellung wurde angelegt.',
    neueBestellung: 'Neue Bestellung aufgeben',
    dashboard: 'Zurück zum Dashboard',
    errorRequired: 'Bitte alle Pflichtfelder ausfüllen.',
    kunde: 'Kunde',
    bestelldetails: 'Bestelldetails',
    confirmKunde: 'Kunde',
    confirmItems: 'Bestellte Artikel',
    confirmTotal: 'Gesamtbetrag',
    confirmOrderDate: 'Bestelldatum',
    confirmDelivery: 'Gewünschte Lieferzeit',
    confirmAddress: 'Lieferadresse',
    confirmPayment: 'Zahlungsmethode',
    confirmNotes: 'Lieferhinweise',
    noDeliveryTime: 'Nicht angegeben',
    noAddress: 'Keine Adresse angegeben',
    noPayment: 'Nicht angegeben',
    noNotes: 'Keine Hinweise',
    stepNeedsKunde: 'Bitte zunächst einen Kunden auswählen.',
    stepNeedsDetails: 'Bitte zunächst die Bestelldetails ausfüllen.',
    restart: 'Neu starten',
  },
  en: {
    title: 'Place Order', /* i18n-exempt */
    subtitle: 'Create a new order in 3 steps',
    step1: 'Customer',
    step2: 'Details',
    step3: 'Confirm',
    selectKunde: 'Select customer',
    searchKunde: 'Search customers…',
    emptyKunden: 'No active customers found.',
    newKunde: 'Add new customer',
    createKunde: 'Create customer',
    kundeLabel: 'Selected customer',
    orderedItems: 'Ordered items',
    orderedItemsPlaceholder: 'Enter items, quantities and descriptions…',
    totalAmount: 'Total amount (€)',
    orderDate: 'Order date & time',
    desiredDelivery: 'Desired delivery time',
    deliveryAddress: 'Delivery address',
    deliveryStreet: 'Street',
    deliveryHouseNumber: 'House number',
    deliveryPostalCode: 'Postal code',
    deliveryCity: 'City',
    deliveryNotes: 'Delivery notes',
    deliveryNotesPlaceholder: 'Special notes for the delivery…',
    paymentMethod: 'Payment method',
    paymentPlaceholder: 'Select payment method…',
    weiter: 'Next',
    zurueck: 'Back',
    absenden: 'Submit order',
    absendenLoading: 'Saving…',
    successTitle: 'Order placed successfully!',
    successSub: 'The order has been created.',
    neueBestellung: 'Place another order',
    dashboard: 'Back to dashboard',
    errorRequired: 'Please fill in all required fields.',
    kunde: 'Customer',
    bestelldetails: 'Order details',
    confirmKunde: 'Customer',
    confirmItems: 'Ordered items',
    confirmTotal: 'Total amount',
    confirmOrderDate: 'Order date',
    confirmDelivery: 'Desired delivery time',
    confirmAddress: 'Delivery address',
    confirmPayment: 'Payment method',
    confirmNotes: 'Delivery notes',
    noDeliveryTime: 'Not specified',
    noAddress: 'No address provided',
    noPayment: 'Not specified',
    noNotes: 'No notes',
    stepNeedsKunde: 'Please select a customer first.',
    stepNeedsDetails: 'Please fill in order details first.',
    restart: 'Start over',
  },
  cs: {
    title: 'Zadat objednávku', /* i18n-exempt */
    subtitle: 'Vytvořte novou objednávku ve 3 krocích',
    step1: 'Zákazník',
    step2: 'Detaily',
    step3: 'Potvrdit',
    selectKunde: 'Vybrat zákazníka',
    searchKunde: 'Hledat zákazníky…',
    emptyKunden: 'Žádní aktivní zákazníci nenalezeni.',
    newKunde: 'Přidat nového zákazníka',
    createKunde: 'Vytvořit zákazníka',
    kundeLabel: 'Vybraný zákazník',
    orderedItems: 'Objednané položky',
    orderedItemsPlaceholder: 'Zadejte položky, množství a popisy…',
    totalAmount: 'Celková částka (€)',
    orderDate: 'Datum a čas objednávky',
    desiredDelivery: 'Požadovaný čas doručení',
    deliveryAddress: 'Doručovací adresa',
    deliveryStreet: 'Ulice',
    deliveryHouseNumber: 'Číslo popisné',
    deliveryPostalCode: 'PSČ',
    deliveryCity: 'Město',
    deliveryNotes: 'Poznámky k doručení',
    deliveryNotesPlaceholder: 'Zvláštní pokyny pro doručení…',
    paymentMethod: 'Způsob platby',
    paymentPlaceholder: 'Vyberte způsob platby…',
    weiter: 'Další',
    zurueck: 'Zpět',
    absenden: 'Odeslat objednávku',
    absendenLoading: 'Ukládání…',
    successTitle: 'Objednávka úspěšně zadána!',
    successSub: 'Objednávka byla vytvořena.',
    neueBestellung: 'Zadat další objednávku',
    dashboard: 'Zpět na přehled',
    errorRequired: 'Prosím vyplňte všechna povinná pole.',
    kunde: 'Zákazník',
    bestelldetails: 'Detaily objednávky',
    confirmKunde: 'Zákazník',
    confirmItems: 'Objednané položky',
    confirmTotal: 'Celková částka',
    confirmOrderDate: 'Datum objednávky',
    confirmDelivery: 'Požadovaný čas doručení',
    confirmAddress: 'Doručovací adresa',
    confirmPayment: 'Způsob platby',
    confirmNotes: 'Poznámky k doručení',
    noDeliveryTime: 'Nezadáno',
    noAddress: 'Adresa nezadána',
    noPayment: 'Nezadáno',
    noNotes: 'Žádné poznámky',
    stepNeedsKunde: 'Nejprve prosím vyberte zákazníka.',
    stepNeedsDetails: 'Nejprve prosím vyplňte detaily objednávky.',
    restart: 'Začít znovu',
  },
});

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function BestellungAufgebenPage() {
  const { kundenverwaltung, loading, error, fetchAll } = useDashboardData();

  // Step state
  const [step, setStep] = useState(1);

  // Step 1: Kunde selection
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creatingKunde, setCreatingKunde] = useState(false);

  // Step 2: Order details
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [orderDate, setOrderDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState('none');

  // Step 3: Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Derived: selected kunde object
  const selectedKunde: Kundenverwaltung | null =
    selectedKundeId ? (kundenverwaltung.find((k) => k.record_id === selectedKundeId) ?? null) : null;

  // Active customers only
  const activeKunden = kundenverwaltung.filter(
    (k) => k.fields.customer_status?.key === 'aktiv'
  );

  const handleCreateKunde = async () => {
    if (!newFirstName.trim() || !newLastName.trim()) return;
    setCreatingKunde(true);
    try {
      const created = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newFirstName.trim(),
        last_name: newLastName.trim(),
        email: newEmail.trim() || undefined,
        phone: newPhone.trim() || undefined,
        customer_status: 'aktiv',
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNewFirstName('');
      setNewLastName('');
      setNewEmail('');
      setNewPhone('');
      setSelectedKundeId(created.record_id);
      setStep(2);
    } finally {
      setCreatingKunde(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedKundeId || !orderedItems.trim() || !totalAmount || !orderDate) {
      setSubmitError(tt('errorRequired'));
      return;
    }

    // Idempotency guard: if we already created the order, don't create again
    if (createdOrderId) return;

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await LivingAppsService.createBestellverwaltungEntry({
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId),
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
        order_status: 'neu',
      });
      setCreatedOrderId(result.record_id);
      await fetchAll();
    } catch {
      setSubmitError('Fehler beim Speichern. Bitte erneut versuchen.');
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
    setSubmitError(null);
    setCreatedOrderId(null);
  };

  const selectedKundeName = selectedKunde
    ? `${selectedKunde.fields.first_name ?? ''} ${selectedKunde.fields.last_name ?? ''}`.trim()
    : '';

  const paymentLabel =
    paymentMethodKey !== 'none'
      ? (lookupLabel('bestellverwaltung', 'payment_method', paymentMethodKey) ?? paymentMethodKey)
      : null;

  const addressParts = [
    deliveryStreet,
    deliveryHouseNumber,
    deliveryPostalCode,
    deliveryCity,
  ].filter(Boolean);
  const fullAddress = addressParts.length > 0 ? addressParts.join(' ') : null;

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Select Kunde */}
      {step === 1 && (
        <EntitySelectStep
          items={activeKunden.map((k) => ({
            id: k.record_id,
            title: `${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || k.record_id,
            subtitle: [k.fields.email, k.fields.phone, k.fields.city].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={(id) => {
            setSelectedKundeId(id);
            setStep(2);
          }}
          searchPlaceholder={tt('searchKunde')}
          emptyText={tt('emptyKunden')}
          createLabel={tt('newKunde')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={
            showCreateKunde ? (
              <div className="rounded-2xl border p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <IconUserPlus size={18} className="text-primary" />
                  <span className="font-medium text-sm">{tt('newKunde')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{fieldLabel('kundenverwaltung', 'first_name')} *</Label>
                    <Input
                      value={newFirstName}
                      onChange={(e) => setNewFirstName(e.target.value)}
                      placeholder="Vorname" /* i18n-exempt */
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{fieldLabel('kundenverwaltung', 'last_name')} *</Label>
                    <Input
                      value={newLastName}
                      onChange={(e) => setNewLastName(e.target.value)}
                      placeholder="Nachname" /* i18n-exempt */
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{fieldLabel('kundenverwaltung', 'email')}</Label>
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder="E-Mail" /* i18n-exempt */
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{fieldLabel('kundenverwaltung', 'phone')}</Label>
                    <Input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder="Telefon" /* i18n-exempt */
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    disabled={!newFirstName.trim() || !newLastName.trim() || creatingKunde}
                    onClick={handleCreateKunde}
                    size="sm"
                  >
                    {creatingKunde ? '…' : tt('createKunde')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowCreateKunde(false)}
                  >
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : undefined
          }
        />
      )}

      {/* Step 2: Order details */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-6">
            {/* Selected customer context */}
            <div className="rounded-2xl border bg-secondary/40 px-4 py-3 flex items-center gap-3">
              <IconUser size={18} className="text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{tt('kundeLabel')}</p>
                <p className="font-medium truncate">{selectedKundeName}</p>
                {selectedKunde?.fields.email && (
                  <p className="text-xs text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                )}
              </div>
            </div>

            {/* Required fields */}
            <div className="space-y-4">
              <div className="space-y-1">
                <Label>{tt('orderedItems')} *</Label>
                <Textarea
                  value={orderedItems}
                  onChange={(e) => setOrderedItems(e.target.value)}
                  placeholder={tt('orderedItemsPlaceholder')}
                  rows={4}
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>{tt('totalAmount')} *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalAmount}
                    onChange={(e) => setTotalAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-1">
                  <Label>{tt('orderDate')} *</Label>
                  <Input
                    type="datetime-local"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label>{tt('desiredDelivery')}</Label>
                  <Input
                    type="datetime-local"
                    value={desiredDeliveryTime}
                    onChange={(e) => setDesiredDeliveryTime(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <Label>{tt('paymentMethod')}</Label>
                  <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={tt('paymentPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tt('paymentPlaceholder')}</SelectItem>
                      {PAYMENT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.key} value={opt.key}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {/* Delivery address */}
            <div className="space-y-3">
              <p className="font-medium text-sm">{tt('deliveryAddress')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{tt('deliveryStreet')}</Label>
                  <Input
                    value={deliveryStreet}
                    onChange={(e) => setDeliveryStreet(e.target.value)}
                    placeholder="Musterstraße" /* i18n-exempt */
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{tt('deliveryHouseNumber')}</Label>
                  <Input
                    value={deliveryHouseNumber}
                    onChange={(e) => setDeliveryHouseNumber(e.target.value)}
                    placeholder="12a"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{tt('deliveryPostalCode')}</Label>
                  <Input
                    value={deliveryPostalCode}
                    onChange={(e) => setDeliveryPostalCode(e.target.value)}
                    placeholder="12345"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{tt('deliveryCity')}</Label>
                  <Input
                    value={deliveryCity}
                    onChange={(e) => setDeliveryCity(e.target.value)}
                    placeholder="München" /* i18n-exempt */
                  />
                </div>
              </div>
            </div>

            {/* Delivery notes */}
            <div className="space-y-1">
              <Label>{tt('deliveryNotes')}</Label>
              <Textarea
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder={tt('deliveryNotesPlaceholder')}
                rows={3}
              />
            </div>

            {/* Navigation */}
            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('zurueck')}
              </Button>
              <Button
                disabled={!orderedItems.trim() || !totalAmount || !orderDate}
                onClick={() => setStep(3)}
              >
                {tt('weiter')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('stepNeedsKunde')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3: Confirm & submit */}
      {step === 3 && (
        selectedKundeId && orderedItems.trim() && totalAmount ? (
          createdOrderId ? (
            // Success state
            <div className="text-center py-12 space-y-6">
              <div className="flex justify-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <IconCheck size={32} className="text-primary" />
                </div>
              </div>
              <div className="space-y-1">
                <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
                <p className="text-sm text-muted-foreground">{tt('successSub')}</p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button onClick={handleReset}>
                  <IconShoppingCart size={16} className="mr-2" />
                  {tt('neueBestellung')}
                </Button>
                <Button variant="outline" asChild>
                  <a href="#/">{tt('dashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            // Confirmation summary
            <div className="space-y-6">
              <div className="rounded-2xl border overflow-hidden">
                <div className="bg-secondary/40 px-4 py-3">
                  <p className="font-medium text-sm">{tt('bestelldetails')}</p>
                </div>
                <div className="divide-y">
                  <SummaryRow label={tt('confirmKunde')} value={selectedKundeName} />
                  <SummaryRow label={tt('confirmItems')} value={orderedItems} multiline />
                  <SummaryRow
                    label={tt('confirmTotal')}
                    value={`${parseFloat(totalAmount).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}
                  />
                  <SummaryRow label={tt('confirmOrderDate')} value={orderDate.replace('T', ' ')} />
                  <SummaryRow
                    label={tt('confirmDelivery')}
                    value={desiredDeliveryTime ? desiredDeliveryTime.replace('T', ' ') : tt('noDeliveryTime')}
                  />
                  <SummaryRow
                    label={tt('confirmAddress')}
                    value={fullAddress ?? tt('noAddress')}
                  />
                  <SummaryRow
                    label={tt('confirmPayment')}
                    value={paymentLabel ?? tt('noPayment')}
                  />
                  <SummaryRow
                    label={tt('confirmNotes')}
                    value={deliveryNotes.trim() || tt('noNotes')}
                  />
                </div>
              </div>

              {submitError && (
                <p className="text-sm text-destructive">{submitError}</p>
              )}

              <div className="flex gap-3">
                <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                  {tt('zurueck')}
                </Button>
                <Button onClick={handleSubmit} disabled={submitting}>
                  <IconShoppingCart size={16} className="mr-2" />
                  {submitting ? tt('absendenLoading') : tt('absenden')}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('stepNeedsDetails')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}

function SummaryRow({
  label,
  value,
  multiline,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="px-4 py-3 flex gap-3">
      <span className="text-sm text-muted-foreground w-40 flex-shrink-0">{label}</span>
      <span className={`text-sm font-medium min-w-0 ${multiline ? 'whitespace-pre-wrap' : 'truncate'}`}>
        {value}
      </span>
    </div>
  );
}
