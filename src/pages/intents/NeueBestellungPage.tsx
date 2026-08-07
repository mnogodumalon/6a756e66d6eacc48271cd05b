/**
 * Neue Bestellung — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen (aktive Kunden) → 2) Bestelldetails erfassen → 3) Fahrer zuweisen & speichern.
 * Reads: kundenverwaltung (filter: customer_status=aktiv), fahrerverwaltung (filter: driver_status=verfuegbar).
 * Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
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
  IconBike,
  IconCar,
  IconMotorbike,
} from '@tabler/icons-react';
import { makeT } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kundenverwaltung, Fahrerverwaltung } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ─── i18n ────────────────────────────────────────────────────────────────────

const tt = makeT({
  de: {
    title: 'Neue Bestellung',
    subtitle: 'Schritt für Schritt zur fertigen Bestellung',
    stepKunde: 'Kunde',
    stepDetails: 'Details',
    stepFahrer: 'Fahrer',
    stepConfirm: 'Fertig',
    searchKunde: 'Kunden suchen …',
    emptyKunde: 'Keine aktiven Kunden gefunden',
    newKunde: 'Neuen Kunden anlegen',
    kundeVorname: 'Vorname',
    kundeNachname: 'Nachname',
    kundeEmail: 'E-Mail',
    kundeTelefon: 'Telefon',
    kundeStadt: 'Stadt',
    anlegen: 'Anlegen',
    weiterDetails: 'Weiter zu Bestelldetails',
    detailsTitle: 'Bestelldetails erfassen',
    orderedItems: 'Bestellte Artikel',
    totalAmount: 'Gesamtbetrag (€)',
    orderDate: 'Bestellzeitpunkt',
    desiredDelivery: 'Gewünschte Lieferzeit',
    deliveryAddress: 'Lieferadresse',
    deliveryStreet: 'Straße',
    deliveryHouseNumber: 'Hausnummer',
    deliveryPostalCode: 'Postleitzahl',
    deliveryCity: 'Stadt',
    paymentMethod: 'Zahlungsart',
    paymentPlaceholder: 'Zahlungsart wählen',
    deliveryNotes: 'Lieferhinweise',
    weiterFahrer: 'Weiter zur Fahrerzuweisung',
    searchFahrer: 'Fahrer suchen …',
    emptyFahrer: 'Keine verfügbaren Fahrer',
    newFahrer: 'Neuen Fahrer anlegen',
    fahrerVorname: 'Vorname',
    fahrerNachname: 'Nachname',
    fahrerTelefon: 'Telefon',
    fahrerZone: 'Lieferzone',
    ohnefahrer: 'Ohne Fahrer fortfahren',
    bestellungSpeichern: 'Bestellung anlegen',
    saving: 'Wird gespeichert …',
    successTitle: 'Bestellung angelegt!',
    successSub: 'Die Bestellung wurde erfolgreich erstellt.',
    neueBest: 'Neue Bestellung anlegen',
    dashboard: 'Zurück zum Dashboard',
    selectedKunde: 'Gewählter Kunde',
    fahrerZugewiesen: 'Fahrer zugewiesen',
    ohnefahrerLabel: 'Kein Fahrer',
    zone: 'Zone',
    fahrzeug: 'Fahrzeug',
    orderSummary: 'Bestellübersicht',
    kunde: 'Kunde',
    betrag: 'Betrag',
    bestellzeitpunkt: 'Bestellzeitpunkt',
    lieferzeit: 'Lieferzeit',
    adresse: 'Adresse',
    zahlung: 'Zahlung',
    fahrer: 'Fahrer',
    status: 'Status',
    zurueck: 'Zurück',
    requiredField: 'Pflichtfeld',
    missingStep: 'Dieser Schritt benötigt die Auswahl aus Schritt 1.',
    missingStep2: 'Dieser Schritt benötigt die Daten aus Schritt 2.',
    neuStart: 'Neu starten',
    newKundeTitle: 'Neuen Kunden anlegen',
    newFahrerTitle: 'Neuen Fahrer anlegen',
  },
  en: {
    title: 'New Order',
    subtitle: 'Step by step to a completed order',
    stepKunde: 'Customer',
    stepDetails: 'Details',
    stepFahrer: 'Driver',
    stepConfirm: 'Done',
    searchKunde: 'Search customers …',
    emptyKunde: 'No active customers found',
    newKunde: 'Add new customer',
    kundeVorname: 'First name',
    kundeNachname: 'Last name',
    kundeEmail: 'Email',
    kundeTelefon: 'Phone',
    kundeStadt: 'City',
    anlegen: 'Create',
    weiterDetails: 'Continue to order details',
    detailsTitle: 'Enter order details',
    orderedItems: 'Ordered items',
    totalAmount: 'Total amount (€)',
    orderDate: 'Order date/time',
    desiredDelivery: 'Desired delivery time',
    deliveryAddress: 'Delivery address',
    deliveryStreet: 'Street',
    deliveryHouseNumber: 'House number',
    deliveryPostalCode: 'Postal code',
    deliveryCity: 'City',
    paymentMethod: 'Payment method',
    paymentPlaceholder: 'Select payment method',
    deliveryNotes: 'Delivery notes',
    weiterFahrer: 'Continue to driver assignment',
    searchFahrer: 'Search drivers …',
    emptyFahrer: 'No available drivers',
    newFahrer: 'Add new driver',
    fahrerVorname: 'First name',
    fahrerNachname: 'Last name',
    fahrerTelefon: 'Phone',
    fahrerZone: 'Delivery zone',
    ohnefahrer: 'Continue without driver',
    bestellungSpeichern: 'Create order',
    saving: 'Saving …',
    successTitle: 'Order created!',
    successSub: 'The order was successfully created.',
    neueBest: 'New order',
    dashboard: 'Back to dashboard',
    selectedKunde: 'Selected customer',
    fahrerZugewiesen: 'Driver assigned',
    ohnefahrerLabel: 'No driver',
    zone: 'Zone',
    fahrzeug: 'Vehicle',
    orderSummary: 'Order summary',
    kunde: 'Customer',
    betrag: 'Amount',
    bestellzeitpunkt: 'Order time',
    lieferzeit: 'Delivery time',
    adresse: 'Address',
    zahlung: 'Payment',
    fahrer: 'Driver',
    status: 'Status',
    zurueck: 'Back',
    requiredField: 'Required field',
    missingStep: 'This step requires the selection from step 1.',
    missingStep2: 'This step requires the data from step 2.',
    neuStart: 'Restart',
    newKundeTitle: 'Add new customer',
    newFahrerTitle: 'Add new driver',
  },
  cs: {
    title: 'Nová objednávka',
    subtitle: 'Krok za krokem k dokončené objednávce',
    stepKunde: 'Zákazník',
    stepDetails: 'Detaily',
    stepFahrer: 'Řidič',
    stepConfirm: 'Hotovo',
    searchKunde: 'Hledat zákazníky …',
    emptyKunde: 'Nenalezeni žádní aktivní zákazníci',
    newKunde: 'Přidat nového zákazníka',
    kundeVorname: 'Jméno',
    kundeNachname: 'Příjmení',
    kundeEmail: 'E-mail',
    kundeTelefon: 'Telefon',
    kundeStadt: 'Město',
    anlegen: 'Vytvořit',
    weiterDetails: 'Pokračovat k detailům objednávky',
    detailsTitle: 'Zadat detaily objednávky',
    orderedItems: 'Objednané položky',
    totalAmount: 'Celková částka (€)',
    orderDate: 'Čas objednávky',
    desiredDelivery: 'Požadovaný čas doručení',
    deliveryAddress: 'Doručovací adresa',
    deliveryStreet: 'Ulice',
    deliveryHouseNumber: 'Číslo domu',
    deliveryPostalCode: 'PSČ',
    deliveryCity: 'Město',
    paymentMethod: 'Způsob platby',
    paymentPlaceholder: 'Vyberte způsob platby',
    deliveryNotes: 'Poznámky k doručení',
    weiterFahrer: 'Pokračovat k přiřazení řidiče',
    searchFahrer: 'Hledat řidiče …',
    emptyFahrer: 'Žádní dostupní řidiči',
    newFahrer: 'Přidat nového řidiče',
    fahrerVorname: 'Jméno',
    fahrerNachname: 'Příjmení',
    fahrerTelefon: 'Telefon',
    fahrerZone: 'Doručovací zóna',
    ohnefahrer: 'Pokračovat bez řidiče',
    bestellungSpeichern: 'Vytvořit objednávku',
    saving: 'Ukládá se …',
    successTitle: 'Objednávka vytvořena!',
    successSub: 'Objednávka byla úspěšně vytvořena.',
    neueBest: 'Nová objednávka',
    dashboard: 'Zpět na přehled',
    selectedKunde: 'Vybraný zákazník',
    fahrerZugewiesen: 'Přiřazený řidič',
    ohnefahrerLabel: 'Bez řidiče',
    zone: 'Zóna',
    fahrzeug: 'Vozidlo',
    orderSummary: 'Přehled objednávky',
    kunde: 'Zákazník',
    betrag: 'Částka',
    bestellzeitpunkt: 'Čas objednávky',
    lieferzeit: 'Čas doručení',
    adresse: 'Adresa',
    zahlung: 'Platba',
    fahrer: 'Řidič',
    status: 'Stav',
    zurueck: 'Zpět',
    requiredField: 'Povinné pole',
    missingStep: 'Tento krok vyžaduje výběr z kroku 1.',
    missingStep2: 'Tento krok vyžaduje data z kroku 2.',
    neuStart: 'Začít znovu',
    newKundeTitle: 'Přidat nového zákazníka',
    newFahrerTitle: 'Přidat nového řidiče',
  },
});

// ─── Lookup options ───────────────────────────────────────────────────────────

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];
const VEHICLE_OPTIONS = LOOKUP_OPTIONS['fahrerverwaltung']?.['vehicle_type'] ?? [];

// ─── Vehicle icon helper ──────────────────────────────────────────────────────

function VehicleIcon({ vehicleKey }: { vehicleKey?: string }) {
  if (vehicleKey === 'fahrrad' || vehicleKey === 'e_bike') return <IconBike size={16} />;
  if (vehicleKey === 'motorroller') return <IconMotorbike size={16} />;
  return <IconCar size={16} />;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function NeueBestellungPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  // ── Step state ──
  const [step, setStep] = useState(1);

  // ── Step 1: Kunde ──
  const [selectedKunde, setSelectedKunde] = useState<Kundenverwaltung | null>(null);
  const [showNewKunde, setShowNewKunde] = useState(false);
  const [newKundeFirstName, setNewKundeFirstName] = useState('');
  const [newKundeLastName, setNewKundeLastName] = useState('');
  const [newKundeEmail, setNewKundeEmail] = useState('');
  const [newKundeTelefon, setNewKundeTelefon] = useState('');
  const [newKundeCity, setNewKundeCity] = useState('');
  const [creatingKunde, setCreatingKunde] = useState(false);

  // ── Step 2: Details ──
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [orderDate, setOrderDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState('none');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // ── Step 3: Fahrer ──
  const [selectedFahrer, setSelectedFahrer] = useState<Fahrerverwaltung | null>(null);
  const [skipFahrer, setSkipFahrer] = useState(false);
  const [showNewFahrer, setShowNewFahrer] = useState(false);
  const [newFahrerFirstName, setNewFahrerFirstName] = useState('');
  const [newFahrerLastName, setNewFahrerLastName] = useState('');
  const [newFahrerTelefon, setNewFahrerTelefon] = useState('');
  const [newFahrerZone, setNewFahrerZone] = useState('');
  const [creatingFahrer, setCreatingFahrer] = useState(false);

  // ── Submission ──
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // ── Filtered lists ──
  const activeKunden = kundenverwaltung.filter(k => k.fields.customer_status?.key === 'aktiv');
  const availableFahrer = fahrerverwaltung.filter(f => f.fields.driver_status?.key === 'verfuegbar');

  // ── Handlers ──

  const handleSelectKunde = (id: string) => {
    const k = kundenverwaltung.find(r => r.record_id === id) ?? null;
    setSelectedKunde(k);
    setStep(2);
  };

  const handleCreateKunde = async () => {
    if (!newKundeFirstName.trim() || !newKundeLastName.trim()) return;
    setCreatingKunde(true);
    try {
      const created = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newKundeFirstName.trim(),
        last_name: newKundeLastName.trim(),
        email: newKundeEmail.trim() || undefined,
        phone: newKundeTelefon.trim() || undefined,
        city: newKundeCity.trim() || undefined,
        customer_status: 'aktiv',
      });
      await fetchAll();
      setShowNewKunde(false);
      setNewKundeFirstName('');
      setNewKundeLastName('');
      setNewKundeEmail('');
      setNewKundeTelefon('');
      setNewKundeCity('');
      // auto-select the new record
      const freshKunde: Kundenverwaltung = {
        record_id: created.record_id,
        created_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        updated_at: null,
        createdat: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        updatedat: null,
        fields: {
          first_name: newKundeFirstName.trim(),
          last_name: newKundeLastName.trim(),
          email: newKundeEmail.trim() || undefined,
          phone: newKundeTelefon.trim() || undefined,
          city: newKundeCity.trim() || undefined,
          customer_status: { key: 'aktiv', label: 'Aktiv' },
        },
      };
      setSelectedKunde(freshKunde);
      setStep(2);
    } finally {
      setCreatingKunde(false);
    }
  };

  const handleSelectFahrer = (id: string) => {
    const f = fahrerverwaltung.find(r => r.record_id === id) ?? null;
    setSelectedFahrer(f);
    setSkipFahrer(false);
  };

  const handleCreateFahrer = async () => {
    if (!newFahrerFirstName.trim() || !newFahrerLastName.trim()) return;
    setCreatingFahrer(true);
    try {
      const created = await LivingAppsService.createFahrerverwaltungEntry({
        driver_first_name: newFahrerFirstName.trim(),
        driver_last_name: newFahrerLastName.trim(),
        driver_phone: newFahrerTelefon.trim() || undefined,
        delivery_zone: newFahrerZone.trim() || undefined,
        driver_status: 'verfuegbar',
      });
      await fetchAll();
      setShowNewFahrer(false);
      setNewFahrerFirstName('');
      setNewFahrerLastName('');
      setNewFahrerTelefon('');
      setNewFahrerZone('');
      const freshFahrer: Fahrerverwaltung = {
        record_id: created.record_id,
        created_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        updated_at: null,
        createdat: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
        updatedat: null,
        fields: {
          driver_first_name: newFahrerFirstName.trim(),
          driver_last_name: newFahrerLastName.trim(),
          driver_phone: newFahrerTelefon.trim() || undefined,
          delivery_zone: newFahrerZone.trim() || undefined,
          driver_status: { key: 'verfuegbar', label: 'Verfügbar' },
        },
      };
      setSelectedFahrer(freshFahrer);
      setSkipFahrer(false);
    } finally {
      setCreatingFahrer(false);
    }
  };

  const handleSave = async () => {
    if (!selectedKunde) return;
    // idempotency guard
    if (createdId) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload: Parameters<typeof LivingAppsService.createBestellverwaltungEntry>[0] = {
        ordered_items: orderedItems.trim() || undefined,
        total_amount: totalAmount ? parseFloat(totalAmount) : undefined,
        order_date: orderDate || undefined,
        desired_delivery_time: desiredDeliveryTime || undefined,
        delivery_street: deliveryStreet.trim() || undefined,
        delivery_house_number: deliveryHouseNumber.trim() || undefined,
        delivery_postal_code: deliveryPostalCode.trim() || undefined,
        delivery_city: deliveryCity.trim() || undefined,
        delivery_notes: deliveryNotes.trim() || undefined,
        order_status: 'neu',
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id),
      };

      if (paymentMethodKey && paymentMethodKey !== 'none') {
        payload.payment_method = paymentMethodKey;
      }

      if (!skipFahrer && selectedFahrer) {
        payload.fahrer = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrer.record_id);
      }

      const result = await LivingAppsService.createBestellverwaltungEntry(payload);
      setCreatedId(result.record_id);
      setStep(4);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKunde(null);
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
    setSelectedFahrer(null);
    setSkipFahrer(false);
    setCreatedId(null);
    setSaveError(null);
  };

  const step2Valid = orderedItems.trim().length > 0 && totalAmount.trim().length > 0 && orderDate.length > 0;

  // ── Render ──

  return (
    <IntentWizardShell
      title={tt('title')}
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
      {/* ── Step 1: Kunde wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={activeKunden.map(k => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.phone, k.fields.city].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectKunde}
          searchPlaceholder={tt('searchKunde')}
          emptyText={tt('emptyKunde')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
          createLabel={tt('newKunde')}
          onCreateNew={() => setShowNewKunde(true)}
          createDialog={showNewKunde && (
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="text-sm font-medium">{tt('newKundeTitle')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">{tt('kundeVorname')} *</Label>
                  <Input
                    value={newKundeFirstName}
                    onChange={e => setNewKundeFirstName(e.target.value)}
                    placeholder={tt('kundeVorname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{tt('kundeNachname')} *</Label>
                  <Input
                    value={newKundeLastName}
                    onChange={e => setNewKundeLastName(e.target.value)}
                    placeholder={tt('kundeNachname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{tt('kundeEmail')}</Label>
                  <Input
                    type="email"
                    value={newKundeEmail}
                    onChange={e => setNewKundeEmail(e.target.value)}
                    placeholder={tt('kundeEmail')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{tt('kundeTelefon')}</Label>
                  <Input
                    value={newKundeTelefon}
                    onChange={e => setNewKundeTelefon(e.target.value)}
                    placeholder={tt('kundeTelefon')}
                  />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs">{tt('kundeStadt')}</Label>
                  <Input
                    value={newKundeCity}
                    onChange={e => setNewKundeCity(e.target.value)}
                    placeholder={tt('kundeStadt')}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  onClick={handleCreateKunde}
                  disabled={!newKundeFirstName.trim() || !newKundeLastName.trim() || creatingKunde}
                >
                  {tt('anlegen')}
                </Button>
                <Button variant="outline" onClick={() => setShowNewKunde(false)}>
                  {tt('zurueck')}
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* ── Step 2: Bestelldetails ── */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-5">
            {/* Kundenbanner */}
            <div className="flex items-center gap-3 rounded-2xl border bg-secondary/50 px-4 py-3">
              <IconUser size={18} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{tt('selectedKunde')}</p>
                <p className="font-medium truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <p className="font-medium text-base flex items-center gap-2">
                <IconShoppingCart size={18} className="text-primary" />
                {tt('detailsTitle')}
              </p>

              {/* Bestellte Artikel (required) */}
              <div className="space-y-1">
                <Label className="text-xs">{tt('orderedItems')} *</Label>
                <Textarea
                  value={orderedItems}
                  onChange={e => setOrderedItems(e.target.value)}
                  placeholder={tt('orderedItems')}
                  rows={3}
                />
              </div>

              {/* Gesamtbetrag (required) */}
              <div className="space-y-1">
                <Label className="text-xs">{tt('totalAmount')} *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalAmount}
                  onChange={e => setTotalAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>

              {/* Bestellzeitpunkt (required) */}
              <div className="space-y-1">
                <Label className="text-xs">{tt('orderDate')} *</Label>
                <Input
                  type="datetime-local"
                  value={orderDate}
                  onChange={e => setOrderDate(e.target.value)}
                />
              </div>

              {/* Gewünschte Lieferzeit */}
              <div className="space-y-1">
                <Label className="text-xs">{tt('desiredDelivery')}</Label>
                <Input
                  type="datetime-local"
                  value={desiredDeliveryTime}
                  onChange={e => setDesiredDeliveryTime(e.target.value)}
                />
              </div>

              {/* Lieferadresse */}
              <div className="space-y-2">
                <p className="text-xs font-medium flex items-center gap-1.5">
                  <IconMapPin size={14} className="text-muted-foreground" />
                  {tt('deliveryAddress')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">{tt('deliveryStreet')}</Label>
                    <Input
                      value={deliveryStreet}
                      onChange={e => setDeliveryStreet(e.target.value)}
                      placeholder={tt('deliveryStreet')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tt('deliveryHouseNumber')}</Label>
                    <Input
                      value={deliveryHouseNumber}
                      onChange={e => setDeliveryHouseNumber(e.target.value)}
                      placeholder="12a"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">{tt('deliveryPostalCode')}</Label>
                    <Input
                      value={deliveryPostalCode}
                      onChange={e => setDeliveryPostalCode(e.target.value)}
                      placeholder="12345"
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs">{tt('deliveryCity')}</Label>
                    <Input
                      value={deliveryCity}
                      onChange={e => setDeliveryCity(e.target.value)}
                      placeholder={tt('deliveryCity')}
                    />
                  </div>
                </div>
              </div>

              {/* Zahlungsart */}
              <div className="space-y-1">
                <Label className="text-xs flex items-center gap-1.5">
                  <IconCreditCard size={14} className="text-muted-foreground" />
                  {tt('paymentMethod')}
                </Label>
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

              {/* Lieferhinweise */}
              <div className="space-y-1">
                <Label className="text-xs">{tt('deliveryNotes')}</Label>
                <Textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={tt('deliveryNotes')}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={() => setStep(3)}
                disabled={!step2Valid}
                className="flex-1"
              >
                {tt('weiterFahrer')}
              </Button>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tt('zurueck')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('missingStep')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStart')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Fahrer zuweisen ── */}
      {step === 3 && (
        selectedKunde ? (
          <div className="space-y-4">
            {/* Kundenbanner */}
            <div className="flex items-center gap-3 rounded-2xl border bg-secondary/50 px-4 py-3">
              <IconUser size={18} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{tt('selectedKunde')}</p>
                <p className="font-medium truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </p>
              </div>
            </div>

            {/* Fahrer-Auswahl */}
            <EntitySelectStep
              items={availableFahrer.map(f => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || f.record_id,
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone ? `${tt('zone')}: ${f.fields.delivery_zone}` : null,
                  f.fields.driver_phone,
                ].filter(Boolean).join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <VehicleIcon vehicleKey={f.fields.vehicle_type?.key} />,
              }))}
              onSelect={handleSelectFahrer}
              searchPlaceholder={tt('searchFahrer')}
              emptyText={tt('emptyFahrer')}
              emptyIcon={<IconTruck size={32} className="text-muted-foreground" />}
              createLabel={tt('newFahrer')}
              onCreateNew={() => setShowNewFahrer(true)}
              createDialog={showNewFahrer && (
                <div className="rounded-2xl border bg-card p-4 space-y-3">
                  <p className="text-sm font-medium">{tt('newFahrerTitle')}</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">{tt('fahrerVorname')} *</Label>
                      <Input
                        value={newFahrerFirstName}
                        onChange={e => setNewFahrerFirstName(e.target.value)}
                        placeholder={tt('fahrerVorname')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{tt('fahrerNachname')} *</Label>
                      <Input
                        value={newFahrerLastName}
                        onChange={e => setNewFahrerLastName(e.target.value)}
                        placeholder={tt('fahrerNachname')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{tt('fahrerTelefon')}</Label>
                      <Input
                        value={newFahrerTelefon}
                        onChange={e => setNewFahrerTelefon(e.target.value)}
                        placeholder={tt('fahrerTelefon')}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">{tt('fahrerZone')}</Label>
                      <Input
                        value={newFahrerZone}
                        onChange={e => setNewFahrerZone(e.target.value)}
                        placeholder={tt('fahrerZone')}
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button
                      onClick={handleCreateFahrer}
                      disabled={!newFahrerFirstName.trim() || !newFahrerLastName.trim() || creatingFahrer}
                    >
                      {tt('anlegen')}
                    </Button>
                    <Button variant="outline" onClick={() => setShowNewFahrer(false)}>
                      {tt('zurueck')}
                    </Button>
                  </div>
                </div>
              )}
            />

            {/* Ausgewählter Fahrer Anzeige */}
            {selectedFahrer && !skipFahrer && (
              <div className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-primary/5 px-4 py-3">
                <IconTruck size={18} className="text-primary shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs text-muted-foreground">{tt('fahrerZugewiesen')}</p>
                  <p className="font-medium truncate">
                    {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name].filter(Boolean).join(' ')}
                  </p>
                  {selectedFahrer.fields.vehicle_type && (
                    <p className="text-xs text-muted-foreground">{selectedFahrer.fields.vehicle_type.label}</p>
                  )}
                </div>
                <StatusBadge statusKey={selectedFahrer.fields.driver_status?.key} label={selectedFahrer.fields.driver_status?.label} />
              </div>
            )}

            {/* Aktions-Buttons */}
            {saveError && (
              <p className="text-sm text-destructive rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2">
                {saveError}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                onClick={handleSave}
                disabled={saving || !!createdId}
                className="flex-1"
              >
                {saving ? tt('saving') : tt('bestellungSpeichern')}
              </Button>
              {!skipFahrer && !selectedFahrer && (
                <Button
                  variant="outline"
                  onClick={() => { setSkipFahrer(true); }}
                  className="flex-1 sm:flex-none"
                >
                  {tt('ohnefahrer')}
                </Button>
              )}
              {(skipFahrer || selectedFahrer) && !saving && (
                <Button
                  variant="outline"
                  onClick={() => { setSkipFahrer(false); setSelectedFahrer(null); }}
                >
                  {tt('zurueck')}
                </Button>
              )}
              <Button variant="outline" onClick={() => setStep(2)}>
                {tt('zurueck')}
              </Button>
            </div>

            {skipFahrer && (
              <div className="flex items-center gap-2 rounded-xl border bg-secondary/50 px-3 py-2">
                <Badge variant="secondary">{tt('ohnefahrerLabel')}</Badge>
                <p className="text-sm text-muted-foreground flex-1">{tt('ohnefahrer')}</p>
                <Button variant="ghost" size="sm" onClick={() => { setSkipFahrer(false); setSelectedFahrer(null); }}>
                  {tt('zurueck')}
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('missingStep')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStart')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: Erfolg ── */}
      {step === 4 && (
        createdId ? (
          <div className="space-y-5">
            {/* Erfolgsbanner */}
            <div className="flex flex-col items-center text-center gap-3 rounded-2xl border bg-primary/5 border-primary/20 px-6 py-8">
              <div className="rounded-full bg-primary/10 p-4">
                <IconCheck size={32} className="text-primary" stroke={2} />
              </div>
              <div>
                <p className="text-lg font-semibold">{tt('successTitle')}</p>
                <p className="text-sm text-muted-foreground mt-1">{tt('successSub')}</p>
              </div>
            </div>

            {/* Bestellübersicht */}
            <Card className="overflow-hidden">
              <div className="px-5 py-4 border-b bg-secondary/30">
                <p className="font-medium">{tt('orderSummary')}</p>
              </div>
              <div className="px-5 py-4 space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{tt('kunde')}</span>
                  <span className="font-medium text-right truncate">
                    {selectedKunde ? [selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ') : '—'}
                  </span>
                </div>
                {totalAmount && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{tt('betrag')}</span>
                    <span className="font-medium">{parseFloat(totalAmount).toFixed(2)} €</span>
                  </div>
                )}
                {orderDate && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{tt('bestellzeitpunkt')}</span>
                    <span className="font-medium">{orderDate.replace('T', ' ')}</span>
                  </div>
                )}
                {desiredDeliveryTime && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{tt('lieferzeit')}</span>
                    <span className="font-medium">{desiredDeliveryTime.replace('T', ' ')}</span>
                  </div>
                )}
                {(deliveryStreet || deliveryCity) && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{tt('adresse')}</span>
                    <span className="font-medium text-right">
                      {[
                        deliveryStreet && deliveryHouseNumber ? `${deliveryStreet} ${deliveryHouseNumber}` : deliveryStreet,
                        deliveryPostalCode && deliveryCity ? `${deliveryPostalCode} ${deliveryCity}` : deliveryCity,
                      ].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
                {paymentMethodKey && paymentMethodKey !== 'none' && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{tt('zahlung')}</span>
                    <span className="font-medium">
                      {PAYMENT_OPTIONS.find(o => o.key === paymentMethodKey)?.label ?? paymentMethodKey}
                    </span>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{tt('fahrer')}</span>
                  <span className="font-medium">
                    {selectedFahrer
                      ? [selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name].filter(Boolean).join(' ')
                      : tt('ohnefahrerLabel')}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">{tt('status')}</span>
                  <StatusBadge statusKey="neu" label="Neu" /* i18n-exempt */ />
                </div>
              </div>
            </Card>

            {/* Aktionen */}
            <div className="flex flex-col sm:flex-row gap-2">
              <Button onClick={handleReset} variant="outline" className="flex-1">
                {tt('neueBest')}
              </Button>
              <a href="#/" className="flex-1">
                <Button className="w-full">{tt('dashboard')}</Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('missingStep2')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('neuStart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
