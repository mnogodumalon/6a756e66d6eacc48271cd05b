/**
 * Neue Bestellung — 4-Schritt-Wizard.
 * Steps: 1) Kunde auswählen → 2) Bestelldetails erfassen → 3) Fahrer zuweisen (optional) → 4) Bestätigen & anlegen.
 * Reads: kundenverwaltung (filter: customer_status=aktiv), fahrerverwaltung (filter: driver_status=verfuegbar).
 * Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
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
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  IconUser,
  IconTruck,
  IconShoppingCart,
  IconCheck,
  IconPackage,
  IconClock,
  IconCurrencyEuro,
  IconMapPin,
} from '@tabler/icons-react';

// ─── i18n ─────────────────────────────────────────────────────────────────────
const tt = makeT({
  de: {
    pageTitle: 'Neue Bestellung',
    subtitle: 'Schritt-für-Schritt eine Bestellung anlegen',
    step1: 'Kunde',
    step2: 'Bestelldetails',
    step3: 'Fahrer',
    step4: 'Bestätigung',
    searchKunde: 'Kunden suchen …',
    noKunden: 'Keine aktiven Kunden gefunden',
    neuerKunde: 'Neuen Kunden anlegen',
    neuerKundeFirst: 'Vorname',
    neuerKundeLast: 'Nachname',
    neuerKundeEmail: 'E-Mail',
    neuerKundePhone: 'Telefon',
    anlegen: 'Anlegen',
    orderedItems: 'Bestellte Artikel',
    orderedItemsPlaceholder: 'z.B. 2x Pizza Margherita, 1x Cola 0,5l …',
    totalAmount: 'Gesamtbetrag (€)',
    orderDate: 'Bestellzeitpunkt',
    desiredDelivery: 'Gewünschte Lieferzeit',
    paymentMethod: 'Zahlungsart',
    paymentPlaceholder: 'Zahlungsart wählen',
    deliveryAddress: 'Lieferadresse',
    street: 'Straße',
    houseNumber: 'Hausnummer',
    postalCode: 'Postleitzahl',
    city: 'Stadt',
    deliveryNotes: 'Lieferhinweise',
    deliveryNotesPlaceholder: 'z.B. 3. OG, klingeln bei Müller …',
    weiterFahrer: 'Weiter: Fahrer zuweisen',
    searchFahrer: 'Fahrer suchen …',
    noFahrer: 'Keine verfügbaren Fahrer gefunden',
    fahrerOptional: 'Fahrer kann auch später zugewiesen werden.',
    ohnefahrer: 'Ohne Fahrer fortfahren',
    weiterBestaetigung: 'Weiter zur Bestätigung',
    bestellungAnlegen: 'Bestellung anlegen',
    neuBestellung: 'Neue Bestellung anlegen',
    zurueckDashboard: 'Zurück zum Dashboard',
    zusammenfassung: 'Zusammenfassung',
    kunde: 'Kunde',
    artikel: 'Artikel',
    betrag: 'Betrag',
    lieferzeit: 'Lieferzeit',
    fahrer: 'Fahrer',
    keinFahrer: 'Noch kein Fahrer zugewiesen',
    bestellungErfolgreich: 'Bestellung erfolgreich angelegt!',
    erforderlich: 'Pflichtfeld',
    saving: 'Wird gespeichert …',
    zone: 'Zone',
    fahrzeug: 'Fahrzeug',
    keineAngabe: 'Keine Angabe',
    keinZugang: 'Dieser Schritt braucht die Auswahl aus Schritt 1.',
    neuStarten: 'Neu starten',
    abbrechen: 'Abbrechen',
    zurueck: '← Zurück',
  },
  en: {
    pageTitle: 'New Order',
    subtitle: 'Create an order step by step',
    step1: 'Customer',
    step2: 'Order Details',
    step3: 'Driver',
    step4: 'Confirmation',
    searchKunde: 'Search customers …',
    noKunden: 'No active customers found',
    neuerKunde: 'Add new customer',
    neuerKundeFirst: 'First name',
    neuerKundeLast: 'Last name',
    neuerKundeEmail: 'E-mail',
    neuerKundePhone: 'Phone',
    anlegen: 'Create',
    orderedItems: 'Ordered items',
    orderedItemsPlaceholder: 'e.g. 2x Margherita, 1x Cola 0.5l …',
    totalAmount: 'Total amount (€)',
    orderDate: 'Order time',
    desiredDelivery: 'Desired delivery time',
    paymentMethod: 'Payment method',
    paymentPlaceholder: 'Select payment method',
    deliveryAddress: 'Delivery address',
    street: 'Street',
    houseNumber: 'House number',
    postalCode: 'Postal code',
    city: 'City',
    deliveryNotes: 'Delivery notes',
    deliveryNotesPlaceholder: 'e.g. 3rd floor, ring bell at Miller …',
    weiterFahrer: 'Next: Assign driver',
    searchFahrer: 'Search drivers …',
    noFahrer: 'No available drivers found',
    fahrerOptional: 'A driver can also be assigned later.',
    ohnefahrer: 'Continue without driver',
    weiterBestaetigung: 'Next: Confirmation',
    bestellungAnlegen: 'Place order',
    neuBestellung: 'New order',
    zurueckDashboard: 'Back to dashboard',
    zusammenfassung: 'Summary',
    kunde: 'Customer',
    artikel: 'Items',
    betrag: 'Amount',
    lieferzeit: 'Delivery time',
    fahrer: 'Driver',
    keinFahrer: 'No driver assigned yet',
    bestellungErfolgreich: 'Order successfully created!',
    erforderlich: 'Required field',
    saving: 'Saving …',
    zone: 'Zone',
    fahrzeug: 'Vehicle',
    keineAngabe: 'Not specified',
    keinZugang: 'This step requires a selection from step 1.',
    neuStarten: 'Restart',
    abbrechen: 'Cancel',
    zurueck: '← Back',
  },
  cs: {
    pageTitle: 'Nová objednávka',
    subtitle: 'Vytvořte objednávku krok za krokem',
    step1: 'Zákazník',
    step2: 'Detaily objednávky',
    step3: 'Řidič',
    step4: 'Potvrzení',
    searchKunde: 'Hledat zákazníky …',
    noKunden: 'Žádní aktivní zákazníci',
    neuerKunde: 'Přidat zákazníka',
    neuerKundeFirst: 'Jméno',
    neuerKundeLast: 'Příjmení',
    neuerKundeEmail: 'E-mail',
    neuerKundePhone: 'Telefon',
    anlegen: 'Vytvořit',
    orderedItems: 'Objednané položky',
    orderedItemsPlaceholder: 'např. 2x Margherita, 1x Cola 0,5l …',
    totalAmount: 'Celková částka (€)',
    orderDate: 'Čas objednávky',
    desiredDelivery: 'Požadovaný čas doručení',
    paymentMethod: 'Způsob platby',
    paymentPlaceholder: 'Vyberte způsob platby',
    deliveryAddress: 'Doručovací adresa',
    street: 'Ulice',
    houseNumber: 'Číslo domu',
    postalCode: 'PSČ',
    city: 'Město',
    deliveryNotes: 'Poznámky k doručení',
    deliveryNotesPlaceholder: 'např. 3. patro, zazvonit u Nováka …',
    weiterFahrer: 'Dále: Přiřadit řidiče',
    searchFahrer: 'Hledat řidiče …',
    noFahrer: 'Žádní dostupní řidiči',
    fahrerOptional: 'Řidič může být přiřazen i později.',
    ohnefahrer: 'Pokračovat bez řidiče',
    weiterBestaetigung: 'Dále: Potvrzení',
    bestellungAnlegen: 'Zadat objednávku',
    neuBestellung: 'Nová objednávka',
    zurueckDashboard: 'Zpět na přehled',
    zusammenfassung: 'Souhrn',
    kunde: 'Zákazník',
    artikel: 'Položky',
    betrag: 'Částka',
    lieferzeit: 'Čas doručení',
    fahrer: 'Řidič',
    keinFahrer: 'Řidič zatím nepřiřazen',
    bestellungErfolgreich: 'Objednávka úspěšně vytvořena!',
    erforderlich: 'Povinné pole',
    saving: 'Ukládám …',
    zone: 'Zóna',
    fahrzeug: 'Vozidlo',
    keineAngabe: 'Neuvedeno',
    keinZugang: 'Tento krok vyžaduje výběr z kroku 1.',
    neuStarten: 'Restartovat',
    abbrechen: 'Zrušit',
    zurueck: '← Zpět',
  },
});

// ─── Lookup options ────────────────────────────────────────────────────────────
const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

// ─── Component ────────────────────────────────────────────────────────────────
export default function NeueBestellungPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  // Step state
  const [step, setStep] = useState(1);

  // Step 1 — Kunde
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newKundeFirst, setNewKundeFirst] = useState('');
  const [newKundeLast, setNewKundeLast] = useState('');
  const [newKundeEmail, setNewKundeEmail] = useState('');
  const [newKundePhone, setNewKundePhone] = useState('');
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

  // Step 3 — Fahrer
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);

  // Step 4 — Confirm
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdBestellungId, setCreatedBestellungId] = useState<string | null>(null);

  // ─── Derived data ──────────────────────────────────────────────────────────
  const activeKunden = useMemo(
    () => (kundenverwaltung as Kundenverwaltung[]).filter(k => k.fields.customer_status?.key === 'aktiv'),
    [kundenverwaltung]
  );

  const availableFahrer = useMemo(
    () => (fahrerverwaltung as Fahrerverwaltung[]).filter(f => f.fields.driver_status?.key === 'verfuegbar'),
    [fahrerverwaltung]
  );

  const selectedKunde = useMemo(
    () => activeKunden.find(k => k.record_id === selectedKundeId) ?? null,
    [activeKunden, selectedKundeId]
  );

  const selectedFahrer = useMemo(
    () => availableFahrer.find(f => f.record_id === selectedFahrerId) ?? null,
    [availableFahrer, selectedFahrerId]
  );

  // ─── Handlers ──────────────────────────────────────────────────────────────
  const handleCreateKunde = async () => {
    if (!newKundeFirst.trim() || !newKundeLast.trim()) return;
    setCreatingKunde(true);
    try {
      const created = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newKundeFirst.trim(),
        last_name: newKundeLast.trim(),
        email: newKundeEmail.trim() || undefined,
        phone: newKundePhone.trim() || undefined,
        customer_status: 'aktiv',
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNewKundeFirst('');
      setNewKundeLast('');
      setNewKundeEmail('');
      setNewKundePhone('');
      setSelectedKundeId(created.record_id);
      setStep(2);
    } finally {
      setCreatingKunde(false);
    }
  };

  const step2Valid = orderedItems.trim().length > 0 && totalAmount.trim().length > 0 && orderDate.length > 0;

  const handleConfirm = async () => {
    if (!selectedKundeId || saving) return;
    // Idempotency guard: if already created, don't create again
    if (createdBestellungId) return;

    setSaving(true);
    setSaveError(null);
    try {
      const payload: Parameters<typeof LivingAppsService.createBestellverwaltungEntry>[0] = {
        ordered_items: orderedItems.trim(),
        total_amount: parseFloat(totalAmount),
        order_date: orderDate,
        order_status: 'neu',
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId),
      };
      if (desiredDeliveryTime) payload.desired_delivery_time = desiredDeliveryTime;
      if (paymentMethodKey && paymentMethodKey !== 'none') payload.payment_method = paymentMethodKey;
      if (deliveryStreet.trim()) payload.delivery_street = deliveryStreet.trim();
      if (deliveryHouseNumber.trim()) payload.delivery_house_number = deliveryHouseNumber.trim();
      if (deliveryPostalCode.trim()) payload.delivery_postal_code = deliveryPostalCode.trim();
      if (deliveryCity.trim()) payload.delivery_city = deliveryCity.trim();
      if (deliveryNotes.trim()) payload.delivery_notes = deliveryNotes.trim();
      if (selectedFahrerId) {
        payload.fahrer = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId);
      }

      const result = await LivingAppsService.createBestellverwaltungEntry(payload);
      setCreatedBestellungId(result.record_id);
      setStep(4);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKundeId(null);
    setShowCreateKunde(false);
    setNewKundeFirst('');
    setNewKundeLast('');
    setNewKundeEmail('');
    setNewKundePhone('');
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
    setSaveError(null);
    setCreatedBestellungId(null);
  };

  // ─── Render ────────────────────────────────────────────────────────────────
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
      {/* ── Step 1: Kunde ─────────────────────────────────────────────────── */}
      {step === 1 && (
        <EntitySelectStep
          items={activeKunden.map(k => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.phone].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={(id) => { setSelectedKundeId(id); setStep(2); }}
          searchPlaceholder={tt('searchKunde')}
          emptyText={tt('noKunden')}
          createLabel={tt('neuerKunde')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={showCreateKunde && (
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>{tt('neuerKundeFirst')} *</Label>
                  <Input
                    value={newKundeFirst}
                    onChange={e => setNewKundeFirst(e.target.value)}
                    placeholder={tt('neuerKundeFirst')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tt('neuerKundeLast')} *</Label>
                  <Input
                    value={newKundeLast}
                    onChange={e => setNewKundeLast(e.target.value)}
                    placeholder={tt('neuerKundeLast')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tt('neuerKundeEmail')}</Label>
                  <Input
                    type="email"
                    value={newKundeEmail}
                    onChange={e => setNewKundeEmail(e.target.value)}
                    placeholder={tt('neuerKundeEmail')}
                  />
                </div>
                <div className="space-y-1">
                  <Label>{tt('neuerKundePhone')}</Label>
                  <Input
                    type="tel"
                    value={newKundePhone}
                    onChange={e => setNewKundePhone(e.target.value)}
                    placeholder={tt('neuerKundePhone')}
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={!newKundeFirst.trim() || !newKundeLast.trim() || creatingKunde}
                  onClick={handleCreateKunde}
                  className="flex-1"
                >
                  {creatingKunde ? tt('saving') : tt('anlegen')}
                </Button>
                <Button variant="outline" onClick={() => setShowCreateKunde(false)}>
                  {tt('abbrechen')}
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* ── Step 2: Bestelldetails ────────────────────────────────────────── */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-5 max-w-2xl">
            {/* Artikel */}
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                <IconPackage size={15} />
                {tt('orderedItems')} *
              </Label>
              <Textarea
                value={orderedItems}
                onChange={e => setOrderedItems(e.target.value)}
                placeholder={tt('orderedItemsPlaceholder')}
                rows={3}
                className="resize-none"
              />
            </div>

            {/* Betrag */}
            <div className="space-y-1">
              <Label className="flex items-center gap-1.5">
                <IconCurrencyEuro size={15} />
                {tt('totalAmount')} *
              </Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={totalAmount}
                onChange={e => setTotalAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Zeitfelder */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5">
                  <IconClock size={15} />
                  {tt('orderDate')} *
                </Label>
                <Input
                  type="datetime-local"
                  value={orderDate}
                  onChange={e => setOrderDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5">
                  <IconClock size={15} />
                  {tt('desiredDelivery')}
                </Label>
                <Input
                  type="datetime-local"
                  value={desiredDeliveryTime}
                  onChange={e => setDesiredDeliveryTime(e.target.value)}
                />
              </div>
            </div>

            {/* Zahlungsart */}
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

            {/* Lieferadresse */}
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <IconMapPin size={15} />
                {tt('deliveryAddress')}
              </Label>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs text-muted-foreground">{tt('street')}</Label>
                  <Input
                    value={deliveryStreet}
                    onChange={e => setDeliveryStreet(e.target.value)}
                    placeholder={tt('street')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tt('houseNumber')}</Label>
                  <Input
                    value={deliveryHouseNumber}
                    onChange={e => setDeliveryHouseNumber(e.target.value)}
                    placeholder="12a"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tt('postalCode')}</Label>
                  <Input
                    value={deliveryPostalCode}
                    onChange={e => setDeliveryPostalCode(e.target.value)}
                    placeholder="12345"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tt('city')}</Label>
                  <Input
                    value={deliveryCity}
                    onChange={e => setDeliveryCity(e.target.value)}
                    placeholder={tt('city')}
                  />
                </div>
              </div>
            </div>

            {/* Lieferhinweise */}
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

            <Button
              className="w-full"
              disabled={!step2Valid}
              onClick={() => setStep(3)}
            >
              {tt('weiterFahrer')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('keinZugang')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Fahrer ────────────────────────────────────────────────── */}
      {step === 3 && (
        selectedKundeId ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">{tt('fahrerOptional')}</p>
            <EntitySelectStep
              items={availableFahrer.map(f => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || f.record_id,
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone ? `${tt('zone')}: ${f.fields.delivery_zone}` : undefined,
                ].filter(Boolean).join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconTruck size={20} className="text-primary" />,
              }))}
              onSelect={(id) => { setSelectedFahrerId(id); setStep(4); }}
              searchPlaceholder={tt('searchFahrer')}
              emptyText={tt('noFahrer')}
            />
            <Button
              variant="outline"
              className="w-full"
              onClick={() => { setSelectedFahrerId(null); setStep(4); }}
            >
              {tt('ohnefahrer')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('keinZugang')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: Bestätigung ───────────────────────────────────────────── */}
      {step === 4 && (
        selectedKundeId ? (
          <div className="space-y-5 max-w-2xl">
            {createdBestellungId ? (
              /* ── Success ── */
              <div className="rounded-2xl border bg-card p-6 space-y-4 text-center">
                <div className="flex justify-center">
                  <div className="rounded-full bg-primary/10 p-4">
                    <IconCheck size={32} className="text-primary" />
                  </div>
                </div>
                <h2 className="text-lg font-semibold">{tt('bestellungErfolgreich')}</h2>
                <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
                  <Button onClick={handleReset}>
                    <IconShoppingCart size={16} className="mr-2" />
                    {tt('neuBestellung')}
                  </Button>
                  <Button variant="outline" asChild>
                    <a href="#/">{tt('zurueckDashboard')}</a>
                  </Button>
                </div>
              </div>
            ) : (
              /* ── Summary + Confirm ── */
              <div className="space-y-4">
                <h3 className="font-semibold text-base">{tt('zusammenfassung')}</h3>

                <div className="rounded-2xl border bg-card overflow-hidden divide-y">
                  {/* Kunde */}
                  <div className="flex items-start gap-3 p-4">
                    <IconUser size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tt('kunde')}</p>
                      <p className="font-medium truncate">
                        {[selectedKunde?.fields.first_name, selectedKunde?.fields.last_name].filter(Boolean).join(' ')}
                      </p>
                      {selectedKunde?.fields.email && (
                        <p className="text-sm text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                      )}
                    </div>
                  </div>

                  {/* Artikel */}
                  <div className="flex items-start gap-3 p-4">
                    <IconPackage size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tt('artikel')}</p>
                      <p className="text-sm whitespace-pre-wrap">{orderedItems}</p>
                    </div>
                  </div>

                  {/* Betrag */}
                  <div className="flex items-start gap-3 p-4">
                    <IconCurrencyEuro size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tt('betrag')}</p>
                      <p className="font-medium">
                        {parseFloat(totalAmount || '0').toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                      </p>
                    </div>
                  </div>

                  {/* Lieferzeit */}
                  <div className="flex items-start gap-3 p-4">
                    <IconClock size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tt('lieferzeit')}</p>
                      <p className="text-sm">{desiredDeliveryTime || tt('keineAngabe')}</p>
                    </div>
                  </div>

                  {/* Fahrer */}
                  <div className="flex items-start gap-3 p-4">
                    <IconTruck size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tt('fahrer')}</p>
                      {selectedFahrer ? (
                        <p className="font-medium">
                          {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name].filter(Boolean).join(' ')}
                          {selectedFahrer.fields.vehicle_type?.label && (
                            <span className="text-muted-foreground font-normal ml-1">
                              · {selectedFahrer.fields.vehicle_type.label}
                            </span>
                          )}
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">{tt('keinFahrer')}</p>
                      )}
                    </div>
                  </div>
                </div>

                {saveError && (
                  <p className="text-sm text-destructive bg-destructive/10 rounded-xl px-4 py-3">{saveError}</p>
                )}

                <Button
                  className="w-full"
                  disabled={saving}
                  onClick={handleConfirm}
                >
                  {saving ? tt('saving') : tt('bestellungAnlegen')}
                </Button>
                <Button variant="outline" className="w-full" onClick={() => setStep(3)}>
                  {tt('zurueck')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('keinZugang')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
