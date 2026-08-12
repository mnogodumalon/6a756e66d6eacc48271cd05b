/**
 * Bestellung aufgeben — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen (nur aktive Kunden) → 2) Bestelldetails eingeben (Artikel, Betrag, Lieferadresse, Zahlungsart) → 3) Fahrer zuweisen (optional, nur verfügbare Fahrer) & Bestellung anlegen.
 * Reads: kundenverwaltung (filter: customer_status=aktiv), fahrerverwaltung (filter: driver_status=verfuegbar).
 * Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import {
  IconUser,
  IconTruck,
  IconCurrencyEuro,
  IconMapPin,
  IconCheck,
  IconPlus,
} from '@tabler/icons-react';
import { tx } from '@/i18n';
import { APP_IDS, LOOKUP_OPTIONS, type Kundenverwaltung, type Fahrerverwaltung } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function BestellungAufgebenPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedKunde, setSelectedKunde] = useState<Kundenverwaltung | null>(null);
  const [selectedFahrer, setSelectedFahrer] = useState<Fahrerverwaltung | null>(null);

  // Schritt 2: Bestelldetails
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmountStr, setTotalAmountStr] = useState('');
  const [orderDate, setOrderDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState(PAYMENT_OPTIONS[0]?.key ?? 'bar');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Schritt 1: Neuen Kunden anlegen
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newKundeFirstName, setNewKundeFirstName] = useState('');
  const [newKundeLastName, setNewKundeLastName] = useState('');
  const [newKundeEmail, setNewKundeEmail] = useState('');
  const [newKundePhone, setNewKundePhone] = useState('');
  const [creatingKunde, setCreatingKunde] = useState(false);

  // Schritt 3: Absenden
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdBestellungId, setCreatedBestellungId] = useState<string | null>(null);

  // Gefilterte Listen
  const aktiveKunden = kundenverwaltung.filter(
    k => k.fields.customer_status?.key === 'aktiv'
  );
  const verfuegbareFahrer = fahrerverwaltung.filter(
    f => f.fields.driver_status?.key === 'verfuegbar'
  );

  const totalAmount = parseFloat(totalAmountStr.replace(',', '.')) || 0;

  const handleKundeSelect = (id: string) => {
    const kunde = kundenverwaltung.find(k => k.record_id === id) ?? null;
    setSelectedKunde(kunde);
    setStep(2);
  };

  const handleCreateKunde = async () => {
    if (!newKundeFirstName || !newKundeLastName) return;
    setCreatingKunde(true);
    try {
      const created = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newKundeFirstName,
        last_name: newKundeLastName,
        email: newKundeEmail || undefined,
        phone: newKundePhone || undefined,
        customer_status: 'aktiv',
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNewKundeFirstName('');
      setNewKundeLastName('');
      setNewKundeEmail('');
      setNewKundePhone('');
      setSelectedKunde({ record_id: created.record_id, created_at: format(new Date(), "yyyy-MM-dd'T'HH:mm"), updated_at: null, createdat: format(new Date(), "yyyy-MM-dd'T'HH:mm"), updatedat: null, fields: { first_name: newKundeFirstName, last_name: newKundeLastName, customer_status: { key: 'aktiv', label: tx('Aktiv') } } });
      setStep(2);
    } finally {
      setCreatingKunde(false);
    }
  };

  const handleStep2Next = () => {
    if (!orderedItems || !totalAmountStr || !orderDate) return;
    setStep(3);
  };

  const handleFahrerSelect = (id: string) => {
    const fahrer = fahrerverwaltung.find(f => f.record_id === id) ?? null;
    setSelectedFahrer(fahrer);
  };

  const handleSubmit = async () => {
    if (!selectedKunde) return;

    let bid = createdBestellungId;
    if (!bid) {
      setSubmitting(true);
      setSubmitError(null);
      try {
        const result = await LivingAppsService.createBestellverwaltungEntry({
          kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id),
          fahrer: selectedFahrer
            ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrer.record_id)
            : undefined,
          order_status: 'neu',
          ordered_items: orderedItems,
          total_amount: totalAmount,
          order_date: orderDate,
          desired_delivery_time: desiredDeliveryTime || undefined,
          delivery_street: deliveryStreet || undefined,
          delivery_house_number: deliveryHouseNumber || undefined,
          delivery_postal_code: deliveryPostalCode || undefined,
          delivery_city: deliveryCity || undefined,
          payment_method: paymentMethodKey,
          delivery_notes: deliveryNotes || undefined,
        });
        bid = result.record_id;
        setCreatedBestellungId(bid);
        await fetchAll();
        setStep(4);
      } catch (err) {
        setSubmitError(err instanceof Error ? err.message : tx('Fehler beim Anlegen der Bestellung'));
      } finally {
        setSubmitting(false);
      }
    }
  };

  const handleReset = () => {
    setSelectedKunde(null);
    setSelectedFahrer(null);
    setOrderedItems('');
    setTotalAmountStr('');
    setOrderDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setDesiredDeliveryTime('');
    setDeliveryStreet('');
    setDeliveryHouseNumber('');
    setDeliveryPostalCode('');
    setDeliveryCity('');
    setPaymentMethodKey(PAYMENT_OPTIONS[0]?.key ?? 'bar');
    setDeliveryNotes('');
    setCreatedBestellungId(null);
    setSubmitError(null);
    setStep(1);
  };

  const step2Valid = !!orderedItems && !!totalAmountStr && !!orderDate;

  return (
    <IntentWizardShell
      title={tx('Bestellung aufgeben')}
      subtitle={tx('Kunde wählen, Bestelldetails eingeben und Fahrer zuweisen')}
      steps={[
        { label: tx('Kunde') },
        { label: tx('Details') },
        { label: tx('Fahrer') },
        { label: tx('Fertig') },
      ]}
      currentStep={step}
      onStepChange={(s) => {
        if (s === 1) setStep(1);
        if (s === 2 && selectedKunde) setStep(2);
        if (s === 3 && selectedKunde && step2Valid) setStep(3);
      }}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Schritt 1: Kunde wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={aktiveKunden.map(k => ({
            id: k.record_id,
            title: `${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || k.record_id,
            subtitle: [k.fields.email, k.fields.phone, k.fields.city].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          createLabel={tx('Neuen Kunden anlegen')}
          onCreateNew={() => setShowCreateKunde(true)}
          searchPlaceholder={tx('Kunden suchen …')}
          emptyText={tx('Keine aktiven Kunden gefunden')}
          createDialog={showCreateKunde && (
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">{tx('Neuen Kunden anlegen')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('Vorname')} *</Label>
                  <Input
                    value={newKundeFirstName}
                    onChange={e => setNewKundeFirstName(e.target.value)}
                    placeholder={tx('Vorname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('Nachname')} *</Label>
                  <Input
                    value={newKundeLastName}
                    onChange={e => setNewKundeLastName(e.target.value)}
                    placeholder={tx('Nachname')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('E-Mail')}</Label>
                  <Input
                    type="email"
                    value={newKundeEmail}
                    onChange={e => setNewKundeEmail(e.target.value)}
                    placeholder={tx('E-Mail')}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('Telefon')}</Label>
                  <Input
                    type="tel"
                    value={newKundePhone}
                    onChange={e => setNewKundePhone(e.target.value)}
                    placeholder={tx('Telefon')}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  disabled={!newKundeFirstName || !newKundeLastName || creatingKunde}
                  onClick={handleCreateKunde}
                  className="flex-1"
                >
                  <IconPlus size={16} className="mr-1" />
                  {creatingKunde ? tx('Wird angelegt …') : tx('Kunde anlegen & wählen')}
                </Button>
                <Button variant="outline" onClick={() => setShowCreateKunde(false)}>
                  {tx('Abbrechen')}
                </Button>
              </div>
            </div>
          )}
        />
      )}

      {/* Schritt 2: Bestelldetails */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-6">
            {/* Gewählter Kunde */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex items-center gap-3">
              <IconUser size={20} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {selectedKunde.fields.first_name} {selectedKunde.fields.last_name}
                </p>
                {selectedKunde.fields.email && (
                  <p className="text-xs text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                )}
              </div>
              <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={() => setStep(1)}>
                {tx('Ändern')}
              </Button>
            </div>

            {/* Bestelldetails-Formular */}
            <div className="space-y-4">
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{tx('Bestellte Artikel')} *</Label>
                <Textarea
                  value={orderedItems}
                  onChange={e => setOrderedItems(e.target.value)}
                  placeholder={tx('z. B. 2x Pizza Margherita, 1x Cola …')}
                  className="min-h-[80px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('Gesamtbetrag (€)')} *</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalAmountStr}
                    onChange={e => setTotalAmountStr(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('Zahlungsart')}</Label>
                  <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAYMENT_OPTIONS.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('Bestelldatum & Uhrzeit')} *</Label>
                  <Input
                    type="datetime-local"
                    value={orderDate}
                    onChange={e => setOrderDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">{tx('Gewünschte Lieferzeit')}</Label>
                  <Input
                    type="datetime-local"
                    value={desiredDeliveryTime}
                    onChange={e => setDesiredDeliveryTime(e.target.value)}
                  />
                </div>
              </div>

              {/* Lieferadresse */}
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                  <IconMapPin size={14} />
                  {tx('Lieferadresse')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs text-muted-foreground">{tx('Straße')}</Label>
                    <div className="flex gap-2">
                      <Input
                        value={deliveryStreet}
                        onChange={e => setDeliveryStreet(e.target.value)}
                        placeholder={tx('Straße')}
                        className="flex-1 min-w-0"
                      />
                      <Input
                        value={deliveryHouseNumber}
                        onChange={e => setDeliveryHouseNumber(e.target.value)}
                        placeholder={tx('Nr.')}
                        className="w-20"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{tx('PLZ')}</Label>
                    <Input
                      value={deliveryPostalCode}
                      onChange={e => setDeliveryPostalCode(e.target.value)}
                      placeholder={tx('PLZ')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">{tx('Stadt')}</Label>
                    <Input
                      value={deliveryCity}
                      onChange={e => setDeliveryCity(e.target.value)}
                      placeholder={tx('Stadt')}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">{tx('Lieferhinweise')}</Label>
                <Textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={tx('z. B. Klingel defekt, 2. OG links …')}
                  className="min-h-[60px]"
                />
              </div>
            </div>

            {/* Live-Betrag */}
            {totalAmount > 0 && (
              <div className="rounded-2xl border bg-primary/5 p-4 flex items-center gap-3">
                <IconCurrencyEuro size={20} className="text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{tx('Gesamtbetrag')}</p>
                  <p className="text-2xl font-bold text-foreground">
                    {totalAmount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
              </div>
            )}

            <Button
              onClick={handleStep2Next}
              disabled={!step2Valid}
              className="w-full"
            >
              {tx('Weiter: Fahrer zuweisen')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst einen Kunden wählen.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Schritt 3: Fahrer zuweisen */}
      {step === 3 && (
        selectedKunde && step2Valid ? (
          <div className="space-y-6">
            {/* Zusammenfassung */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2">
              <div className="flex items-center gap-2">
                <IconUser size={16} className="text-primary shrink-0" />
                <span className="text-sm font-medium truncate">
                  {selectedKunde.fields.first_name} {selectedKunde.fields.last_name}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <IconCurrencyEuro size={16} className="text-primary shrink-0" />
                <span className="text-sm text-muted-foreground">
                  {totalAmount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </span>
              </div>
            </div>

            {/* Fahrer-Auswahl (optional) */}
            <div>
              <p className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                <IconTruck size={18} className="text-primary" />
                {tx('Fahrer zuweisen')}
                <span className="text-xs text-muted-foreground font-normal">({tx('optional')})</span>
              </p>

              {selectedFahrer && (
                <div className="rounded-2xl border bg-primary/5 p-3 flex items-center gap-3 mb-3">
                  <IconCheck size={16} className="text-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {selectedFahrer.fields.driver_first_name} {selectedFahrer.fields.driver_last_name}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">
                      {selectedFahrer.fields.vehicle_type?.label}
                      {selectedFahrer.fields.delivery_zone ? ` · ${selectedFahrer.fields.delivery_zone}` : ''}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedFahrer(null)}>
                    {tx('Ändern')}
                  </Button>
                </div>
              )}

              {!selectedFahrer && (
                <EntitySelectStep
                  items={verfuegbareFahrer.map(f => ({
                    id: f.record_id,
                    title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim(),
                    subtitle: [
                      f.fields.vehicle_type?.label,
                      f.fields.delivery_zone,
                    ].filter(Boolean).join(' · '),
                    status: f.fields.driver_status
                      ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                      : undefined,
                    icon: <IconTruck size={20} className="text-primary" />,
                  }))}
                  onSelect={(id) => {
                    const fahrer = fahrerverwaltung.find(f => f.record_id === id) ?? null;
                    setSelectedFahrer(fahrer);
                  }}
                  searchPlaceholder={tx('Fahrer suchen …')}
                  emptyText={tx('Keine verfügbaren Fahrer gefunden')}
                />
              )}
            </div>

            {submitError && (
              <div className="rounded-2xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full"
              >
                {submitting
                  ? tx('Bestellung wird angelegt …')
                  : selectedFahrer
                    ? tx('Bestellung mit Fahrer aufgeben')
                    : tx('Bestellung ohne Fahrer aufgeben')}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)} className="w-full">
                {tx('Zurück zu Schritt 2')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst Schritt 1 und 2 abschließen.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Schritt 4: Bestätigung */}
      {step === 4 && (
        createdBestellungId ? (
          <div className="space-y-6">
            <div className="text-center space-y-2 py-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-primary/10 mb-2">
                <IconCheck size={28} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold text-foreground">{tx('Bestellung aufgegeben!')}</h2>
              <p className="text-sm text-muted-foreground">{tx('Die Bestellung wurde erfolgreich angelegt.')}</p>
            </div>

            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <IconUser size={16} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tx('Kunde')}</p>
                  <p className="text-sm font-medium truncate">
                    {selectedKunde?.fields.first_name} {selectedKunde?.fields.last_name}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <IconCurrencyEuro size={16} className="text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{tx('Gesamtbetrag')}</p>
                  <p className="text-sm font-medium">
                    {totalAmount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
              </div>
              {selectedFahrer && (
                <div className="flex items-center gap-3">
                  <IconTruck size={16} className="text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tx('Fahrer')}</p>
                    <p className="text-sm font-medium truncate">
                      {selectedFahrer.fields.driver_first_name} {selectedFahrer.fields.driver_last_name}
                    </p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="w-4 shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{tx('Status')}</p>
                  <StatusBadge statusKey="neu" label={tx('Neu')} />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button onClick={handleReset} className="w-full">
                {tx('Neue Bestellung aufgeben')}
              </Button>
              <a href="#/" className="w-full">
                <Button variant="outline" className="w-full">
                  {tx('Zurück zum Dashboard')}
                </Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 3.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
