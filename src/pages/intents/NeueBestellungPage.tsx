/**
 * Neue Bestellung — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen (nur aktive Kunden) → 2) Bestelldetails erfassen →
 *        3) Fahrer zuweisen (optional) & Bestellung anlegen.
 * Reads: kundenverwaltung (filter: customer_status='aktiv'), fahrerverwaltung (filter: driver_status='verfuegbar').
 * Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import {
  IconUser,
  IconTruck,
  IconCheck,
  IconShoppingCart,
  IconMapPin,
  IconCreditCard,
  IconAlertCircle,
} from '@tabler/icons-react';
import { makeT } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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

// ── i18n ─────────────────────────────────────────────────────────────────────
const tt = makeT({
  de: {
    pageTitle: 'Neue Bestellung',
    subtitle: 'Schritt für Schritt zur fertigen Bestellung',
    stepKunde: 'Kunde',
    stepDetails: 'Bestelldetails',
    stepFahrer: 'Fahrer',
    stepConfirm: 'Fertig',
    searchKunde: 'Kunde suchen …',
    emptyKunde: 'Keine aktiven Kunden gefunden',
    neuerKunde: 'Neuen Kunden anlegen',
    neuerKundeForm: 'Schnellerfassung Neukunde',
    firstName: 'Vorname',
    lastName: 'Nachname',
    email: 'E-Mail',
    phone: 'Telefon',
    anlegen: 'Anlegen',
    weiterDetails: 'Weiter zu Bestelldetails',
    orderedItems: 'Bestellte Artikel',
    orderedItemsPlaceholder: 'z. B. 2× Pizza Margherita, 1× Cola …',
    totalAmount: 'Gesamtbetrag (€)',
    orderDate: 'Bestelldatum & -uhrzeit',
    desiredDelivery: 'Gewünschte Lieferzeit',
    deliveryAddress: 'Lieferadresse',
    street: 'Straße',
    houseNumber: 'Hausnummer',
    postalCode: 'Postleitzahl',
    city: 'Stadt',
    paymentMethod: 'Zahlungsart',
    paymentPlaceholder: 'Zahlungsart wählen',
    deliveryNotes: 'Lieferhinweise',
    deliveryNotesPlaceholder: 'z. B. 2. Stock, Türcode 1234 …',
    weiterFahrer: 'Weiter zu Fahrerzuweisung',
    searchFahrer: 'Fahrer suchen …',
    emptyFahrer: 'Kein verfügbarer Fahrer gefunden',
    ohnefahrer: 'Ohne Fahrer bestellen',
    bestellungAnlegen: 'Bestellung anlegen',
    successTitle: 'Bestellung erfolgreich angelegt!',
    successDesc: 'Die Bestellung wurde gespeichert.',
    neueBestellung: 'Neue Bestellung anlegen',
    backToDashboard: 'Zurück zum Dashboard',
    requireKunde: 'Bitte zuerst einen Kunden auswählen.',
    neuStart: 'Neu starten',
    thisStepNeedsKunde: 'Dieser Schritt benötigt einen ausgewählten Kunden.',
    thisStepNeedsDetails: 'Dieser Schritt benötigt die Bestelldetails.',
    errorSaving: 'Fehler beim Speichern der Bestellung.',
    driverLabel: 'Kein Fahrer (Bestellung ohne Fahrerzuweisung)',
    confirmKunde: 'Kunde',
    confirmItems: 'Artikel',
    confirmAmount: 'Betrag',
    confirmPayment: 'Zahlung',
    confirmDelivery: 'Lieferzeit',
    confirmFahrer: 'Fahrer',
    keinFahrer: 'Nicht zugewiesen',
  },
  en: {
    pageTitle: 'New Order',
    subtitle: 'Step by step to a completed order',
    stepKunde: 'Customer',
    stepDetails: 'Order details',
    stepFahrer: 'Driver',
    stepConfirm: 'Done',
    searchKunde: 'Search customer …',
    emptyKunde: 'No active customers found',
    neuerKunde: 'Add new customer',
    neuerKundeForm: 'Quick new customer',
    firstName: 'First name',
    lastName: 'Last name',
    email: 'Email',
    phone: 'Phone',
    anlegen: 'Create',
    weiterDetails: 'Continue to order details',
    orderedItems: 'Ordered items',
    orderedItemsPlaceholder: 'e.g. 2× Pizza Margherita, 1× Cola …',
    totalAmount: 'Total amount (€)',
    orderDate: 'Order date & time',
    desiredDelivery: 'Desired delivery time',
    deliveryAddress: 'Delivery address',
    street: 'Street',
    houseNumber: 'House number',
    postalCode: 'Postal code',
    city: 'City',
    paymentMethod: 'Payment method',
    paymentPlaceholder: 'Select payment method',
    deliveryNotes: 'Delivery notes',
    deliveryNotesPlaceholder: 'e.g. 2nd floor, door code 1234 …',
    weiterFahrer: 'Continue to driver assignment',
    searchFahrer: 'Search driver …',
    emptyFahrer: 'No available driver found',
    ohnefahrer: 'Order without driver',
    bestellungAnlegen: 'Create order',
    successTitle: 'Order created successfully!',
    successDesc: 'The order has been saved.',
    neueBestellung: 'Create new order',
    backToDashboard: 'Back to dashboard',
    requireKunde: 'Please select a customer first.',
    neuStart: 'Restart',
    thisStepNeedsKunde: 'This step requires a selected customer.',
    thisStepNeedsDetails: 'This step requires the order details.',
    errorSaving: 'Error saving the order.',
    driverLabel: 'No driver (order without driver assignment)',
    confirmKunde: 'Customer',
    confirmItems: 'Items',
    confirmAmount: 'Amount',
    confirmPayment: 'Payment',
    confirmDelivery: 'Delivery time',
    confirmFahrer: 'Driver',
    keinFahrer: 'Not assigned',
  },
  cs: {
    pageTitle: 'Nová objednávka',
    subtitle: 'Krok za krokem k hotové objednávce',
    stepKunde: 'Zákazník',
    stepDetails: 'Detaily objednávky',
    stepFahrer: 'Řidič',
    stepConfirm: 'Hotovo',
    searchKunde: 'Hledat zákazníka …',
    emptyKunde: 'Žádní aktivní zákazníci',
    neuerKunde: 'Přidat nového zákazníka',
    neuerKundeForm: 'Rychlé přidání zákazníka',
    firstName: 'Jméno',
    lastName: 'Příjmení',
    email: 'E-mail',
    phone: 'Telefon',
    anlegen: 'Vytvořit',
    weiterDetails: 'Pokračovat na detaily objednávky',
    orderedItems: 'Objednané položky',
    orderedItemsPlaceholder: 'např. 2× Pizza Margherita, 1× Cola …',
    totalAmount: 'Celková částka (€)',
    orderDate: 'Datum a čas objednávky',
    desiredDelivery: 'Požadovaný čas doručení',
    deliveryAddress: 'Adresa doručení',
    street: 'Ulice',
    houseNumber: 'Číslo popisné',
    postalCode: 'PSČ',
    city: 'Město',
    paymentMethod: 'Způsob platby',
    paymentPlaceholder: 'Vyberte způsob platby',
    deliveryNotes: 'Poznámky k doručení',
    deliveryNotesPlaceholder: 'např. 2. patro, kód dveří 1234 …',
    weiterFahrer: 'Pokračovat na přiřazení řidiče',
    searchFahrer: 'Hledat řidiče …',
    emptyFahrer: 'Žádný dostupný řidič',
    ohnefahrer: 'Objednat bez řidiče',
    bestellungAnlegen: 'Vytvořit objednávku',
    successTitle: 'Objednávka úspěšně vytvořena!',
    successDesc: 'Objednávka byla uložena.',
    neueBestellung: 'Vytvořit novou objednávku',
    backToDashboard: 'Zpět na přehled',
    requireKunde: 'Nejprve vyberte zákazníka.',
    neuStart: 'Začít znovu',
    thisStepNeedsKunde: 'Tento krok vyžaduje vybraného zákazníka.',
    thisStepNeedsDetails: 'Tento krok vyžaduje detaily objednávky.',
    errorSaving: 'Chyba při ukládání objednávky.',
    driverLabel: 'Žádný řidič (objednávka bez přiřazení)',
    confirmKunde: 'Zákazník',
    confirmItems: 'Položky',
    confirmAmount: 'Částka',
    confirmPayment: 'Platba',
    confirmDelivery: 'Čas doručení',
    confirmFahrer: 'Řidič',
    keinFahrer: 'Nepřiřazen',
  },
});

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function NeueBestellungPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  // Step state
  const [step, setStep] = useState(1);

  // Step 1 — Kunde
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');

  // Step 2 — Bestelldetails
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [orderDate, setOrderDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Step 3 — Fahrer
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);

  // Saving
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Derived data
  const aktiveKunden = (kundenverwaltung as Kundenverwaltung[]).filter(
    (k) => k.fields.customer_status?.key === 'aktiv'
  );

  const verfuegbareFahrer = (fahrerverwaltung as Fahrerverwaltung[]).filter(
    (f) => f.fields.driver_status?.key === 'verfuegbar'
  );

  const selectedKunde = aktiveKunden.find((k) => k.record_id === selectedKundeId) ?? null;
  const selectedFahrer = verfuegbareFahrer.find((f) => f.record_id === selectedFahrerId) ?? null;

  // When a customer is selected, prefill delivery address from their data
  const handleSelectKunde = (id: string) => {
    setSelectedKundeId(id);
    const k = aktiveKunden.find((c) => c.record_id === id);
    if (k) {
      setDeliveryStreet(k.fields.street ?? '');
      setDeliveryHouseNumber(k.fields.house_number ?? '');
      setDeliveryPostalCode(k.fields.postal_code ?? '');
      setDeliveryCity(k.fields.city ?? '');
    }
    setStep(2);
  };

  const handleCreateKunde = async () => {
    if (!newFirstName.trim() || !newLastName.trim()) return;
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
  };

  const handleSubmitOrder = async (fahrerId: string | null) => {
    if (!selectedKundeId) return;
    if (createdOrderId) return; // idempotency: already created

    setSaving(true);
    setSaveError(null);
    try {
      const result = await LivingAppsService.createBestellverwaltungEntry({
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId),
        fahrer: fahrerId
          ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, fahrerId)
          : undefined,
        ordered_items: orderedItems,
        total_amount: totalAmount ? parseFloat(totalAmount) : undefined,
        order_date: orderDate,
        desired_delivery_time: desiredDeliveryTime || undefined,
        delivery_street: deliveryStreet || undefined,
        delivery_house_number: deliveryHouseNumber || undefined,
        delivery_postal_code: deliveryPostalCode || undefined,
        delivery_city: deliveryCity || undefined,
        payment_method: paymentMethodKey && paymentMethodKey !== 'none' ? paymentMethodKey : undefined,
        delivery_notes: deliveryNotes || undefined,
        order_status: 'neu',
      });
      setCreatedOrderId(result.record_id);
      setStep(4);
    } catch {
      setSaveError(tt('errorSaving'));
    } finally {
      setSaving(false);
    }
  };

  const handleSelectFahrerAndSubmit = (id: string) => {
    setSelectedFahrerId(id);
    handleSubmitOrder(id);
  };

  const handleOhneFahrer = () => {
    setSelectedFahrerId(null);
    handleSubmitOrder(null);
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
    setPaymentMethodKey('');
    setDeliveryNotes('');
    setSelectedFahrerId(null);
    setCreatedOrderId(null);
    setSaveError(null);
  };

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('stepKunde') },
        { label: tt('stepDetails') },
        { label: tt('stepFahrer') },
        { label: tt('stepConfirm') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Kunde auswählen ──────────────────────────────────────── */}
      {step === 1 && (
        <EntitySelectStep
          items={aktiveKunden.map((k) => ({
            id: k.record_id,
            title: `${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || k.record_id,
            subtitle: [k.fields.email, k.fields.city].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectKunde}
          searchPlaceholder={tt('searchKunde')}
          emptyText={tt('emptyKunde')}
          createLabel={tt('neuerKunde')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={
            showCreateKunde ? (
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <p className="text-sm font-medium">{tt('neuerKundeForm')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">{tt('firstName')}</Label>
                    <Input
                      value={newFirstName}
                      onChange={(e) => setNewFirstName(e.target.value)}
                      placeholder={tt('firstName')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tt('lastName')}</Label>
                    <Input
                      value={newLastName}
                      onChange={(e) => setNewLastName(e.target.value)}
                      placeholder={tt('lastName')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tt('email')}</Label>
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={(e) => setNewEmail(e.target.value)}
                      placeholder={tt('email')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tt('phone')}</Label>
                    <Input
                      type="tel"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      placeholder={tt('phone')}
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    disabled={!newFirstName.trim() || !newLastName.trim()}
                    onClick={handleCreateKunde}
                  >
                    {tt('anlegen')}
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

      {/* ── Step 2: Bestelldetails ───────────────────────────────────────── */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-6">
            {/* Kundenzusammenfassung */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex items-center gap-3">
              <IconUser size={18} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {selectedKunde
                    ? `${selectedKunde.fields.first_name ?? ''} ${selectedKunde.fields.last_name ?? ''}`.trim()
                    : selectedKundeId}
                </p>
                {selectedKunde?.fields.email && (
                  <p className="text-xs text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                )}
              </div>
              <StatusBadge
                statusKey={selectedKunde?.fields.customer_status?.key}
                label={selectedKunde?.fields.customer_status?.label}
                className="ml-auto"
              />
            </div>

            {/* Artikel & Betrag */}
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium flex items-center gap-1">
                  <IconShoppingCart size={15} />
                  {tt('orderedItems')} *
                </Label>
                <Textarea
                  value={orderedItems}
                  onChange={(e) => setOrderedItems(e.target.value)}
                  placeholder={tt('orderedItemsPlaceholder')}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label className="text-sm font-medium">{tt('totalAmount')} *</Label>
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
                  <Label className="text-sm font-medium flex items-center gap-1">
                    <IconCreditCard size={15} />
                    {tt('paymentMethod')}
                  </Label>
                  <Select
                    value={paymentMethodKey || 'none'}
                    onValueChange={(v) => setPaymentMethodKey(v === 'none' ? '' : v)}
                  >
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

            {/* Zeiten */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-sm font-medium">{tt('orderDate')} *</Label>
                <Input
                  type="datetime-local"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-sm font-medium">{tt('desiredDelivery')}</Label>
                <Input
                  type="datetime-local"
                  value={desiredDeliveryTime}
                  onChange={(e) => setDesiredDeliveryTime(e.target.value)}
                />
              </div>
            </div>

            {/* Lieferadresse */}
            <div className="space-y-3">
              <Label className="text-sm font-medium flex items-center gap-1">
                <IconMapPin size={15} />
                {tt('deliveryAddress')}
              </Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">{tt('street')}</Label>
                  <Input
                    value={deliveryStreet}
                    onChange={(e) => setDeliveryStreet(e.target.value)}
                    placeholder={tt('street')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tt('houseNumber')}</Label>
                  <Input
                    value={deliveryHouseNumber}
                    onChange={(e) => setDeliveryHouseNumber(e.target.value)}
                    placeholder={tt('houseNumber')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tt('postalCode')}</Label>
                  <Input
                    value={deliveryPostalCode}
                    onChange={(e) => setDeliveryPostalCode(e.target.value)}
                    placeholder={tt('postalCode')}
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">{tt('city')}</Label>
                  <Input
                    value={deliveryCity}
                    onChange={(e) => setDeliveryCity(e.target.value)}
                    placeholder={tt('city')}
                  />
                </div>
              </div>
            </div>

            {/* Lieferhinweise */}
            <div className="space-y-1">
              <Label className="text-sm font-medium">{tt('deliveryNotes')}</Label>
              <Textarea
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder={tt('deliveryNotesPlaceholder')}
                rows={2}
              />
            </div>

            <Button
              className="w-full"
              disabled={!orderedItems.trim() || !totalAmount || !orderDate}
              onClick={() => setStep(3)}
            >
              {tt('weiterFahrer')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('thisStepNeedsKunde')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStart')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Fahrer zuweisen ──────────────────────────────────────── */}
      {step === 3 && (
        selectedKundeId && orderedItems ? (
          <div className="space-y-4">
            {saveError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 flex items-start gap-2">
                <IconAlertCircle size={16} className="text-destructive mt-0.5 shrink-0" />
                <p className="text-sm text-destructive">{saveError}</p>
              </div>
            )}

            <EntitySelectStep
              items={verfuegbareFahrer.map((f) => ({
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
              onSelect={handleSelectFahrerAndSubmit}
              searchPlaceholder={tt('searchFahrer')}
              emptyText={tt('emptyFahrer')}
            />

            <div className="pt-2">
              <Button
                variant="outline"
                className="w-full"
                disabled={saving}
                onClick={handleOhneFahrer}
              >
                {tt('ohnefahrer')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('thisStepNeedsDetails')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStart')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: Bestätigung ──────────────────────────────────────────── */}
      {step === 4 && (
        createdOrderId ? (
          <div className="space-y-6">
            <div className="rounded-2xl border bg-card p-6 space-y-4 text-center">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <IconCheck size={24} className="text-primary" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">{tt('successTitle')}</h2>
                <p className="text-sm text-muted-foreground mt-1">{tt('successDesc')}</p>
              </div>
            </div>

            {/* Summary */}
            <div className="rounded-2xl border bg-secondary/30 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-y-2 gap-x-4 text-sm">
                <span className="text-muted-foreground">{tt('confirmKunde')}</span>
                <span className="font-medium truncate">
                  {selectedKunde
                    ? `${selectedKunde.fields.first_name ?? ''} ${selectedKunde.fields.last_name ?? ''}`.trim()
                    : '—'}
                </span>

                <span className="text-muted-foreground">{tt('confirmItems')}</span>
                <span className="font-medium line-clamp-2">{orderedItems}</span>

                <span className="text-muted-foreground">{tt('confirmAmount')}</span>
                <span className="font-medium">
                  {totalAmount ? `${parseFloat(totalAmount).toFixed(2)} €` : '—'}
                </span>

                {paymentMethodKey && paymentMethodKey !== 'none' && (
                  <>
                    <span className="text-muted-foreground">{tt('confirmPayment')}</span>
                    <span className="font-medium">
                      {PAYMENT_OPTIONS.find((o) => o.key === paymentMethodKey)?.label ?? paymentMethodKey}
                    </span>
                  </>
                )}

                {desiredDeliveryTime && (
                  <>
                    <span className="text-muted-foreground">{tt('confirmDelivery')}</span>
                    <span className="font-medium">{desiredDeliveryTime.replace('T', ' ')}</span>
                  </>
                )}

                <span className="text-muted-foreground">{tt('confirmFahrer')}</span>
                <span className="font-medium">
                  {selectedFahrer
                    ? `${selectedFahrer.fields.driver_first_name ?? ''} ${selectedFahrer.fields.driver_last_name ?? ''}`.trim()
                    : tt('keinFahrer')}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={handleReset} className="w-full">
                {tt('neueBestellung')}
              </Button>
              <a href="#/" className="block">
                <Button variant="outline" className="w-full">
                  {tt('backToDashboard')}
                </Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('thisStepNeedsDetails')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
