/**
 * Neue Bestellung — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen (nur aktive Kunden) → 2) Bestelldetails erfassen →
 *        3) Fahrer zuweisen (optional, nur verfügbare) & Bestellung anlegen.
 * Reads: kundenverwaltung, fahrerverwaltung. Writes: bestellverwaltung (createBestellverwaltungEntry),
 *        fahrerverwaltung (updateFahrerverwaltungEntry — setzt driver_status auf 'im_einsatz').
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IconUser, IconTruck, IconCheck, IconPackage, IconCash, IconMapPin } from '@tabler/icons-react';

// ── i18n ──────────────────────────────────────────────────────────────────────
const tt = makeT({
  de: {
    pageTitle: 'Neue Bestellung',
    subtitle: 'Kunden auswählen, Bestellung aufgeben, Fahrer zuweisen',
    step1: 'Kunde',
    step2: 'Details',
    step3: 'Fahrer & Bestätigen',
    step4: 'Fertig',
    searchKunde: 'Kunde suchen…',
    emptyKunde: 'Keine aktiven Kunden gefunden',
    newKunde: 'Neuen Kunden anlegen',
    newKundeFirstName: 'Vorname',
    newKundeLastName: 'Nachname',
    newKundeEmail: 'E-Mail',
    newKundePhone: 'Telefon',
    anlegen: 'Anlegen',
    detailsHeading: 'Bestelldetails',
    orderedItems: 'Bestellte Artikel',
    orderedItemsPlaceholder: 'z.B. 2x Pizza Margherita, 1x Cola',
    totalAmount: 'Gesamtbetrag (€)',
    orderDate: 'Bestellzeitpunkt',
    desiredDelivery: 'Gewünschte Lieferzeit',
    paymentMethod: 'Zahlungsart',
    paymentNone: 'Keine Auswahl',
    deliveryAddress: 'Lieferadresse',
    deliveryStreet: 'Straße',
    deliveryHouseNumber: 'Hausnummer',
    deliveryPostalCode: 'PLZ',
    deliveryCity: 'Ort',
    deliveryNotes: 'Lieferhinweise',
    deliveryNotesPlaceholder: 'z.B. 2. OG, klingeln bei Müller',
    weiterStep3: 'Weiter: Fahrer zuweisen',
    backStep1: 'Zurück zu Schritt 1',
    backStep2: 'Zurück zu Schritt 2',
    fahrerzuweisung: 'Fahrer zuweisen',
    fahrerzuweisungHint: 'Optional — Bestellung kann auch ohne Fahrer angelegt werden.',
    searchFahrer: 'Fahrer suchen…',
    emptyFahrer: 'Keine verfügbaren Fahrer',
    ohnefahrer: 'Ohne Fahrer anlegen',
    bestellungAnlegen: 'Bestellung anlegen',
    submitting: 'Wird angelegt…',
    successTitle: 'Bestellung erfolgreich angelegt!',
    successKunde: 'Kunde',
    successBetrag: 'Betrag',
    successLieferzeit: 'Lieferzeit',
    successFahrer: 'Fahrer',
    keinFahrer: 'Kein Fahrer zugewiesen',
    neueBestellung: 'Neue Bestellung anlegen',
    zurueckDashboard: 'Zurück zum Dashboard',
    prerequisiteStep1: 'Bitte zuerst einen Kunden auswählen.',
    prerequisiteStep2: 'Bitte zuerst Bestelldetails ausfüllen.',
    neustart: 'Neu starten',
    selectedKunde: 'Ausgewählter Kunde',
    zone: 'Zone',
    fahrzeug: 'Fahrzeug',
    kundeAnlegen: 'Kunden anlegen',
    fehler: 'Fehler',
    status: 'Status',
  },
  en: {
    pageTitle: 'New Order',
    subtitle: 'Select customer, place order, assign driver',
    step1: 'Customer',
    step2: 'Details',
    step3: 'Driver & Confirm',
    step4: 'Done',
    searchKunde: 'Search customer…',
    emptyKunde: 'No active customers found',
    newKunde: 'Create new customer',
    newKundeFirstName: 'First name',
    newKundeLastName: 'Last name',
    newKundeEmail: 'Email',
    newKundePhone: 'Phone',
    anlegen: 'Create',
    detailsHeading: 'Order details',
    orderedItems: 'Ordered items',
    orderedItemsPlaceholder: 'e.g. 2x Margherita pizza, 1x Cola',
    totalAmount: 'Total amount (€)',
    orderDate: 'Order date/time',
    desiredDelivery: 'Desired delivery time',
    paymentMethod: 'Payment method',
    paymentNone: 'No selection',
    deliveryAddress: 'Delivery address',
    deliveryStreet: 'Street',
    deliveryHouseNumber: 'House number',
    deliveryPostalCode: 'Postal code',
    deliveryCity: 'City',
    deliveryNotes: 'Delivery notes',
    deliveryNotesPlaceholder: 'e.g. 2nd floor, ring at Müller',
    weiterStep3: 'Next: Assign driver',
    backStep1: 'Back to step 1',
    backStep2: 'Back to step 2',
    fahrerzuweisung: 'Assign driver',
    fahrerzuweisungHint: 'Optional — order can also be placed without a driver.',
    searchFahrer: 'Search driver…',
    emptyFahrer: 'No available drivers',
    ohnefahrer: 'Place without driver',
    bestellungAnlegen: 'Place order',
    submitting: 'Placing order…',
    successTitle: 'Order placed successfully!',
    successKunde: 'Customer',
    successBetrag: 'Amount',
    successLieferzeit: 'Delivery time',
    successFahrer: 'Driver',
    keinFahrer: 'No driver assigned',
    neueBestellung: 'Place new order',
    zurueckDashboard: 'Back to dashboard',
    prerequisiteStep1: 'Please select a customer first.',
    prerequisiteStep2: 'Please fill in order details first.',
    neustart: 'Restart',
    selectedKunde: 'Selected customer',
    zone: 'Zone',
    fahrzeug: 'Vehicle',
    kundeAnlegen: 'Create customer',
    fehler: 'Error',
    status: 'Status',
  },
  cs: {
    pageTitle: 'Nová objednávka',
    subtitle: 'Vyberte zákazníka, zadejte objednávku, přiřaďte řidiče',
    step1: 'Zákazník',
    step2: 'Detaily',
    step3: 'Řidič & Potvrdit',
    step4: 'Hotovo',
    searchKunde: 'Hledat zákazníka…',
    emptyKunde: 'Žádní aktivní zákazníci nenalezeni',
    newKunde: 'Vytvořit nového zákazníka',
    newKundeFirstName: 'Jméno',
    newKundeLastName: 'Příjmení',
    newKundeEmail: 'E-mail',
    newKundePhone: 'Telefon',
    anlegen: 'Vytvořit',
    detailsHeading: 'Podrobnosti objednávky',
    orderedItems: 'Objednané položky',
    orderedItemsPlaceholder: 'např. 2x Pizza Margherita, 1x Cola',
    totalAmount: 'Celková částka (€)',
    orderDate: 'Čas objednávky',
    desiredDelivery: 'Požadovaný čas doručení',
    paymentMethod: 'Způsob platby',
    paymentNone: 'Bez výběru',
    deliveryAddress: 'Doručovací adresa',
    deliveryStreet: 'Ulice',
    deliveryHouseNumber: 'Číslo domu',
    deliveryPostalCode: 'PSČ',
    deliveryCity: 'Město',
    deliveryNotes: 'Poznámky k doručení',
    deliveryNotesPlaceholder: 'např. 2. patro, zazvonit u Müllera',
    weiterStep3: 'Dále: Přiřadit řidiče',
    backStep1: 'Zpět na krok 1',
    backStep2: 'Zpět na krok 2',
    fahrerzuweisung: 'Přiřadit řidiče',
    fahrerzuweisungHint: 'Volitelné — objednávka může být zadána i bez řidiče.',
    searchFahrer: 'Hledat řidiče…',
    emptyFahrer: 'Žádní dostupní řidiči',
    ohnefahrer: 'Zadat bez řidiče',
    bestellungAnlegen: 'Zadat objednávku',
    submitting: 'Probíhá zadávání…',
    successTitle: 'Objednávka úspěšně zadána!',
    successKunde: 'Zákazník',
    successBetrag: 'Částka',
    successLieferzeit: 'Čas doručení',
    successFahrer: 'Řidič',
    keinFahrer: 'Žádný řidič nepřiřazen',
    neueBestellung: 'Zadat novou objednávku',
    zurueckDashboard: 'Zpět na přehled',
    prerequisiteStep1: 'Nejprve vyberte zákazníka.',
    prerequisiteStep2: 'Nejprve vyplňte detaily objednávky.',
    neustart: 'Začít znovu',
    selectedKunde: 'Vybraný zákazník',
    zone: 'Zóna',
    fahrzeug: 'Vozidlo',
    kundeAnlegen: 'Vytvořit zákazníka',
    fehler: 'Chyba',
    status: 'Stav',
  },
});

// ── Lookup options ─────────────────────────────────────────────────────────────
const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

// ── Component ──────────────────────────────────────────────────────────────────
export default function NeueBestellungPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

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
  const [orderDate, setOrderDate] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState('none');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Step 3 — Fahrer & submit
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdBestellungId, setCreatedBestellungId] = useState<string | null>(null);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const activeKunden = kundenverwaltung.filter(
    (k) => k.fields.customer_status?.key === 'aktiv',
  );
  const availableFahrer = fahrerverwaltung.filter(
    (f) => f.fields.driver_status?.key === 'verfuegbar',
  );

  const selectedKunde = selectedKundeId
    ? kundenverwaltung.find((k) => k.record_id === selectedKundeId)
    : null;
  const selectedFahrer = selectedFahrerId
    ? fahrerverwaltung.find((f) => f.record_id === selectedFahrerId)
    : null;

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleCreateKunde = async () => {
    if (!newFirstName || !newLastName) return;
    setCreatingKunde(true);
    try {
      const created = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newFirstName,
        last_name: newLastName,
        email: newEmail || undefined,
        phone: newPhone || undefined,
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

  const handleSubmit = async (fahrerId: string | null) => {
    if (!selectedKundeId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      // Guard against double-submit
      let bestellungId = createdBestellungId;
      if (!bestellungId) {
        const bestellung = await LivingAppsService.createBestellverwaltungEntry({
          ordered_items: orderedItems,
          total_amount: totalAmount ? parseFloat(totalAmount) : undefined,
          order_date: orderDate || undefined,
          desired_delivery_time: desiredDeliveryTime || undefined,
          payment_method: paymentMethodKey !== 'none' ? paymentMethodKey : undefined,
          delivery_street: deliveryStreet || undefined,
          delivery_house_number: deliveryHouseNumber || undefined,
          delivery_postal_code: deliveryPostalCode || undefined,
          delivery_city: deliveryCity || undefined,
          delivery_notes: deliveryNotes || undefined,
          order_status: 'neu',
          kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId),
          fahrer: fahrerId
            ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, fahrerId)
            : undefined,
        });
        bestellungId = bestellung.record_id;
        setCreatedBestellungId(bestellungId);
      }

      // Update driver status if assigned
      if (fahrerId) {
        await LivingAppsService.updateFahrerverwaltungEntry(fahrerId, {
          driver_status: 'im_einsatz',
        });
      }

      await fetchAll();
      setStep(4);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : String(e));
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
    setPaymentMethodKey('none');
    setDeliveryStreet('');
    setDeliveryHouseNumber('');
    setDeliveryPostalCode('');
    setDeliveryCity('');
    setDeliveryNotes('');
    setSelectedFahrerId(null);
    setSubmitting(false);
    setSubmitError(null);
    setCreatedBestellungId(null);
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <IntentWizardShell
      title={tt('pageTitle')}
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
      {/* ── Schritt 1: Kunde auswählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={activeKunden.map((k) => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.phone].filter(Boolean).join(' · '),
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
          emptyText={tt('emptyKunde')}
          createLabel={tt('newKunde')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={
            showCreateKunde && (
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder={tt('newKundeFirstName')}
                  />
                  <Input
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder={tt('newKundeLastName')}
                  />
                </div>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder={tt('newKundeEmail')}
                />
                <Input
                  type="tel"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder={tt('newKundePhone')}
                />
                <Button
                  disabled={!newFirstName || !newLastName || creatingKunde}
                  onClick={handleCreateKunde}
                  className="w-full"
                >
                  {creatingKunde ? '…' : tt('kundeAnlegen')}
                </Button>
              </div>
            )
          }
        />
      )}

      {/* ── Schritt 2: Bestelldetails ── */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-6">
            {/* Ausgewählter Kunde */}
            {selectedKunde && (
              <div className="flex items-center gap-3 rounded-2xl border bg-secondary/40 px-4 py-3">
                <IconUser size={18} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tt('selectedKunde')}</p>
                  <p className="font-medium truncate">
                    {[selectedKunde.fields.first_name, selectedKunde.fields.last_name]
                      .filter(Boolean)
                      .join(' ')}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <IconPackage size={18} className="text-primary" />
                {tt('detailsHeading')}
              </h2>

              {/* Bestellte Artikel */}
              <div className="space-y-1">
                <label className="text-sm font-medium">{tt('orderedItems')} *</label>
                <Textarea
                  value={orderedItems}
                  onChange={(e) => setOrderedItems(e.target.value)}
                  placeholder={tt('orderedItemsPlaceholder')}
                  rows={3}
                />
              </div>

              {/* Betrag + Zahlungsart */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tt('totalAmount')} *</label>
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
                  <label className="text-sm font-medium flex items-center gap-1">
                    <IconCash size={15} />
                    {tt('paymentMethod')}
                  </label>
                  <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tt('paymentNone')}</SelectItem>
                      {PAYMENT_OPTIONS.map((opt) => (
                        <SelectItem key={opt.key} value={opt.key}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Zeiten */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tt('orderDate')} *</label>
                  <Input
                    type="datetime-local"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{tt('desiredDelivery')}</label>
                  <Input
                    type="datetime-local"
                    value={desiredDeliveryTime}
                    onChange={(e) => setDesiredDeliveryTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Lieferadresse */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <IconMapPin size={15} className="text-muted-foreground" />
                  {tt('deliveryAddress')}
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Input
                      value={deliveryStreet}
                      onChange={(e) => setDeliveryStreet(e.target.value)}
                      placeholder={tt('deliveryStreet')}
                    />
                  </div>
                  <Input
                    value={deliveryHouseNumber}
                    onChange={(e) => setDeliveryHouseNumber(e.target.value)}
                    placeholder={tt('deliveryHouseNumber')}
                  />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <Input
                    value={deliveryPostalCode}
                    onChange={(e) => setDeliveryPostalCode(e.target.value)}
                    placeholder={tt('deliveryPostalCode')}
                  />
                  <div className="col-span-2">
                    <Input
                      value={deliveryCity}
                      onChange={(e) => setDeliveryCity(e.target.value)}
                      placeholder={tt('deliveryCity')}
                    />
                  </div>
                </div>
                <Textarea
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder={tt('deliveryNotesPlaceholder')}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} className="sm:w-auto w-full">
                {tt('backStep1')}
              </Button>
              <Button
                disabled={!orderedItems || !totalAmount || !orderDate}
                onClick={() => setStep(3)}
                className="sm:flex-1 w-full"
              >
                {tt('weiterStep3')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('prerequisiteStep1')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neustart')}</Button>
          </div>
        )
      )}

      {/* ── Schritt 3: Fahrer zuweisen & Bestätigen ── */}
      {step === 3 && (
        selectedKundeId && orderedItems && totalAmount ? (
          <div className="space-y-6">
            {/* Bestellzusammenfassung */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2">
              {selectedKunde && (
                <div className="flex items-center gap-2 text-sm">
                  <IconUser size={15} className="text-muted-foreground shrink-0" />
                  <span className="font-medium">
                    {[selectedKunde.fields.first_name, selectedKunde.fields.last_name]
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-2 text-sm">
                <IconPackage size={15} className="text-muted-foreground shrink-0" />
                <span className="truncate">{orderedItems}</span>
              </div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <IconCash size={15} className="text-muted-foreground shrink-0" />
                <span>{parseFloat(totalAmount).toFixed(2)} €</span>
              </div>
            </div>

            {/* Fahrerauswahl */}
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2 mb-1">
                <IconTruck size={18} className="text-primary" />
                {tt('fahrerzuweisung')}
              </h2>
              <p className="text-xs text-muted-foreground mb-3">{tt('fahrerzuweisungHint')}</p>
              <EntitySelectStep
                items={availableFahrer.map((f) => ({
                  id: f.record_id,
                  title: [f.fields.driver_first_name, f.fields.driver_last_name]
                    .filter(Boolean)
                    .join(' ') || f.record_id,
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
                onSelect={(id) => {
                  setSelectedFahrerId(id);
                }}
                searchPlaceholder={tt('searchFahrer')}
                emptyText={tt('emptyFahrer')}
              />
            </div>

            {submitError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {tt('fehler')}: {submitError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <Button
                variant="outline"
                onClick={() => setStep(2)}
                className="sm:w-auto w-full"
                disabled={submitting}
              >
                {tt('backStep2')}
              </Button>
              {selectedFahrerId ? (
                <Button
                  onClick={() => handleSubmit(selectedFahrerId)}
                  disabled={submitting}
                  className="sm:flex-1 w-full"
                >
                  {submitting ? tt('submitting') : tt('bestellungAnlegen')}
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => handleSubmit(null)}
                  disabled={submitting}
                  className="sm:flex-1 w-full"
                >
                  {submitting ? tt('submitting') : tt('ohnefahrer')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('prerequisiteStep2')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neustart')}</Button>
          </div>
        )
      )}

      {/* ── Schritt 4: Erfolg ── */}
      {step === 4 && (
        <div className="text-center space-y-6 py-8">
          <div className="flex justify-center">
            <div className="rounded-full bg-primary/10 p-4">
              <IconCheck size={40} className="text-primary" stroke={1.5} />
            </div>
          </div>
          <h2 className="text-xl font-bold">{tt('successTitle')}</h2>

          <div className="rounded-2xl border bg-card p-4 text-left space-y-3 max-w-sm mx-auto">
            {selectedKunde && (
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{tt('successKunde')}</span>
                <span className="font-medium truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name]
                    .filter(Boolean)
                    .join(' ')}
                </span>
              </div>
            )}
            <div className="flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{tt('successBetrag')}</span>
              <span className="font-medium">{parseFloat(totalAmount || '0').toFixed(2)} €</span>
            </div>
            {desiredDeliveryTime && (
              <div className="flex justify-between gap-2 text-sm">
                <span className="text-muted-foreground">{tt('successLieferzeit')}</span>
                <span className="font-medium">{desiredDeliveryTime.replace('T', ' ')}</span>
              </div>
            )}
            <div className="flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{tt('successFahrer')}</span>
              <span className="font-medium">
                {selectedFahrer
                  ? [selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name]
                      .filter(Boolean)
                      .join(' ')
                  : tt('keinFahrer')}
              </span>
            </div>
            <div className="flex justify-between gap-2 text-sm">
              <span className="text-muted-foreground">{tt('status')}</span>
              <StatusBadge statusKey="neu" />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Button onClick={handleReset} variant="outline">
              {tt('neueBestellung')}
            </Button>
            <a href="#/">
              <Button>{tt('zurueckDashboard')}</Button>
            </a>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
