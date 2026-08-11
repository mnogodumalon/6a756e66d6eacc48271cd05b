/**
 * Bestellung aufgeben — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen → 2) Bestelldetails eingeben → 3) Bestellung anlegen & Bestätigung.
 * Reads: kundenverwaltung. Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */

import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { IconShoppingCart, IconUser, IconCheck, IconPlus } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kundenverwaltung } from '@/types/app';
import { makeT } from '@/i18n';

const tt = makeT({
  de: {
    title: 'Bestellung aufgeben', /* i18n-exempt */
    subtitle: 'In 3 Schritten zur neuen Bestellung',
    stepKunde: 'Kunde',
    stepDetails: 'Details',
    stepBestaetigung: 'Bestätigung',
    kundeWaehlen: 'Kunde auswählen',
    kundeNeu: 'Neuen Kunden anlegen',
    vorname: 'Vorname',
    nachname: 'Nachname',
    email: 'E-Mail',
    telefon: 'Telefon',
    anlegen: 'Anlegen',
    weiterZuDetails: 'Weiter zu Bestelldetails',
    bestelldetails: 'Bestelldetails',
    ausgewaehlterKunde: 'Ausgewählter Kunde',
    bestellteArtikel: 'Bestellte Artikel',
    bestellteArtikelPlaceholder: 'z.B. 2x Pizza Margherita, 1x Cola',
    gesamtbetrag: 'Gesamtbetrag (€)',
    bestelldatum: 'Bestelldatum & Uhrzeit',
    gewuenschtelieferzeit: 'Gewünschte Lieferzeit (optional)',
    zahlungsmethode: 'Zahlungsmethode (optional)',
    zahlungsmethodeWaehlen: 'Zahlungsmethode wählen',
    keineZahlungsmethode: 'Keine Angabe',
    lieferadresse: 'Lieferadresse',
    strasse: 'Straße',
    hausnummer: 'Hausnummer',
    plz: 'PLZ',
    stadt: 'Stadt',
    lieferhinweise: 'Lieferhinweise (optional)',
    lieferhinweisePlaceholder: 'z.B. 2. Etage, klingeln bei Müller',
    bestellungAbschicken: 'Bestellung abschicken',
    bestellungErfolgreich: 'Bestellung erfolgreich aufgegeben!',
    bestellnummer: 'Bestellnummer',
    neueBestellung: 'Neue Bestellung anlegen',
    zurueckDashboard: 'Zurück zum Dashboard',
    pflichtfeld: 'Pflichtfeld',
    adresseVorausgefuellt: 'Lieferadresse wurde aus Kundendaten übernommen.',
    fehler: 'Fehler beim Anlegen der Bestellung. Bitte erneut versuchen.',
    schrittBrauchtKunde: 'Dieser Schritt benötigt einen ausgewählten Kunden.',
    neuStarten: 'Neu starten',
  },
  en: {
    title: 'Place Order', /* i18n-exempt */
    subtitle: 'Create a new order in 3 steps',
    stepKunde: 'Customer',
    stepDetails: 'Details',
    stepBestaetigung: 'Confirmation',
    kundeWaehlen: 'Select customer',
    kundeNeu: 'Add new customer',
    vorname: 'First name',
    nachname: 'Last name',
    email: 'Email',
    telefon: 'Phone',
    anlegen: 'Create',
    weiterZuDetails: 'Continue to order details',
    bestelldetails: 'Order details',
    ausgewaehlterKunde: 'Selected customer',
    bestellteArtikel: 'Ordered items',
    bestellteArtikelPlaceholder: 'e.g. 2x Pizza Margherita, 1x Cola',
    gesamtbetrag: 'Total amount (€)',
    bestelldatum: 'Order date & time',
    gewuenschtelieferzeit: 'Desired delivery time (optional)',
    zahlungsmethode: 'Payment method (optional)',
    zahlungsmethodeWaehlen: 'Select payment method',
    keineZahlungsmethode: 'No preference',
    lieferadresse: 'Delivery address',
    strasse: 'Street',
    hausnummer: 'House number',
    plz: 'Postal code',
    stadt: 'City',
    lieferhinweise: 'Delivery notes (optional)',
    lieferhinweisePlaceholder: 'e.g. 2nd floor, ring at Müller',
    bestellungAbschicken: 'Place order',
    bestellungErfolgreich: 'Order placed successfully!',
    bestellnummer: 'Order number',
    neueBestellung: 'Place new order',
    zurueckDashboard: 'Back to dashboard',
    pflichtfeld: 'Required field',
    adresseVorausgefuellt: 'Delivery address pre-filled from customer data.',
    fehler: 'Error placing the order. Please try again.',
    schrittBrauchtKunde: 'This step requires a selected customer.',
    neuStarten: 'Start over',
  },
});

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function BestellungAufgebenPage() {
  const { kundenverwaltung, loading, error, fetchAll } = useDashboardData();

  // Wizard state
  const [step, setStep] = useState(1);
  const [selectedKunde, setSelectedKunde] = useState<Kundenverwaltung | null>(null);

  // New customer mini-form
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [creatingKunde, setCreatingKunde] = useState(false);

  // Order details form
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

  // Submit state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Filter: exclude gesperrt customers
  const eligibleKunden = useMemo(
    () => kundenverwaltung.filter(k => k.fields.customer_status?.key !== 'gesperrt'),
    [kundenverwaltung]
  );

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

  const handleCreateKunde = async () => {
    if (!newFirstName || !newLastName) return;
    setCreatingKunde(true);
    try {
      const created = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newFirstName,
        last_name: newLastName,
        email: newEmail || undefined,
        phone: newPhone || undefined,
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNewFirstName('');
      setNewLastName('');
      setNewEmail('');
      setNewPhone('');
      // auto-select newly created customer
      const newKunde: Kundenverwaltung = {
        record_id: created.record_id,
        created_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        updated_at: null,
        createdat: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        updatedat: null,
        fields: {
          first_name: newFirstName,
          last_name: newLastName,
          email: newEmail || undefined,
          phone: newPhone || undefined,
        },
      };
      setSelectedKunde(newKunde);
      setDeliveryStreet('');
      setDeliveryHouseNumber('');
      setDeliveryPostalCode('');
      setDeliveryCity('');
      setStep(2);
    } finally {
      setCreatingKunde(false);
    }
  };

  const handleSubmitOrder = async () => {
    if (!selectedKunde || !orderedItems || !totalAmount || !orderDate) return;
    if (createdOrderId) return; // idempotency guard

    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Record<string, unknown> = {
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id),
        ordered_items: orderedItems,
        total_amount: parseFloat(totalAmount),
        order_date: orderDate,
        order_status: 'neu',
        delivery_street: deliveryStreet || undefined,
        delivery_house_number: deliveryHouseNumber || undefined,
        delivery_postal_code: deliveryPostalCode || undefined,
        delivery_city: deliveryCity || undefined,
      };
      if (desiredDeliveryTime) payload.desired_delivery_time = desiredDeliveryTime;
      if (paymentMethodKey && paymentMethodKey !== 'none') payload.payment_method = paymentMethodKey;
      if (deliveryNotes) payload.delivery_notes = deliveryNotes;

      const result = await LivingAppsService.createBestellverwaltungEntry(payload);
      setCreatedOrderId(result.record_id);
      setStep(3);
    } catch {
      setSubmitError(tt('fehler'));
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

  const detailsValid = !!orderedItems.trim() && !!totalAmount && parseFloat(totalAmount) > 0 && !!orderDate;

  const kundenItems = eligibleKunden.map(k => ({
    id: k.record_id,
    title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
    subtitle: [k.fields.email, k.fields.phone].filter(Boolean).join(' · '),
    status: k.fields.customer_status
      ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
      : undefined,
    icon: <IconUser size={20} className="text-primary" />,
  }));

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('stepKunde') },
        { label: tt('stepDetails') },
        { label: tt('stepBestaetigung') },
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
          items={kundenItems}
          onSelect={handleKundeSelect}
          createLabel={tt('kundeNeu')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={
            showCreateKunde ? (
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <p className="text-sm font-medium">{tt('kundeNeu')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    value={newFirstName}
                    onChange={e => setNewFirstName(e.target.value)}
                    placeholder={tt('vorname')}
                  />
                  <Input
                    value={newLastName}
                    onChange={e => setNewLastName(e.target.value)}
                    placeholder={tt('nachname')}
                  />
                  <Input
                    type="email"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder={tt('email')}
                  />
                  <Input
                    type="tel"
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder={tt('telefon')}
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    disabled={!newFirstName || !newLastName || creatingKunde}
                    onClick={handleCreateKunde}
                    className="flex-1"
                  >
                    <IconPlus size={16} className="mr-1" />
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

      {/* Step 2: Bestelldetails */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-5">
            {/* Kundenzusammenfassung */}
            <div className="rounded-2xl border bg-card p-4 flex items-start gap-3">
              <IconUser size={20} className="text-primary mt-0.5 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{tt('ausgewaehlterKunde')}</p>
                <p className="font-medium truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </p>
                {(selectedKunde.fields.email || selectedKunde.fields.phone) && (
                  <p className="text-sm text-muted-foreground truncate">
                    {[selectedKunde.fields.email, selectedKunde.fields.phone].filter(Boolean).join(' · ')}
                  </p>
                )}
                {(selectedKunde.fields.street || selectedKunde.fields.city) && (
                  <p className="text-sm text-muted-foreground truncate">
                    {[
                      selectedKunde.fields.street,
                      selectedKunde.fields.house_number,
                      selectedKunde.fields.postal_code,
                      selectedKunde.fields.city,
                    ].filter(Boolean).join(' ')}
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={() => setStep(1)}>
                Ändern
              </Button>
            </div>

            {/* Bestelldetails-Formular */}
            <div className="rounded-2xl border bg-card p-4 space-y-4">
              <p className="font-medium">{tt('bestelldetails')}</p>

              <div className="space-y-1">
                <label className="text-sm font-medium">
                  {tt('bestellteArtikel')} <span className="text-destructive">*</span>
                </label>
                <Textarea
                  value={orderedItems}
                  onChange={e => setOrderedItems(e.target.value)}
                  placeholder={tt('bestellteArtikelPlaceholder')}
                  rows={3}
                  className="resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    {tt('gesamtbetrag')} <span className="text-destructive">*</span>
                  </label>
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
                  <label className="text-sm font-medium">
                    {tt('zahlungsmethode')}
                  </label>
                  <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={tt('zahlungsmethodeWaehlen')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tt('keineZahlungsmethode')}</SelectItem>
                      {PAYMENT_OPTIONS.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">
                    {tt('bestelldatum')} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="datetime-local"
                    value={orderDate}
                    onChange={e => setOrderDate(e.target.value)}
                    className="w-full"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium">{tt('gewuenschtelieferzeit')}</label>
                  <Input
                    type="datetime-local"
                    value={desiredDeliveryTime}
                    onChange={e => setDesiredDeliveryTime(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Lieferadresse */}
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="font-medium">{tt('lieferadresse')}</p>
              {(selectedKunde.fields.street || selectedKunde.fields.city) && (
                <p className="text-xs text-muted-foreground">{tt('adresseVorausgefuellt')}</p>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  value={deliveryStreet}
                  onChange={e => setDeliveryStreet(e.target.value)}
                  placeholder={tt('strasse')}
                  className="sm:col-span-1"
                />
                <Input
                  value={deliveryHouseNumber}
                  onChange={e => setDeliveryHouseNumber(e.target.value)}
                  placeholder={tt('hausnummer')}
                />
                <Input
                  value={deliveryPostalCode}
                  onChange={e => setDeliveryPostalCode(e.target.value)}
                  placeholder={tt('plz')}
                />
                <Input
                  value={deliveryCity}
                  onChange={e => setDeliveryCity(e.target.value)}
                  placeholder={tt('stadt')}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">{tt('lieferhinweise')}</label>
                <Textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={tt('lieferhinweisePlaceholder')}
                  rows={2}
                  className="resize-none"
                />
              </div>
            </div>

            {submitError && (
              <p className="text-sm text-destructive">{submitError}</p>
            )}

            <div className="flex gap-3">
              <Button variant="outline" onClick={() => setStep(1)} className="shrink-0">
                Zurück
              </Button>
              <Button
                className="flex-1"
                disabled={!detailsValid || submitting}
                onClick={handleSubmitOrder}
              >
                <IconShoppingCart size={16} className="mr-2" />
                {submitting ? 'Wird angelegt…' : tt('bestellungAbschicken')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('schrittBrauchtKunde')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}

      {/* Step 3: Bestätigung */}
      {step === 3 && (
        createdOrderId ? (
          <div className="text-center py-10 space-y-5">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <IconCheck size={32} className="text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-semibold">{tt('bestellungErfolgreich')}</p>
              <p className="text-sm text-muted-foreground">
                {tt('bestellnummer')}: <span className="font-mono font-medium">{createdOrderId}</span>
              </p>
              {selectedKunde && (
                <p className="text-sm text-muted-foreground">
                  Kunde: {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset}>
                <IconShoppingCart size={16} className="mr-2" />
                {tt('neueBestellung')}
              </Button>
              <Button variant="outline" asChild>
                <a href="#/">{tt('zurueckDashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('schrittBrauchtKunde')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStarten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
