/**
 * Neue Bestellung — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen → 2) Bestelldetails erfassen → 3) Zusammenfassung & Speichern.
 * Reads: kundenverwaltung. Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kundenverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
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
  IconShoppingCart,
  IconCheck,
  IconPlus,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    pageTitle: 'Neue Bestellung',
    subtitle: 'Bestellung in 3 Schritten anlegen',
    step1: 'Kunde',
    step2: 'Details',
    step3: 'Bestätigen',
    selectCustomer: 'Kunde auswählen',
    searchCustomer: 'Kunden suchen...',
    newCustomer: 'Neuen Kunden anlegen',
    firstNamePlaceholder: 'Vorname',
    lastNamePlaceholder: 'Nachname',
    emailPlaceholder: 'E-Mail',
    phonePlaceholder: 'Telefon',
    createCustomer: 'Kunden anlegen',
    detailsTitle: 'Bestelldetails',
    orderedItems: 'Bestellte Artikel',
    orderedItemsPlaceholder: 'z.B. 2x Pizza Margherita, 1x Cola',
    totalAmount: 'Gesamtbetrag (€)',
    orderDate: 'Bestelldatum/-zeit',
    desiredDelivery: 'Gewünschte Lieferzeit',
    paymentMethod: 'Zahlungsart',
    paymentPlaceholder: 'Zahlungsart wählen...',
    deliveryAddress: 'Lieferadresse',
    street: 'Straße',
    houseNumber: 'Hausnummer',
    postalCode: 'Postleitzahl',
    city: 'Stadt',
    deliveryNotes: 'Lieferhinweise',
    deliveryNotesPlaceholder: 'z.B. Bitte klingeln bei...',
    nextStep: 'Weiter zu Schritt',
    back: 'Zurück',
    summaryTitle: 'Bestellübersicht',
    customer: 'Kunde',
    orderDetails: 'Bestelldetails',
    confirmOrder: 'Bestellung anlegen',
    submitting: 'Wird gespeichert...',
    successTitle: 'Bestellung erfolgreich angelegt!',
    newOrder: 'Neue Bestellung anlegen',
    backToDashboard: 'Zurück zum Dashboard',
    noItems: 'Bitte Bestellartikel eingeben.',
    noAmount: 'Bitte Gesamtbetrag eingeben.',
    noDate: 'Bitte Bestelldatum eingeben.',
    noCustomer: 'Bitte zuerst einen Kunden auswählen.',
    errorPrefix: 'Fehler',
    prefillNote: 'Adresse aus Kundendaten übernommen.',
  },
  en: {
    pageTitle: 'New Order',
    subtitle: 'Create an order in 3 steps',
    step1: 'Customer',
    step2: 'Details',
    step3: 'Confirm',
    selectCustomer: 'Select customer',
    searchCustomer: 'Search customers...',
    newCustomer: 'Create new customer',
    firstNamePlaceholder: 'First name',
    lastNamePlaceholder: 'Last name',
    emailPlaceholder: 'E-mail',
    phonePlaceholder: 'Phone',
    createCustomer: 'Create customer',
    detailsTitle: 'Order details',
    orderedItems: 'Ordered items',
    orderedItemsPlaceholder: 'e.g. 2x Pizza Margherita, 1x Cola',
    totalAmount: 'Total amount (€)',
    orderDate: 'Order date/time',
    desiredDelivery: 'Desired delivery time',
    paymentMethod: 'Payment method',
    paymentPlaceholder: 'Select payment method...',
    deliveryAddress: 'Delivery address',
    street: 'Street',
    houseNumber: 'House number',
    postalCode: 'Postal code',
    city: 'City',
    deliveryNotes: 'Delivery notes',
    deliveryNotesPlaceholder: 'e.g. Please ring doorbell...',
    nextStep: 'Next step',
    back: 'Back',
    summaryTitle: 'Order summary',
    customer: 'Customer',
    orderDetails: 'Order details',
    confirmOrder: 'Create order',
    submitting: 'Saving...',
    successTitle: 'Order created successfully!',
    newOrder: 'Create new order',
    backToDashboard: 'Back to dashboard',
    noItems: 'Please enter ordered items.',
    noAmount: 'Please enter total amount.',
    noDate: 'Please enter order date.',
    noCustomer: 'Please select a customer first.',
    errorPrefix: 'Error',
    prefillNote: 'Address pre-filled from customer data.',
  },
  cs: {
    pageTitle: 'Nová objednávka',
    subtitle: 'Vytvořte objednávku ve 3 krocích',
    step1: 'Zákazník',
    step2: 'Detaily',
    step3: 'Potvrdit',
    selectCustomer: 'Vybrat zákazníka',
    searchCustomer: 'Hledat zákazníky...',
    newCustomer: 'Vytvořit nového zákazníka',
    firstNamePlaceholder: 'Jméno',
    lastNamePlaceholder: 'Příjmení',
    emailPlaceholder: 'E-mail',
    phonePlaceholder: 'Telefon',
    createCustomer: 'Vytvořit zákazníka',
    detailsTitle: 'Detaily objednávky',
    orderedItems: 'Objednané položky',
    orderedItemsPlaceholder: 'např. 2x Pizza Margherita, 1x Cola',
    totalAmount: 'Celková částka (€)',
    orderDate: 'Datum/čas objednávky',
    desiredDelivery: 'Požadovaný čas doručení',
    paymentMethod: 'Způsob platby',
    paymentPlaceholder: 'Vyberte způsob platby...',
    deliveryAddress: 'Doručovací adresa',
    street: 'Ulice',
    houseNumber: 'Číslo domu',
    postalCode: 'PSČ',
    city: 'Město',
    deliveryNotes: 'Poznámky k doručení',
    deliveryNotesPlaceholder: 'např. Prosím zazvoňte...',
    nextStep: 'Další krok',
    back: 'Zpět',
    summaryTitle: 'Přehled objednávky',
    customer: 'Zákazník',
    orderDetails: 'Detaily objednávky',
    confirmOrder: 'Vytvořit objednávku',
    submitting: 'Ukládám...',
    successTitle: 'Objednávka úspěšně vytvořena!',
    newOrder: 'Vytvořit novou objednávku',
    backToDashboard: 'Zpět na přehled',
    noItems: 'Prosím zadejte objednané položky.',
    noAmount: 'Prosím zadejte celkovou částku.',
    noDate: 'Prosím zadejte datum objednávky.',
    noCustomer: 'Prosím nejprve vyberte zákazníka.',
    errorPrefix: 'Chyba',
    prefillNote: 'Adresa předvyplněna z dat zákazníka.',
  },
});

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function NeueBestellungPage() {
  const { kundenverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1 — Kunde
  const [selectedKunde, setSelectedKunde] = useState<Kundenverwaltung | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
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

  // Step 3 — Submission
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Eligible customers: exclude 'gesperrt'
  const eligibleKunden = kundenverwaltung.filter(
    k => k.fields.customer_status?.key !== 'gesperrt'
  );

  const handleSelectKunde = (id: string) => {
    const kunde = kundenverwaltung.find(k => k.record_id === id) ?? null;
    setSelectedKunde(kunde);
    if (kunde) {
      // Prefill delivery address from customer
      setDeliveryStreet(kunde.fields.street ?? '');
      setDeliveryHouseNumber(kunde.fields.house_number ?? '');
      setDeliveryPostalCode(kunde.fields.postal_code ?? '');
      setDeliveryCity(kunde.fields.city ?? '');
    }
    setStep(2);
  };

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
      handleSelectKunde(created.record_id);
    } finally {
      setCreatingKunde(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (!selectedKunde) return;
    if (createdOrderId) return; // idempotency guard

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await LivingAppsService.createBestellverwaltungEntry({
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id),
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
        order_status: 'neu',
      });
      setCreatedOrderId(result.record_id);
      await fetchAll();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKunde(null);
    setShowCreateKunde(false);
    setNewFirstName('');
    setNewLastName('');
    setNewEmail('');
    setNewPhone('');
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
    setSubmitError(null);
    setCreatedOrderId(null);
  };

  const step2Valid = orderedItems.trim().length > 0 && totalAmount.trim().length > 0 && orderDate.length > 0;

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Kunde auswählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleKunden.map(k => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.city].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectKunde}
          searchPlaceholder={tt('searchCustomer')}
          createLabel={tt('newCustomer')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={showCreateKunde && (
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{tt('firstNamePlaceholder')} *</Label>
                  <Input
                    value={newFirstName}
                    onChange={e => setNewFirstName(e.target.value)}
                    placeholder={tt('firstNamePlaceholder')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tt('lastNamePlaceholder')} *</Label>
                  <Input
                    value={newLastName}
                    onChange={e => setNewLastName(e.target.value)}
                    placeholder={tt('lastNamePlaceholder')}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>{tt('emailPlaceholder')}</Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  placeholder={tt('emailPlaceholder')}
                />
              </div>
              <div className="space-y-1">
                <Label>{tt('phonePlaceholder')}</Label>
                <Input
                  value={newPhone}
                  onChange={e => setNewPhone(e.target.value)}
                  placeholder={tt('phonePlaceholder')}
                />
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={!newFirstName.trim() || !newLastName.trim() || creatingKunde}
                  onClick={handleCreateKunde}
                  className="flex-1"
                >
                  <IconPlus size={16} stroke={2} className="mr-1" />
                  {creatingKunde ? '...' : tt('createCustomer')}
                </Button>
                <Button variant="outline" onClick={() => setShowCreateKunde(false)}>
                  {tt('back')}
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* ── Step 2: Bestelldetails ── */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-6">
            {/* Selected customer context */}
            <div className="rounded-2xl border bg-card p-4 flex items-start gap-3">
              <IconUser size={20} className="text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </p>
                {selectedKunde.fields.email && (
                  <p className="text-sm text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                )}
                {selectedKunde.fields.customer_status && (
                  <StatusBadge
                    statusKey={selectedKunde.fields.customer_status.key}
                    label={selectedKunde.fields.customer_status.label}
                  />
                )}
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <h3 className="font-semibold text-base">{tt('detailsTitle')}</h3>

              <div className="space-y-1">
                <Label>{tt('orderedItems')} *</Label>
                <Textarea
                  value={orderedItems}
                  onChange={e => setOrderedItems(e.target.value)}
                  placeholder={tt('orderedItemsPlaceholder')}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="space-y-1">
                <Label>{tt('totalAmount')} *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{tt('orderDate')} *</Label>
                  <Input
                    type="datetime-local"
                    value={orderDate}
                    onChange={e => setOrderDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tt('desiredDelivery')}</Label>
                  <Input
                    type="datetime-local"
                    value={desiredDeliveryTime}
                    onChange={e => setDesiredDeliveryTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>{tt('paymentMethod')}</Label>
                <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tt('paymentPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tt('paymentPlaceholder')}</SelectItem>
                    {PAYMENT_OPTIONS.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Delivery address */}
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <h3 className="font-semibold text-base">{tt('deliveryAddress')}</h3>
              {(selectedKunde.fields.street || selectedKunde.fields.city) && (
                <p className="text-xs text-muted-foreground">{tt('prefillNote')}</p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label>{tt('street')}</Label>
                  <Input
                    value={deliveryStreet}
                    onChange={e => setDeliveryStreet(e.target.value)}
                    placeholder={tt('street')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tt('houseNumber')}</Label>
                  <Input
                    value={deliveryHouseNumber}
                    onChange={e => setDeliveryHouseNumber(e.target.value)}
                    placeholder={tt('houseNumber')}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{tt('postalCode')}</Label>
                  <Input
                    value={deliveryPostalCode}
                    onChange={e => setDeliveryPostalCode(e.target.value)}
                    placeholder={tt('postalCode')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tt('city')}</Label>
                  <Input
                    value={deliveryCity}
                    onChange={e => setDeliveryCity(e.target.value)}
                    placeholder={tt('city')}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label>{tt('deliveryNotes')}</Label>
                <Textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={tt('deliveryNotesPlaceholder')}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setStep(1)}>{tt('back')}</Button>
              <Button
                className="flex-1"
                disabled={!step2Valid}
                onClick={() => setStep(3)}
              >
                {tt('nextStep')} 3
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noCustomer')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('back')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Zusammenfassung & Speichern ── */}
      {step === 3 && (
        selectedKunde && orderedItems ? (
          createdOrderId ? (
            /* Success state */
            <div className="text-center py-12 space-y-4">
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <IconCheck size={28} className="text-primary" stroke={2} />
              </div>
              <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button onClick={handleReset} variant="outline">
                  <IconShoppingCart size={16} stroke={2} className="mr-2" />
                  {tt('newOrder')}
                </Button>
                <Button asChild>
                  <a href="#/">{tt('backToDashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            /* Summary + confirm */
            <div className="space-y-6">
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <h3 className="font-semibold text-base">{tt('customer')}</h3>
                <div className="flex items-center gap-3">
                  <IconUser size={18} className="text-primary shrink-0" />
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                    </p>
                    {selectedKunde.fields.email && (
                      <p className="text-sm text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <h3 className="font-semibold text-base">{tt('orderDetails')}</h3>
                <dl className="space-y-2 text-sm">
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground min-w-[130px] shrink-0">{tt('orderedItems')}:</dt>
                    <dd className="font-medium break-words">{orderedItems}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground min-w-[130px] shrink-0">{tt('totalAmount')}:</dt>
                    <dd className="font-medium">{parseFloat(totalAmount).toFixed(2)} €</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground min-w-[130px] shrink-0">{tt('orderDate')}:</dt>
                    <dd className="font-medium">{orderDate}</dd>
                  </div>
                  {desiredDeliveryTime && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground min-w-[130px] shrink-0">{tt('desiredDelivery')}:</dt>
                      <dd className="font-medium">{desiredDeliveryTime}</dd>
                    </div>
                  )}
                  {paymentMethodKey !== 'none' && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground min-w-[130px] shrink-0">{tt('paymentMethod')}:</dt>
                      <dd className="font-medium">
                        {PAYMENT_OPTIONS.find(o => o.key === paymentMethodKey)?.label ?? paymentMethodKey}
                      </dd>
                    </div>
                  )}
                  {(deliveryStreet || deliveryCity) && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground min-w-[130px] shrink-0">{tt('deliveryAddress')}:</dt>
                      <dd className="font-medium">
                        {[deliveryStreet, deliveryHouseNumber].filter(Boolean).join(' ')}
                        {(deliveryPostalCode || deliveryCity) && (
                          <>, {[deliveryPostalCode, deliveryCity].filter(Boolean).join(' ')}</>
                        )}
                      </dd>
                    </div>
                  )}
                  {deliveryNotes && (
                    <div className="flex gap-2">
                      <dt className="text-muted-foreground min-w-[130px] shrink-0">{tt('deliveryNotes')}:</dt>
                      <dd className="font-medium">{deliveryNotes}</dd>
                    </div>
                  )}
                </dl>
              </div>

              {submitError && (
                <p className="text-sm text-destructive rounded-lg bg-destructive/10 px-3 py-2">
                  {tt('errorPrefix')}: {submitError}
                </p>
              )}

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                  {tt('back')}
                </Button>
                <Button className="flex-1" onClick={handleSubmitOrder} disabled={submitting}>
                  <IconCheck size={16} stroke={2} className="mr-2" />
                  {submitting ? tt('submitting') : tt('confirmOrder')}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('noCustomer')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('back')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
