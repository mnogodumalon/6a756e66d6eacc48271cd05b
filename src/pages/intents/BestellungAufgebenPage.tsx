/**
 * Bestellung aufgeben — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen → 2) Bestelldetails eingeben → 3) Fahrer zuweisen & Bestellung erstellen.
 * Reads: kundenverwaltung, fahrerverwaltung. Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { makeT } from '@/i18n';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kundenverwaltung, Fahrerverwaltung } from '@/types/app';
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
  IconTruck,
  IconCheck,
  IconShoppingCart,
  IconMapPin,
} from '@tabler/icons-react';

// ─── i18n ───────────────────────────────────────────────────────────────────

const tt = makeT({
  de: {
    pageTitle: 'Bestellung aufgeben',
    subtitle: 'Schritt für Schritt zur neuen Bestellung',
    stepKunde: 'Kunde',
    stepDetails: 'Bestelldetails',
    stepFahrer: 'Fahrer & Bestätigen',
    searchKunde: 'Kunde suchen …',
    emptyKunde: 'Keine Kunden gefunden',
    neuerKunde: 'Neuen Kunden anlegen',
    vorname: 'Vorname',
    nachname: 'Nachname',
    email: 'E-Mail',
    phone: 'Telefon',
    anlegen: 'Anlegen',
    weiterDetails: 'Weiter zu Bestelldetails',
    weiterFahrer: 'Weiter zu Fahrer & Bestätigen',
    orderedItems: 'Bestellte Artikel',
    orderedItemsPlaceholder: 'z. B. 2x Pizza Margherita, 1x Cola …',
    totalAmount: 'Gesamtbetrag (€)',
    orderDate: 'Bestelldatum & -uhrzeit',
    desiredDelivery: 'Gewünschte Lieferzeit',
    paymentMethod: 'Zahlungsart',
    paymentPlaceholder: 'Zahlungsart wählen …',
    deliveryAddress: 'Lieferadresse',
    street: 'Straße',
    houseNumber: 'Hausnummer',
    postalCode: 'PLZ',
    city: 'Stadt',
    deliveryNotes: 'Lieferhinweise',
    deliveryNotesPlaceholder: 'z. B. Klingeln bei Müller, 3. OG links …',
    searchFahrer: 'Fahrer suchen …',
    emptyFahrer: 'Keine verfügbaren Fahrer',
    ohnefahrer: 'Ohne Fahrer fortfahren',
    bestellungErstellen: 'Bestellung erstellen',
    summaryTitle: 'Zusammenfassung',
    kunde: 'Kunde',
    betrag: 'Betrag',
    lieferzeit: 'Gewünschte Lieferzeit',
    fahrer: 'Fahrer',
    keinFahrer: 'Kein Fahrer zugewiesen',
    successTitle: 'Bestellung aufgegeben!',
    successMsg: 'Die Bestellung wurde erfolgreich angelegt.',
    neueBestellung: 'Neue Bestellung aufgeben',
    zurueck: 'Zurück zum Dashboard',
    pflichtfeld: 'Pflichtfeld',
    creating: 'Wird angelegt …',
    backToKunde: 'Zurück zu Schritt 1',
    backToDetails: 'Zurück zu Schritt 2',
    keinVorname: 'Vorname fehlt',
  },
  en: {
    pageTitle: 'Place Order',
    subtitle: 'Step by step to a new order',
    stepKunde: 'Customer',
    stepDetails: 'Order Details',
    stepFahrer: 'Driver & Confirm',
    searchKunde: 'Search customer …',
    emptyKunde: 'No customers found',
    neuerKunde: 'Add new customer',
    vorname: 'First name',
    nachname: 'Last name',
    email: 'Email',
    phone: 'Phone',
    anlegen: 'Create',
    weiterDetails: 'Continue to order details',
    weiterFahrer: 'Continue to driver & confirm',
    orderedItems: 'Ordered items',
    orderedItemsPlaceholder: 'e.g. 2x Margherita pizza, 1x Cola …',
    totalAmount: 'Total amount (€)',
    orderDate: 'Order date & time',
    desiredDelivery: 'Desired delivery time',
    paymentMethod: 'Payment method',
    paymentPlaceholder: 'Select payment method …',
    deliveryAddress: 'Delivery address',
    street: 'Street',
    houseNumber: 'House number',
    postalCode: 'Postal code',
    city: 'City',
    deliveryNotes: 'Delivery notes',
    deliveryNotesPlaceholder: 'e.g. Ring Müller, 3rd floor left …',
    searchFahrer: 'Search driver …',
    emptyFahrer: 'No available drivers',
    ohnefahrer: 'Continue without driver',
    bestellungErstellen: 'Create order',
    summaryTitle: 'Summary',
    kunde: 'Customer',
    betrag: 'Amount',
    lieferzeit: 'Desired delivery time',
    fahrer: 'Driver',
    keinFahrer: 'No driver assigned',
    successTitle: 'Order placed!',
    successMsg: 'The order was successfully created.',
    neueBestellung: 'Place new order',
    zurueck: 'Back to dashboard',
    pflichtfeld: 'Required field',
    creating: 'Creating …',
    backToKunde: 'Back to step 1',
    backToDetails: 'Back to step 2',
    keinVorname: 'First name missing',
  },
});

// ─── Lookup constants ────────────────────────────────────────────────────────

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

// ─── Component ───────────────────────────────────────────────────────────────

export default function BestellungAufgebenPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  // ── Wizard step ──
  const [step, setStep] = useState(1);

  // ── Step 1: Kunde ──
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newKundeVorname, setNewKundeVorname] = useState('');
  const [newKundeNachname, setNewKundeNachname] = useState('');
  const [newKundeEmail, setNewKundeEmail] = useState('');
  const [newKundePhone, setNewKundePhone] = useState('');
  const [creatingKunde, setCreatingKunde] = useState(false);

  // ── Step 2: Bestelldetails ──
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

  // ── Step 3: Fahrer & Erstellen ──
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // ── Auto-fill delivery address from selected customer ──
  useEffect(() => {
    if (selectedKundeId) {
      const kunde = kundenverwaltung.find((k: Kundenverwaltung) => k.record_id === selectedKundeId);
      if (kunde) {
        setDeliveryStreet(kunde.fields.street ?? '');
        setDeliveryHouseNumber(kunde.fields.house_number ?? '');
        setDeliveryPostalCode(kunde.fields.postal_code ?? '');
        setDeliveryCity(kunde.fields.city ?? '');
      }
    }
  }, [selectedKundeId, kundenverwaltung]);

  // ── Derived data ──
  const selectedKunde = selectedKundeId
    ? kundenverwaltung.find((k: Kundenverwaltung) => k.record_id === selectedKundeId) ?? null
    : null;

  const selectedFahrer = selectedFahrerId
    ? fahrerverwaltung.find((f: Fahrerverwaltung) => f.record_id === selectedFahrerId) ?? null
    : null;

  const availableFahrer = fahrerverwaltung.filter(
    (f: Fahrerverwaltung) => f.fields.driver_status?.key === 'verfuegbar'
  );

  // ── Handlers ──

  const handleCreateKunde = async () => {
    if (!newKundeVorname.trim()) return;
    setCreatingKunde(true);
    try {
      const created = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newKundeVorname.trim(),
        last_name: newKundeNachname.trim() || undefined,
        email: newKundeEmail.trim() || undefined,
        phone: newKundePhone.trim() || undefined,
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNewKundeVorname('');
      setNewKundeNachname('');
      setNewKundeEmail('');
      setNewKundePhone('');
      setSelectedKundeId(created.record_id);
      setStep(2);
    } finally {
      setCreatingKunde(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (createdOrderId) return; // idempotency guard
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await LivingAppsService.createBestellverwaltungEntry({
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId!),
        fahrer: selectedFahrerId
          ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId)
          : undefined,
        ordered_items: orderedItems,
        total_amount: parseFloat(totalAmount) || undefined,
        order_date: orderDate || undefined,
        desired_delivery_time: desiredDeliveryTime || undefined,
        payment_method: paymentMethodKey !== 'none' && paymentMethodKey ? paymentMethodKey : undefined,
        delivery_street: deliveryStreet || undefined,
        delivery_house_number: deliveryHouseNumber || undefined,
        delivery_postal_code: deliveryPostalCode || undefined,
        delivery_city: deliveryCity || undefined,
        delivery_notes: deliveryNotes || undefined,
        order_status: 'neu',
      });
      setCreatedOrderId(result.record_id);
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
    setSelectedFahrerId(null);
    setSubmitError(null);
    setCreatedOrderId(null);
  };

  // ── Render ──

  return (
    <IntentWizardShell
      title={tt('pageTitle')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('stepKunde') },
        { label: tt('stepDetails') },
        { label: tt('stepFahrer') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Kunde wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={kundenverwaltung.map((k: Kundenverwaltung) => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.phone].filter(Boolean).join(' · ') || undefined,
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
          createLabel={tt('neuerKunde')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={
            showCreateKunde ? (
              <div className="rounded-2xl border p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="nkv">{tt('vorname')} *</Label>
                    <Input
                      id="nkv"
                      value={newKundeVorname}
                      onChange={(e) => setNewKundeVorname(e.target.value)}
                      placeholder={tt('vorname')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="nkn">{tt('nachname')}</Label>
                    <Input
                      id="nkn"
                      value={newKundeNachname}
                      onChange={(e) => setNewKundeNachname(e.target.value)}
                      placeholder={tt('nachname')}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="nke">{tt('email')}</Label>
                    <Input
                      id="nke"
                      type="email"
                      value={newKundeEmail}
                      onChange={(e) => setNewKundeEmail(e.target.value)}
                      placeholder={tt('email')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="nkp">{tt('phone')}</Label>
                    <Input
                      id="nkp"
                      type="tel"
                      value={newKundePhone}
                      onChange={(e) => setNewKundePhone(e.target.value)}
                      placeholder={tt('phone')}
                    />
                  </div>
                </div>
                <Button
                  disabled={!newKundeVorname.trim() || creatingKunde}
                  onClick={handleCreateKunde}
                  className="w-full"
                >
                  {creatingKunde ? tt('creating') : tt('anlegen')}
                </Button>
              </div>
            ) : null
          }
        />
      )}

      {/* ── Step 2: Bestelldetails ── */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-6">
            {/* Ausgewählter Kunde */}
            <div className="rounded-2xl border bg-secondary/30 p-4 flex items-center gap-3">
              <IconUser size={20} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </p>
                {selectedKunde.fields.email && (
                  <p className="text-sm text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                )}
              </div>
            </div>

            {/* Bestellformular */}
            <div className="space-y-4">
              {/* ordered_items */}
              <div className="space-y-1">
                <Label htmlFor="oi">{tt('orderedItems')} *</Label>
                <Textarea
                  id="oi"
                  value={orderedItems}
                  onChange={(e) => setOrderedItems(e.target.value)}
                  placeholder={tt('orderedItemsPlaceholder')}
                  rows={3}
                />
              </div>

              {/* total_amount */}
              <div className="space-y-1">
                <Label htmlFor="ta">{tt('totalAmount')} *</Label>
                <Input
                  id="ta"
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* order_date */}
                <div className="space-y-1">
                  <Label htmlFor="od">{tt('orderDate')} *</Label>
                  <Input
                    id="od"
                    type="datetime-local"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </div>

                {/* desired_delivery_time */}
                <div className="space-y-1">
                  <Label htmlFor="ddt">{tt('desiredDelivery')}</Label>
                  <Input
                    id="ddt"
                    type="datetime-local"
                    value={desiredDeliveryTime}
                    onChange={(e) => setDesiredDeliveryTime(e.target.value)}
                  />
                </div>
              </div>

              {/* payment_method */}
              <div className="space-y-1">
                <Label>{tt('paymentMethod')}</Label>
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

              {/* Lieferadresse */}
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <IconMapPin size={16} className="text-primary" />
                  {tt('deliveryAddress')}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor="ds">{tt('street')}</Label>
                    <Input
                      id="ds"
                      value={deliveryStreet}
                      onChange={(e) => setDeliveryStreet(e.target.value)}
                      placeholder={tt('street')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="dhn">{tt('houseNumber')}</Label>
                    <Input
                      id="dhn"
                      value={deliveryHouseNumber}
                      onChange={(e) => setDeliveryHouseNumber(e.target.value)}
                      placeholder={tt('houseNumber')}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label htmlFor="dpc">{tt('postalCode')}</Label>
                    <Input
                      id="dpc"
                      value={deliveryPostalCode}
                      onChange={(e) => setDeliveryPostalCode(e.target.value)}
                      placeholder={tt('postalCode')}
                    />
                  </div>
                  <div className="sm:col-span-2 space-y-1">
                    <Label htmlFor="dc">{tt('city')}</Label>
                    <Input
                      id="dc"
                      value={deliveryCity}
                      onChange={(e) => setDeliveryCity(e.target.value)}
                      placeholder={tt('city')}
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor="dn">{tt('deliveryNotes')}</Label>
                  <Textarea
                    id="dn"
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                    placeholder={tt('deliveryNotesPlaceholder')}
                    rows={2}
                  />
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                variant="outline"
                onClick={() => setStep(1)}
                className="w-full sm:w-auto"
              >
                {tt('backToKunde')}
              </Button>
              <Button
                disabled={!orderedItems.trim() || !totalAmount || !orderDate}
                onClick={() => setStep(3)}
                className="w-full sm:flex-1"
              >
                {tt('weiterFahrer')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('backToKunde')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('backToKunde')}
            </Button>
          </div>
        )
      )}

      {/* ── Step 3: Fahrer & Bestätigen ── */}
      {step === 3 && (
        selectedKunde ? (
          <div className="space-y-6">
            {/* Zusammenfassung */}
            <div className="rounded-2xl border bg-secondary/30 p-4 space-y-3">
              <h3 className="font-semibold text-sm">{tt('summaryTitle')}</h3>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <span className="text-muted-foreground">{tt('kunde')}</span>
                <span className="font-medium truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </span>

                <span className="text-muted-foreground">{tt('betrag')}</span>
                <span className="font-medium">
                  {totalAmount ? `${parseFloat(totalAmount).toFixed(2)} €` : '—'}
                </span>

                {desiredDeliveryTime && (
                  <>
                    <span className="text-muted-foreground">{tt('lieferzeit')}</span>
                    <span className="font-medium">{desiredDeliveryTime.replace('T', ' ')}</span>
                  </>
                )}

                <span className="text-muted-foreground">{tt('fahrer')}</span>
                <span className="font-medium">
                  {selectedFahrer
                    ? [selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name]
                        .filter(Boolean)
                        .join(' ')
                    : tt('keinFahrer')}
                </span>
              </div>
            </div>

            {/* Erfolgreich erstellt */}
            {createdOrderId ? (
              <div className="rounded-2xl border border-green-200 bg-green-50 p-6 text-center space-y-4">
                <div className="flex justify-center">
                  <div className="rounded-full bg-green-100 p-3">
                    <IconCheck size={28} className="text-green-600" stroke={2} />
                  </div>
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{tt('successTitle')}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{tt('successMsg')}</p>
                </div>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Button onClick={handleReset} variant="outline">
                    {tt('neueBestellung')}
                  </Button>
                  <a href="#/">
                    <Button className="w-full">{tt('zurueck')}</Button>
                  </a>
                </div>
              </div>
            ) : (
              <>
                {/* Fahrer wählen */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <IconTruck size={16} className="text-primary" />
                    {tt('stepFahrer')}
                  </div>
                  <EntitySelectStep
                    items={availableFahrer.map((f: Fahrerverwaltung) => ({
                      id: f.record_id,
                      title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || f.record_id,
                      subtitle: [
                        f.fields.vehicle_type?.label,
                        f.fields.delivery_zone,
                      ]
                        .filter(Boolean)
                        .join(' · ') || undefined,
                      status: f.fields.driver_status
                        ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                        : undefined,
                      icon: <IconTruck size={20} className="text-primary" />,
                    }))}
                    onSelect={(id) => setSelectedFahrerId(id === selectedFahrerId ? null : id)}
                    searchPlaceholder={tt('searchFahrer')}
                    emptyText={tt('emptyFahrer')}
                  />
                </div>

                {submitError && (
                  <p className="text-sm text-destructive rounded-xl border border-destructive/30 bg-destructive/10 p-3">
                    {submitError}
                  </p>
                )}

                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setStep(2)}
                    className="w-full sm:w-auto"
                  >
                    {tt('backToDetails')}
                  </Button>
                  <Button
                    disabled={submitting}
                    onClick={handleSubmitOrder}
                    className="w-full sm:flex-1"
                  >
                    <IconShoppingCart size={16} stroke={2} className="mr-2" />
                    {submitting ? tt('creating') : tt('bestellungErstellen')}
                  </Button>
                </div>

                {!selectedFahrerId && (
                  <p className="text-xs text-center text-muted-foreground">{tt('ohnefahrer')}</p>
                )}
              </>
            )}
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('backToKunde')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tt('backToKunde')}
            </Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
