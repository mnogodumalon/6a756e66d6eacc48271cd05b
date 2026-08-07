/**
 * Neue Bestellung — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen (nur aktiv/inaktiv) → 2) Bestelldetails eingeben → 3) Fahrer zuweisen & Bestellung anlegen.
 * Reads: kundenverwaltung, fahrerverwaltung. Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import {
  IconUser,
  IconTruck,
  IconShoppingCart,
  IconCheck,
  IconMapPin,
} from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kundenverwaltung, Fahrerverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

// i18n strings
const makeT = (strings: Record<string, { de: string; en: string; cs: string }>) => {
  const lang = (document.documentElement.lang ?? 'de') as 'de' | 'en' | 'cs';
  return (key: string) => strings[key]?.[lang] ?? strings[key]?.de ?? key;
};

const STRINGS = {
  title: { de: 'Neue Bestellung', en: 'New Order', cs: 'Nová objednávka' },
  subtitle: { de: 'Bestellung in 3 Schritten anlegen', en: 'Create order in 3 steps', cs: 'Vytvořte objednávku ve 3 krocích' },
  step1: { de: 'Kunde', en: 'Customer', cs: 'Zákazník' },
  step2: { de: 'Details', en: 'Details', cs: 'Detaily' },
  step3: { de: 'Fahrer', en: 'Driver', cs: 'Řidič' },
  step4: { de: 'Fertig', en: 'Done', cs: 'Hotovo' },
  searchCustomer: { de: 'Kunde suchen …', en: 'Search customer …', cs: 'Hledat zákazníka …' },
  newCustomer: { de: 'Neuen Kunden anlegen', en: 'Create new customer', cs: 'Vytvořit nového zákazníka' },
  firstName: { de: 'Vorname', en: 'First name', cs: 'Jméno' },
  lastName: { de: 'Nachname', en: 'Last name', cs: 'Příjmení' },
  email: { de: 'E-Mail', en: 'E-Mail', cs: 'E-Mail' },
  phone: { de: 'Telefon', en: 'Phone', cs: 'Telefon' },
  create: { de: 'Anlegen', en: 'Create', cs: 'Vytvořit' },
  orderedItems: { de: 'Bestellte Artikel', en: 'Ordered items', cs: 'Objednané položky' },
  orderedItemsPlaceholder: { de: 'z. B. 2x Pizza Margherita, 1x Cola 0,5l …', en: 'e.g. 2x Pizza Margherita, 1x Cola 0.5l …', cs: 'např. 2x Pizza Margherita, 1x Cola 0,5l …' },
  totalAmount: { de: 'Gesamtbetrag (€)', en: 'Total amount (€)', cs: 'Celková částka (€)' },
  orderDate: { de: 'Bestelldatum', en: 'Order date', cs: 'Datum objednávky' },
  desiredDelivery: { de: 'Gewünschte Lieferzeit', en: 'Desired delivery time', cs: 'Požadovaný čas doručení' },
  paymentMethod: { de: 'Zahlungsart', en: 'Payment method', cs: 'Způsob platby' },
  paymentPlaceholder: { de: 'Zahlungsart wählen …', en: 'Select payment method …', cs: 'Vyberte způsob platby …' },
  deliveryAddress: { de: 'Lieferadresse', en: 'Delivery address', cs: 'Doručovací adresa' },
  street: { de: 'Straße', en: 'Street', cs: 'Ulice' },
  houseNumber: { de: 'Hausnummer', en: 'House no.', cs: 'Číslo popisné' },
  postalCode: { de: 'PLZ', en: 'Postal code', cs: 'PSČ' },
  city: { de: 'Stadt', en: 'City', cs: 'Město' },
  deliveryNotes: { de: 'Lieferhinweise', en: 'Delivery notes', cs: 'Poznámky k doručení' },
  deliveryNotesPlaceholder: { de: 'z. B. Klingel 2. OG, bitte klingeln …', en: 'e.g. ring 2nd floor …', cs: 'např. 2. patro, zazvoňte …' },
  toStep2: { de: 'Weiter zu Bestelldetails', en: 'Continue to order details', cs: 'Pokračovat k detailům objednávky' },
  toStep3: { de: 'Weiter zur Fahrerzuweisung', en: 'Continue to driver assignment', cs: 'Pokračovat k přiřazení řidiče' },
  searchDriver: { de: 'Fahrer suchen …', en: 'Search driver …', cs: 'Hledat řidiče …' },
  noDriver: { de: 'Ohne Fahrer fortfahren', en: 'Continue without driver', cs: 'Pokračovat bez řidiče' },
  submitOrder: { de: 'Bestellung anlegen', en: 'Create order', cs: 'Vytvořit objednávku' },
  orderSuccess: { de: 'Bestellung erfolgreich angelegt!', en: 'Order created successfully!', cs: 'Objednávka úspěšně vytvořena!' },
  newOrder: { de: 'Neue Bestellung anlegen', en: 'Create new order', cs: 'Vytvořit novou objednávku' },
  backDashboard: { de: 'Zurück zum Dashboard', en: 'Back to dashboard', cs: 'Zpět na přehled' },
  summary: { de: 'Zusammenfassung', en: 'Summary', cs: 'Přehled' },
  customer: { de: 'Kunde', en: 'Customer', cs: 'Zákazník' },
  amount: { de: 'Betrag', en: 'Amount', cs: 'Částka' },
  driver: { de: 'Fahrer', en: 'Driver', cs: 'Řidič' },
  noDriverSelected: { de: 'Kein Fahrer ausgewählt', en: 'No driver selected', cs: 'Žádný řidič nevybrán' },
  selectDriverOptional: { de: 'Fahrer auswählen (optional)', en: 'Select driver (optional)', cs: 'Vyberte řidiče (volitelné)' },
  stepMissing: { de: 'Dieser Schritt braucht die Auswahl aus einem vorherigen Schritt.', en: 'This step requires a selection from a previous step.', cs: 'Tento krok vyžaduje výběr z předchozího kroku.' },
  restart: { de: 'Neu starten', en: 'Restart', cs: 'Znovu začít' },
  submitting: { de: 'Wird angelegt …', en: 'Creating …', cs: 'Vytváří se …' },
  zone: { de: 'Zone', en: 'Zone', cs: 'Zóna' },
};

export default function NeueBestellungPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const tt = makeT(STRINGS);

  // Wizard step
  const [step, setStep] = useState(1);

  // Step 1 — Kunde
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
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
  const [paymentMethodKey, setPaymentMethodKey] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Step 3 — Fahrer & submit
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Derived: eligible Kunden (not gesperrt)
  const eligibleKunden = (kundenverwaltung as Kundenverwaltung[]).filter(
    k => k.fields.customer_status?.key !== 'gesperrt'
  );

  // Derived: available Fahrer
  const availableFahrer = (fahrerverwaltung as Fahrerverwaltung[]).filter(
    f => f.fields.driver_status?.key === 'verfuegbar'
  );

  // Selected Kunde record for prefill / summary
  const selectedKunde = selectedKundeId
    ? (kundenverwaltung as Kundenverwaltung[]).find(k => k.record_id === selectedKundeId) ?? null
    : null;

  // Selected Fahrer record for summary
  const selectedFahrer = selectedFahrerId
    ? (fahrerverwaltung as Fahrerverwaltung[]).find(f => f.record_id === selectedFahrerId) ?? null
    : null;

  // Handler: select Kunde and prefill address
  const handleSelectKunde = (id: string) => {
    setSelectedKundeId(id);
    const k = (kundenverwaltung as Kundenverwaltung[]).find(r => r.record_id === id);
    if (k) {
      setDeliveryStreet(k.fields.street ?? '');
      setDeliveryHouseNumber(k.fields.house_number ?? '');
      setDeliveryPostalCode(k.fields.postal_code ?? '');
      setDeliveryCity(k.fields.city ?? '');
    }
    setStep(2);
  };

  // Handler: create new Kunde
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

  // Handler: submit order
  const handleSubmitOrder = async () => {
    if (!selectedKundeId) return;
    setSubmitting(true);
    setSubmitError(null);
    // Idempotency guard: if already created, skip
    let orderId = createdOrderId;
    try {
      if (!orderId) {
        const result = await LivingAppsService.createBestellverwaltungEntry({
          kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId),
          fahrer: selectedFahrerId
            ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId)
            : undefined,
          order_status: 'neu',
          ordered_items: orderedItems.trim() || undefined,
          total_amount: totalAmount ? parseFloat(totalAmount) : undefined,
          order_date: orderDate || undefined,
          desired_delivery_time: desiredDeliveryTime || undefined,
          payment_method: paymentMethodKey !== 'none' && paymentMethodKey ? paymentMethodKey : undefined,
          delivery_street: deliveryStreet.trim() || undefined,
          delivery_house_number: deliveryHouseNumber.trim() || undefined,
          delivery_postal_code: deliveryPostalCode.trim() || undefined,
          delivery_city: deliveryCity.trim() || undefined,
          delivery_notes: deliveryNotes.trim() || undefined,
        });
        orderId = result.record_id;
        setCreatedOrderId(orderId);
      }
      await fetchAll();
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Reset wizard
  const handleReset = () => {
    setStep(1);
    setSelectedKundeId(null);
    setSelectedFahrerId(null);
    setOrderedItems('');
    setTotalAmount('');
    setOrderDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setDesiredDeliveryTime('');
    setPaymentMethodKey('');
    setDeliveryStreet('');
    setDeliveryHouseNumber('');
    setDeliveryPostalCode('');
    setDeliveryCity('');
    setDeliveryNotes('');
    setCreatedOrderId(null);
    setSubmitError(null);
    setShowCreateKunde(false);
  };

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
      {/* Step 1: Kunde auswählen */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleKunden.map(k => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.city, k.fields.phone].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectKunde}
          searchPlaceholder={tt('searchCustomer')}
          createLabel={tt('newCustomer')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={
            showCreateKunde ? (
              <div className="rounded-2xl border p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{tt('firstName')} *</Label>
                    <Input
                      value={newFirstName}
                      onChange={e => setNewFirstName(e.target.value)}
                      placeholder={tt('firstName')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tt('lastName')} *</Label>
                    <Input
                      value={newLastName}
                      onChange={e => setNewLastName(e.target.value)}
                      placeholder={tt('lastName')}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label>{tt('email')}</Label>
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder="name@example.com" /* i18n-exempt */
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>{tt('phone')}</Label>
                    <Input
                      type="tel"
                      value={newPhone}
                      onChange={e => setNewPhone(e.target.value)}
                      placeholder="+49 …"
                    />
                  </div>
                </div>
                <div className="flex gap-2 pt-1">
                  <Button
                    disabled={!newFirstName.trim() || !newLastName.trim() || creatingKunde}
                    onClick={handleCreateKunde}
                  >
                    {creatingKunde ? '…' : tt('create')}
                  </Button>
                  <Button variant="outline" onClick={() => setShowCreateKunde(false)}>
                    Abbrechen
                  </Button>
                </div>
              </div>
            ) : undefined
          }
        />
      )}

      {/* Step 2: Bestelldetails */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-5 max-w-2xl">
            {/* Ordered items */}
            <div className="space-y-1">
              <Label htmlFor="ordered_items">{tt('orderedItems')} *</Label>
              <textarea
                id="ordered_items"
                className="w-full min-h-[90px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                placeholder={tt('orderedItemsPlaceholder')}
                value={orderedItems}
                onChange={e => setOrderedItems(e.target.value)}
              />
            </div>

            {/* Amount + payment */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="total_amount">{tt('totalAmount')} *</Label>
                <Input
                  id="total_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-1">
                <Label>{tt('paymentMethod')}</Label>
                <Select
                  value={paymentMethodKey || 'none'}
                  onValueChange={v => setPaymentMethodKey(v === 'none' ? '' : v)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tt('paymentPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tt('paymentPlaceholder')}</SelectItem>
                    {PAYMENT_OPTIONS.map(o => (
                      <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="order_date">{tt('orderDate')} *</Label>
                <Input
                  id="order_date"
                  type="datetime-local"
                  value={orderDate}
                  onChange={e => setOrderDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="desired_delivery">{tt('desiredDelivery')}</Label>
                <Input
                  id="desired_delivery"
                  type="datetime-local"
                  value={desiredDeliveryTime}
                  onChange={e => setDesiredDeliveryTime(e.target.value)}
                />
              </div>
            </div>

            {/* Delivery address */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-sm font-medium">
                <IconMapPin size={16} className="text-primary" />
                {tt('deliveryAddress')}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2 space-y-1">
                  <Label htmlFor="delivery_street">{tt('street')}</Label>
                  <Input
                    id="delivery_street"
                    value={deliveryStreet}
                    onChange={e => setDeliveryStreet(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="delivery_house">{tt('houseNumber')}</Label>
                  <Input
                    id="delivery_house"
                    value={deliveryHouseNumber}
                    onChange={e => setDeliveryHouseNumber(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="delivery_plz">{tt('postalCode')}</Label>
                  <Input
                    id="delivery_plz"
                    value={deliveryPostalCode}
                    onChange={e => setDeliveryPostalCode(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="delivery_city">{tt('city')}</Label>
                  <Input
                    id="delivery_city"
                    value={deliveryCity}
                    onChange={e => setDeliveryCity(e.target.value)}
                  />
                </div>
              </div>
            </div>

            {/* Delivery notes */}
            <div className="space-y-1">
              <Label htmlFor="delivery_notes">{tt('deliveryNotes')}</Label>
              <textarea
                id="delivery_notes"
                className="w-full min-h-[70px] rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                placeholder={tt('deliveryNotesPlaceholder')}
                value={deliveryNotes}
                onChange={e => setDeliveryNotes(e.target.value)}
              />
            </div>

            <Button
              className="w-full sm:w-auto"
              disabled={!orderedItems.trim() || !totalAmount || !orderDate}
              onClick={() => setStep(3)}
            >
              {tt('toStep3')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('stepMissing')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3: Fahrer zuweisen & bestellen */}
      {step === 3 && (
        selectedKundeId ? (
          <div className="space-y-6">
            {/* Live summary card */}
            <div className="rounded-2xl border bg-card p-4 space-y-2">
              <p className="text-sm font-semibold">{tt('summary')}</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <span className="text-muted-foreground">{tt('customer')}</span>
                <span className="font-medium truncate">
                  {selectedKunde
                    ? [selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')
                    : selectedKundeId}
                </span>
                <span className="text-muted-foreground">{tt('amount')}</span>
                <span className="font-medium">
                  {totalAmount ? `${parseFloat(totalAmount).toFixed(2)} €` : '—'}
                </span>
                <span className="text-muted-foreground">{tt('driver')}</span>
                <span className="font-medium truncate">
                  {selectedFahrer
                    ? [selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name].filter(Boolean).join(' ')
                    : tt('noDriverSelected')}
                </span>
              </div>
            </div>

            {/* Driver selection */}
            <div className="space-y-2">
              <p className="text-sm font-medium">{tt('selectDriverOptional')}</p>
              <EntitySelectStep
                items={availableFahrer.map(f => ({
                  id: f.record_id,
                  title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || f.record_id,
                  subtitle: [
                    f.fields.vehicle_type?.label,
                    f.fields.delivery_zone ? `${tt('zone')}: ${f.fields.delivery_zone}` : null,
                  ].filter(Boolean).join(' · '),
                  status: f.fields.driver_status
                    ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                    : undefined,
                  icon: <IconTruck size={20} className="text-primary" />,
                }))}
                onSelect={id => setSelectedFahrerId(id === selectedFahrerId ? null : id)}
                searchPlaceholder={tt('searchDriver')}
              />
            </div>

            {submitError && (
              <p className="text-sm text-destructive rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2">
                {submitError}
              </p>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleSubmitOrder}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                <IconShoppingCart size={16} className="mr-1.5" />
                {submitting ? tt('submitting') : tt('submitOrder')}
              </Button>
              {!selectedFahrerId && (
                <Button
                  variant="outline"
                  onClick={handleSubmitOrder}
                  disabled={submitting}
                  className="w-full sm:w-auto"
                >
                  {submitting ? tt('submitting') : tt('noDriver')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('stepMissing')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 4: Erfolg */}
      {step === 4 && (
        <div className="text-center py-12 space-y-5">
          <div className="mx-auto w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <IconCheck size={28} className="text-primary" />
          </div>
          <p className="text-lg font-semibold">{tt('orderSuccess')}</p>
          {selectedKunde && (
            <p className="text-sm text-muted-foreground">
              {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
              {totalAmount ? ` · ${parseFloat(totalAmount).toFixed(2)} €` : ''}
            </p>
          )}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button onClick={handleReset}>
              {tt('newOrder')}
            </Button>
            <a href="#/">
              <Button variant="outline" className="w-full">{tt('backDashboard')}</Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
