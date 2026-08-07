/**
 * Bestellung aufnehmen — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen (aktiv) → 2) Bestelldetails eingeben → 3) Fahrer zuweisen & bestätigen.
 * Reads: kundenverwaltung (filter: customer_status='aktiv'), fahrerverwaltung (filter: driver_status='verfuegbar').
 * Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { makeT, fieldLabel } from '@/i18n';
import type { Kundenverwaltung, Fahrerverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconUser, IconTruck, IconClipboardList, IconCircleCheck, IconMapPin, IconCurrencyEuro } from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Bestellung aufnehmen', /* i18n-exempt */
    subtitle: 'Neue Bestellung in 3 Schritten erfassen',
    step1: 'Kunde',
    step2: 'Details',
    step3: 'Fahrer & Bestätigen',
    step4: 'Fertig',
    selectKunde: 'Kunden auswählen',
    selectKundeDesc: 'Wähle einen aktiven Kunden für diese Bestellung.',
    noKunden: 'Keine aktiven Kunden gefunden.',
    searchKunde: 'Kunden suchen…',
    selectFahrer: 'Fahrer zuweisen (optional)',
    selectFahrerDesc: 'Wähle einen verfügbaren Fahrer oder überspringe diesen Schritt.',
    noFahrer: 'Keine verfügbaren Fahrer.',
    searchFahrer: 'Fahrer suchen…',
    skipFahrer: 'Ohne Fahrer fortfahren',
    detailsTitle: 'Bestelldetails',
    orderedItems: 'Bestellte Artikel',
    orderedItemsPlaceholder: 'z.B. 2x Pizza Margherita, 1x Cola…',
    totalAmount: 'Gesamtbetrag (€)',
    orderDate: 'Bestelldatum und -uhrzeit',
    desiredDelivery: 'Gewünschter Lieferzeitpunkt',
    deliveryAddress: 'Lieferadresse',
    street: 'Straße',
    houseNumber: 'Hausnummer',
    postalCode: 'Postleitzahl',
    city: 'Stadt',
    paymentMethod: 'Zahlungsmethode',
    deliveryNotes: 'Lieferhinweise',
    deliveryNotesPlaceholder: 'z.B. Klingeln, 2. Etage links…',
    next: 'Weiter',
    back: 'Zurück',
    confirmOrder: 'Bestellung anlegen',
    creating: 'Wird angelegt…',
    confirmTitle: 'Zusammenfassung',
    kunde: 'Kunde',
    fahrer: 'Fahrer',
    keinFahrer: 'Noch nicht zugewiesen',
    betrag: 'Gesamtbetrag',
    successTitle: 'Bestellung erfolgreich angelegt!',
    successDesc: 'Die Bestellung wurde gespeichert und kann jetzt bearbeitet werden.',
    newOrder: 'Neue Bestellung aufnehmen',
    backDashboard: 'Zurück zum Dashboard',
    requiredHint: 'Pflichtfelder ausfüllen',
    noSelection: 'Kein Eintrag ausgewählt — bitte Schritt 1 wiederholen.',
    restart: 'Neu starten',
    payNone: 'Keine Angabe',
    vehicle: 'Fahrzeug',
    zone: 'Zone',
  },
  en: {
    title: 'Take Order', /* i18n-exempt */
    subtitle: 'Place a new order in 3 steps',
    step1: 'Customer',
    step2: 'Details',
    step3: 'Driver & Confirm',
    step4: 'Done',
    selectKunde: 'Select customer',
    selectKundeDesc: 'Choose an active customer for this order.',
    noKunden: 'No active customers found.',
    searchKunde: 'Search customers…',
    selectFahrer: 'Assign driver (optional)',
    selectFahrerDesc: 'Choose an available driver or skip this step.',
    noFahrer: 'No available drivers.',
    searchFahrer: 'Search drivers…',
    skipFahrer: 'Continue without driver',
    detailsTitle: 'Order details',
    orderedItems: 'Ordered items',
    orderedItemsPlaceholder: 'e.g. 2x Margherita pizza, 1x Cola…',
    totalAmount: 'Total amount (€)',
    orderDate: 'Order date and time',
    desiredDelivery: 'Desired delivery time',
    deliveryAddress: 'Delivery address',
    street: 'Street',
    houseNumber: 'House number',
    postalCode: 'Postal code',
    city: 'City',
    paymentMethod: 'Payment method',
    deliveryNotes: 'Delivery instructions',
    deliveryNotesPlaceholder: 'e.g. Ring doorbell, 2nd floor left…',
    next: 'Next',
    back: 'Back',
    confirmOrder: 'Create order',
    creating: 'Creating…',
    confirmTitle: 'Summary',
    kunde: 'Customer',
    fahrer: 'Driver',
    keinFahrer: 'Not yet assigned',
    betrag: 'Total amount',
    successTitle: 'Order created successfully!',
    successDesc: 'The order has been saved and can now be processed.',
    newOrder: 'Take another order',
    backDashboard: 'Back to Dashboard',
    requiredHint: 'Please fill in required fields',
    noSelection: 'No record selected — please restart from step 1.',
    restart: 'Restart',
    payNone: 'Not specified',
    vehicle: 'Vehicle',
    zone: 'Zone',
  },
  cs: {
    title: 'Přijmout objednávku', /* i18n-exempt */
    subtitle: 'Nová objednávka ve 3 krocích',
    step1: 'Zákazník',
    step2: 'Detaily',
    step3: 'Řidič a potvrzení',
    step4: 'Hotovo',
    selectKunde: 'Vybrat zákazníka',
    selectKundeDesc: 'Vyber aktivního zákazníka pro tuto objednávku.',
    noKunden: 'Žádní aktivní zákazníci.',
    searchKunde: 'Hledat zákazníky…',
    selectFahrer: 'Přiřadit řidiče (volitelné)',
    selectFahrerDesc: 'Vyber dostupného řidiče nebo tento krok přeskoč.',
    noFahrer: 'Žádní dostupní řidiči.',
    searchFahrer: 'Hledat řidiče…',
    skipFahrer: 'Pokračovat bez řidiče',
    detailsTitle: 'Detaily objednávky',
    orderedItems: 'Objednané položky',
    orderedItemsPlaceholder: 'např. 2x pizza Margherita, 1x Cola…',
    totalAmount: 'Celková částka (€)',
    orderDate: 'Datum a čas objednávky',
    desiredDelivery: 'Požadovaný čas doručení',
    deliveryAddress: 'Adresa doručení',
    street: 'Ulice',
    houseNumber: 'Číslo popisné',
    postalCode: 'PSČ',
    city: 'Město',
    paymentMethod: 'Způsob platby',
    deliveryNotes: 'Pokyny k doručení',
    deliveryNotesPlaceholder: 'např. Zazvonit, 2. patro vlevo…',
    next: 'Další',
    back: 'Zpět',
    confirmOrder: 'Vytvořit objednávku',
    creating: 'Vytváření…',
    confirmTitle: 'Shrnutí',
    kunde: 'Zákazník',
    fahrer: 'Řidič',
    keinFahrer: 'Zatím nepřiřazen',
    betrag: 'Celková částka',
    successTitle: 'Objednávka úspěšně vytvořena!',
    successDesc: 'Objednávka byla uložena a lze ji nyní zpracovat.',
    newOrder: 'Přijmout další objednávku',
    backDashboard: 'Zpět na dashboard',
    requiredHint: 'Vyplňte povinná pole',
    noSelection: 'Žádný záznam nevybrán — začni prosím od kroku 1.',
    restart: 'Začít znovu',
    payNone: 'Neuvedeno',
    vehicle: 'Vozidlo',
    zone: 'Zóna',
  },
});

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function BestellungAufnehmenPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  // Wizard step (1-based)
  const [step, setStep] = useState(1);

  // Step 1: selected Kunde
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);

  // Step 2: order details form state
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [orderDate, setOrderDate] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState('none');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Step 3: selected Fahrer (optional) + submit state
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // New customer mini-form state
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newKundeFirst, setNewKundeFirst] = useState('');
  const [newKundeLast, setNewKundeLast] = useState('');
  const [newKundePhone, setNewKundePhone] = useState('');
  const [newKundeEmail, setNewKundeEmail] = useState('');
  const [creatingKunde, setCreatingKunde] = useState(false);

  const activeKunden = kundenverwaltung.filter(
    (k) => k.fields.customer_status?.key === 'aktiv',
  );

  const availableFahrer = fahrerverwaltung.filter(
    (f) => f.fields.driver_status?.key === 'verfuegbar',
  );

  const selectedKunde: Kundenverwaltung | undefined = selectedKundeId
    ? kundenverwaltung.find((k) => k.record_id === selectedKundeId)
    : undefined;

  const selectedFahrer: Fahrerverwaltung | undefined = selectedFahrerId
    ? fahrerverwaltung.find((f) => f.record_id === selectedFahrerId)
    : undefined;

  const handleCreateKunde = useCallback(async () => {
    if (!newKundeFirst || !newKundeLast) return;
    setCreatingKunde(true);
    try {
      const created = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newKundeFirst,
        last_name: newKundeLast,
        phone: newKundePhone || undefined,
        email: newKundeEmail || undefined,
        customer_status: 'aktiv',
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNewKundeFirst('');
      setNewKundeLast('');
      setNewKundePhone('');
      setNewKundeEmail('');
      setSelectedKundeId(created.record_id);
      setStep(2);
    } finally {
      setCreatingKunde(false);
    }
  }, [newKundeFirst, newKundeLast, newKundePhone, newKundeEmail, fetchAll]);

  const handleConfirm = useCallback(async () => {
    if (!selectedKundeId) return;
    // idempotency guard — if we already created the order, don't create again
    if (createdOrderId) {
      setStep(4);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await LivingAppsService.createBestellverwaltungEntry({
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId),
        fahrer: selectedFahrerId
          ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId)
          : undefined,
        ordered_items: orderedItems,
        total_amount: totalAmount ? parseFloat(totalAmount) : undefined,
        order_date: orderDate || undefined,
        desired_delivery_time: desiredDeliveryTime || undefined,
        delivery_street: deliveryStreet || undefined,
        delivery_house_number: deliveryHouseNumber || undefined,
        delivery_postal_code: deliveryPostalCode || undefined,
        delivery_city: deliveryCity || undefined,
        payment_method: paymentMethodKey !== 'none' ? paymentMethodKey : undefined,
        delivery_notes: deliveryNotes || undefined,
        order_status: 'neu',
      });
      setCreatedOrderId(result.record_id);
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedKundeId,
    selectedFahrerId,
    orderedItems,
    totalAmount,
    orderDate,
    desiredDeliveryTime,
    deliveryStreet,
    deliveryHouseNumber,
    deliveryPostalCode,
    deliveryCity,
    paymentMethodKey,
    deliveryNotes,
    createdOrderId,
  ]);

  const handleReset = useCallback(() => {
    setSelectedKundeId(null);
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
    setSelectedFahrerId(null);
    setSubmitError(null);
    setCreatedOrderId(null);
    setStep(1);
  }, []);

  const kundeName = selectedKunde
    ? `${selectedKunde.fields.first_name ?? ''} ${selectedKunde.fields.last_name ?? ''}`.trim()
    : '';

  const fahrerName = selectedFahrer
    ? `${selectedFahrer.fields.driver_first_name ?? ''} ${selectedFahrer.fields.driver_last_name ?? ''}`.trim()
    : tt('keinFahrer');

  const paymentLabel =
    paymentMethodKey !== 'none'
      ? (PAYMENT_OPTIONS.find((o) => o.key === paymentMethodKey)?.label ?? paymentMethodKey)
      : tt('payNone');

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
      {/* ── Step 1: Kunde auswählen ── */}
      {step === 1 && (
        <div className="space-y-4">
          <EntitySelectStep
            items={activeKunden.map((k) => ({
              id: k.record_id,
              title: `${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || k.record_id,
              subtitle: [k.fields.email, k.fields.phone, k.fields.city].filter(Boolean).join(' · '),
              icon: <IconUser size={20} className="text-primary" />,
            }))}
            onSelect={(id) => {
              setSelectedKundeId(id);
              setStep(2);
            }}
            searchPlaceholder={tt('searchKunde')}
            emptyText={tt('noKunden')}
            createLabel={tt('selectKunde')}
            onCreateNew={() => setShowCreateKunde(true)}
            createDialog={
              showCreateKunde ? (
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <p className="text-sm font-medium">{fieldLabel('kundenverwaltung', 'first_name')} &amp; {fieldLabel('kundenverwaltung', 'last_name')}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'first_name')} *</Label>
                      <Input
                        value={newKundeFirst}
                        onChange={(e) => setNewKundeFirst(e.target.value)}
                        placeholder={fieldLabel('kundenverwaltung', 'first_name')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'last_name')} *</Label>
                      <Input
                        value={newKundeLast}
                        onChange={(e) => setNewKundeLast(e.target.value)}
                        placeholder={fieldLabel('kundenverwaltung', 'last_name')}
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'phone')}</Label>
                    <Input
                      value={newKundePhone}
                      onChange={(e) => setNewKundePhone(e.target.value)}
                      placeholder={fieldLabel('kundenverwaltung', 'phone')}
                      type="tel"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{fieldLabel('kundenverwaltung', 'email')}</Label>
                    <Input
                      value={newKundeEmail}
                      onChange={(e) => setNewKundeEmail(e.target.value)}
                      placeholder={fieldLabel('kundenverwaltung', 'email')}
                      type="email"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowCreateKunde(false)}
                    >
                      {tt('back')}
                    </Button>
                    <Button
                      size="sm"
                      disabled={!newKundeFirst || !newKundeLast || creatingKunde}
                      onClick={handleCreateKunde}
                    >
                      {creatingKunde ? '…' : tt('next')}
                    </Button>
                  </div>
                </div>
              ) : undefined
            }
          />
        </div>
      )}

      {/* ── Step 2: Bestelldetails eingeben ── */}
      {step === 2 && (
        <div className="space-y-6">
          {!selectedKundeId ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noSelection')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
            </div>
          ) : (
            <>
              {/* Kunde context */}
              <div className="rounded-2xl border bg-secondary/40 px-4 py-3 flex items-center gap-3">
                <IconUser size={18} className="text-primary shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tt('kunde')}</p>
                  <p className="font-medium truncate">{kundeName}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {/* ordered_items (required) */}
                <div className="space-y-1">
                  <Label className="text-sm">{tt('orderedItems')} *</Label>
                  <Textarea
                    value={orderedItems}
                    onChange={(e) => setOrderedItems(e.target.value)}
                    placeholder={tt('orderedItemsPlaceholder')}
                    rows={3}
                    className="resize-none"
                  />
                </div>

                {/* total_amount (required) */}
                <div className="space-y-1">
                  <Label className="text-sm">{tt('totalAmount')} *</Label>
                  <div className="relative">
                    <IconCurrencyEuro size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
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

                {/* order_date (required) */}
                <div className="space-y-1">
                  <Label className="text-sm">{tt('orderDate')} *</Label>
                  <Input
                    type="datetime-local"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </div>

                {/* desired_delivery_time */}
                <div className="space-y-1">
                  <Label className="text-sm">{tt('desiredDelivery')}</Label>
                  <Input
                    type="datetime-local"
                    value={desiredDeliveryTime}
                    onChange={(e) => setDesiredDeliveryTime(e.target.value)}
                  />
                </div>

                {/* delivery address */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-1">
                    <IconMapPin size={14} />
                    {tt('deliveryAddress')}
                  </Label>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2 space-y-1">
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
                        placeholder="12a"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tt('postalCode')}</Label>
                      <Input
                        value={deliveryPostalCode}
                        onChange={(e) => setDeliveryPostalCode(e.target.value)}
                        placeholder="12345"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">{tt('city')}</Label>
                      <Input
                        value={deliveryCity}
                        onChange={(e) => setDeliveryCity(e.target.value)}
                        placeholder={tt('city')}
                      />
                    </div>
                  </div>
                </div>

                {/* payment_method */}
                <div className="space-y-1">
                  <Label className="text-sm">{tt('paymentMethod')}</Label>
                  <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={tt('payNone')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tt('payNone')}</SelectItem>
                      {PAYMENT_OPTIONS.map((o) => (
                        <SelectItem key={o.key} value={o.key}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* delivery_notes */}
                <div className="space-y-1">
                  <Label className="text-sm">{tt('deliveryNotes')}</Label>
                  <Textarea
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder={tt('deliveryNotesPlaceholder')}
                    rows={2}
                    className="resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(1)}>
                  {tt('back')}
                </Button>
                <Button
                  disabled={!orderedItems || !totalAmount || !orderDate}
                  onClick={() => setStep(3)}
                >
                  {tt('next')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step 3: Fahrer zuweisen & Bestellung bestätigen ── */}
      {step === 3 && (
        <div className="space-y-6">
          {!selectedKundeId ? (
            <div className="text-center py-12 space-y-3">
              <p className="text-sm text-muted-foreground">{tt('noSelection')}</p>
              <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
            </div>
          ) : (
            <>
              {/* Live-Zusammenfassung */}
              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b bg-secondary/30">
                  <p className="text-sm font-semibold">{tt('confirmTitle')}</p>
                </div>
                <div className="px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{tt('kunde')}</span>
                    <span className="font-medium">{kundeName}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{tt('betrag')}</span>
                    <span className="font-semibold text-primary">
                      {totalAmount ? `${parseFloat(totalAmount).toFixed(2)} €` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{tt('paymentMethod')}</span>
                    <span>{paymentLabel}</span>
                  </div>
                  {(deliveryStreet || deliveryCity) && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{tt('deliveryAddress')}</span>
                      <span className="text-right max-w-[60%] truncate">
                        {[deliveryStreet, deliveryHouseNumber, deliveryPostalCode, deliveryCity].filter(Boolean).join(' ')}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{tt('fahrer')}</span>
                    <span className={selectedFahrerId ? 'font-medium' : 'text-muted-foreground italic'}>
                      {fahrerName}
                    </span>
                  </div>
                </div>
              </div>

              {/* Fahrer-Auswahl */}
              <EntitySelectStep
                items={availableFahrer.map((f) => ({
                  id: f.record_id,
                  title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || f.record_id,
                  subtitle: [
                    f.fields.vehicle_type?.label,
                    f.fields.delivery_zone ? `${tt('zone')}: ${f.fields.delivery_zone}` : undefined,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  status: f.fields.driver_status
                    ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                    : undefined,
                  icon: <IconTruck size={20} className="text-primary" />,
                }))}
                onSelect={(id) => setSelectedFahrerId(id === selectedFahrerId ? null : id)}
                searchPlaceholder={tt('searchFahrer')}
                emptyText={tt('noFahrer')}
              />

              {/* Fahrer status badge for selected */}
              {selectedFahrer && (
                <div className="flex items-center gap-2 rounded-xl border bg-secondary/30 px-3 py-2">
                  <IconTruck size={16} className="text-primary shrink-0" />
                  <span className="text-sm font-medium flex-1 truncate">{fahrerName}</span>
                  <StatusBadge
                    statusKey={selectedFahrer.fields.driver_status?.key}
                    label={selectedFahrer.fields.driver_status?.label}
                  />
                </div>
              )}

              {submitError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {submitError}
                </div>
              )}

              <div className="flex flex-wrap gap-2 justify-between pt-2">
                <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                  {tt('back')}
                </Button>
                <div className="flex gap-2">
                  {!selectedFahrerId && (
                    <Button variant="ghost" onClick={() => setSelectedFahrerId(null)}>
                      {tt('skipFahrer')}
                    </Button>
                  )}
                  <Button
                    disabled={submitting}
                    onClick={handleConfirm}
                  >
                    {submitting ? tt('creating') : tt('confirmOrder')}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Step 4: Erfolg ── */}
      {step === 4 && (
        <div className="text-center py-12 space-y-6">
          <div className="flex flex-col items-center gap-3">
            <div className="rounded-full bg-primary/10 p-4">
              <IconCircleCheck size={40} className="text-primary" stroke={1.5} />
            </div>
            <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
            <p className="text-sm text-muted-foreground max-w-sm">{tt('successDesc')}</p>
          </div>

          <div className="rounded-2xl border bg-card overflow-hidden max-w-sm mx-auto">
            <div className="px-4 py-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{tt('kunde')}</span>
                <span className="font-medium">{kundeName}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{tt('betrag')}</span>
                <span className="font-semibold text-primary">
                  {totalAmount ? `${parseFloat(totalAmount).toFixed(2)} €` : '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{tt('fahrer')}</span>
                <span className={selectedFahrerId ? 'font-medium' : 'text-muted-foreground italic'}>
                  {fahrerName}
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button onClick={handleReset} className="flex items-center gap-2">
              <IconClipboardList size={16} />
              {tt('newOrder')}
            </Button>
            <Button variant="outline" asChild>
              <a href="#/">{tt('backDashboard')}</a>
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
