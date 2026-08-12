/**
 * Neue Bestellung — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen → 2) Bestelldetails erfassen → 3) Fahrer zuweisen & speichern.
 * Reads: kundenverwaltung, fahrerverwaltung. Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconUser, IconPackage, IconTruck, IconCheck, IconCurrencyEuro, IconMapPin } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kundenverwaltung, Fahrerverwaltung } from '@/types/app';
import { tx } from '@/i18n';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function NeueBestellungPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1: Kunde
  const [selectedKunde, setSelectedKunde] = useState<Kundenverwaltung | null>(null);

  // Step 2: Bestelldetails
  const [orderDate, setOrderDate] = useState('');
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState('none');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Step 3: Fahrer + submit
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);
  const [createdTotalAmount, setCreatedTotalAmount] = useState<number | null>(null);

  const aktivKunden = kundenverwaltung.filter(
    k => k.fields.customer_status?.key !== 'gesperrt'
  );

  const verfuegbareFahrer = fahrerverwaltung.filter(
    f => f.fields.driver_status?.key === 'verfuegbar'
  );

  const step2Valid = orderDate.trim() !== '' && orderedItems.trim() !== '' && totalAmount.trim() !== '';

  const handleKundeSelect = (id: string) => {
    const kunde = kundenverwaltung.find(k => k.record_id === id) ?? null;
    if (kunde) {
      setSelectedKunde(kunde);
      // Pre-fill delivery address from customer
      if (kunde.fields.street) setDeliveryStreet(kunde.fields.street);
      if (kunde.fields.house_number) setDeliveryHouseNumber(kunde.fields.house_number);
      if (kunde.fields.postal_code) setDeliveryPostalCode(kunde.fields.postal_code);
      if (kunde.fields.city) setDeliveryCity(kunde.fields.city);
    }
    setStep(2);
  };

  const handleSubmit = async (fahrerId: string | null) => {
    if (createdOrderId) return; // idempotency guard

    setSubmitting(true);
    setSubmitError(null);

    try {
      const amount = parseFloat(totalAmount);
      const payload: Parameters<typeof LivingAppsService.createBestellverwaltungEntry>[0] = {
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde!.record_id),
        order_date: orderDate,
        ordered_items: orderedItems,
        total_amount: amount,
        order_status: 'neu',
      };

      if (fahrerId) {
        payload.fahrer = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, fahrerId);
      }
      if (desiredDeliveryTime) payload.desired_delivery_time = desiredDeliveryTime;
      if (deliveryStreet) payload.delivery_street = deliveryStreet;
      if (deliveryHouseNumber) payload.delivery_house_number = deliveryHouseNumber;
      if (deliveryPostalCode) payload.delivery_postal_code = deliveryPostalCode;
      if (deliveryCity) payload.delivery_city = deliveryCity;
      if (paymentMethodKey && paymentMethodKey !== 'none') payload.payment_method = paymentMethodKey;
      if (deliveryNotes) payload.delivery_notes = deliveryNotes;

      const result = await LivingAppsService.createBestellverwaltungEntry(payload);
      setCreatedOrderId(result.record_id);
      setCreatedTotalAmount(amount);
      await fetchAll();
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tx('Fehler beim Speichern der Bestellung.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKunde(null);
    setOrderDate('');
    setOrderedItems('');
    setTotalAmount('');
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
    setCreatedTotalAmount(null);
  };

  return (
    <IntentWizardShell
      title={tx('Neue Bestellung')}
      subtitle={tx('Bestellung in 3 Schritten anlegen')}
      steps={[
        { label: tx('Kunde') },
        { label: tx('Details') },
        { label: tx('Fahrer') },
        { label: tx('Fertig') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Kunde wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={aktivKunden.map(k => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.phone].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          searchPlaceholder={tx('Kunde suchen …')}
          emptyText={tx('Keine aktiven Kunden gefunden.')}
        />
      )}

      {/* Step 2: Bestelldetails */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-6 max-w-2xl">
            {/* Kunde summary */}
            <div className="rounded-2xl border bg-card p-4 flex items-center gap-3">
              <IconUser size={20} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {[selectedKunde.fields.email, selectedKunde.fields.phone].filter(Boolean).join(' · ')}
                </p>
              </div>
              <Button variant="ghost" size="sm" className="ml-auto shrink-0" onClick={() => setStep(1)}>
                {tx('Ändern')}
              </Button>
            </div>

            {/* Required fields */}
            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <IconPackage size={18} className="text-primary" />
                {tx('Bestelldetails')}
              </h3>

              <div className="space-y-2">
                <Label>{tx('Bestelldatum & Uhrzeit')} *</Label>
                <Input
                  type="datetime-local"
                  value={orderDate}
                  onChange={e => setOrderDate(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>{tx('Bestellte Artikel')} *</Label>
                <Textarea
                  value={orderedItems}
                  onChange={e => setOrderedItems(e.target.value)}
                  placeholder={tx('z. B. 2x Pizza Margherita, 1x Cola 0,5l …')}
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>{tx('Gesamtbetrag (€)')} *</Label>
                <div className="relative">
                  <IconCurrencyEuro size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={totalAmount}
                    onChange={e => setTotalAmount(e.target.value)}
                    className="pl-8"
                    placeholder="0,00"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{tx('Gewünschte Lieferzeit')}</Label>
                <Input
                  type="datetime-local"
                  value={desiredDeliveryTime}
                  onChange={e => setDesiredDeliveryTime(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>{tx('Zahlungsmethode')}</Label>
                <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tx('Bitte wählen …')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tx('Keine Angabe')}</SelectItem>
                    {PAYMENT_OPTIONS.map(opt => (
                      <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Delivery address */}
            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <h3 className="font-semibold flex items-center gap-2">
                <IconMapPin size={18} className="text-primary" />
                {tx('Lieferadresse')}
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-2">
                  <Label>{tx('Straße')}</Label>
                  <Input
                    value={deliveryStreet}
                    onChange={e => setDeliveryStreet(e.target.value)}
                    placeholder={tx('Straßenname')}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{tx('Hausnummer')}</Label>
                  <Input
                    value={deliveryHouseNumber}
                    onChange={e => setDeliveryHouseNumber(e.target.value)}
                    placeholder="12a"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-2">
                  <Label>{tx('PLZ')}</Label>
                  <Input
                    value={deliveryPostalCode}
                    onChange={e => setDeliveryPostalCode(e.target.value)}
                    placeholder="12345"
                  />
                </div>
                <div className="sm:col-span-2 space-y-2">
                  <Label>{tx('Ort')}</Label>
                  <Input
                    value={deliveryCity}
                    onChange={e => setDeliveryCity(e.target.value)}
                    placeholder={tx('Stadt')}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{tx('Lieferhinweise')}</Label>
                <Textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={tx('z. B. 3. OG, klingeln bei …')}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button
                disabled={!step2Valid}
                onClick={() => setStep(3)}
                size="lg"
              >
                {tx('Weiter zu Fahrerzuweisung')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Kundenauswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 3: Fahrer zuweisen */}
      {step === 3 && (
        selectedKunde ? (
          <div className="space-y-6">
            {/* Order summary bar */}
            <div className="rounded-2xl border bg-card p-4 flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2 min-w-0">
                <IconUser size={16} className="text-muted-foreground shrink-0" />
                <span className="text-sm truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </span>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <IconCurrencyEuro size={16} className="text-muted-foreground shrink-0" />
                <span className="text-sm font-semibold">
                  {parseFloat(totalAmount || '0').toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </div>
              {orderDate && (
                <div className="flex items-center gap-2 min-w-0">
                  <IconPackage size={16} className="text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground truncate">{orderDate.replace('T', ' ')}</span>
                </div>
              )}
            </div>

            <EntitySelectStep
              items={verfuegbareFahrer.map((f: Fahrerverwaltung) => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || f.record_id,
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone ? tx('Zone') + ': ' + f.fields.delivery_zone : undefined,
                ].filter(Boolean).join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconTruck size={20} className="text-primary" />,
              }))}
              onSelect={(id) => {
                setSelectedFahrerId(id);
                void handleSubmit(id);
              }}
              searchPlaceholder={tx('Fahrer suchen …')}
              emptyText={tx('Keine verfügbaren Fahrer.')}
            />

            {submitError && (
              <p className="text-sm text-destructive rounded-xl border border-destructive/30 bg-destructive/10 p-3">
                {submitError}
              </p>
            )}

            <div className="flex flex-wrap gap-3 justify-between">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                {tx('Zurück')}
              </Button>
              <Button
                variant="secondary"
                disabled={submitting}
                onClick={() => {
                  setSelectedFahrerId(null);
                  void handleSubmit(null);
                }}
              >
                {submitting ? tx('Speichern …') : tx('Ohne Fahrer speichern')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Step 4: Erfolg */}
      {step === 4 && (
        createdOrderId ? (
          <div className="space-y-6 max-w-lg mx-auto text-center">
            <div className="rounded-full bg-primary/10 w-16 h-16 flex items-center justify-center mx-auto">
              <IconCheck size={32} className="text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-semibold">{tx('Bestellung gespeichert!')}</h2>
              <p className="text-muted-foreground mt-1">{tx('Die Bestellung wurde erfolgreich angelegt.')}</p>
            </div>

            <div className="rounded-2xl border bg-card p-5 text-left space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{tx('Kunde')}</span>
                <span className="font-medium">
                  {selectedKunde
                    ? [selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')
                    : '—'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{tx('Gesamtbetrag')}</span>
                <span className="font-semibold text-lg">
                  {(createdTotalAmount ?? 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{tx('Status')}</span>
                <StatusBadge statusKey="neu" label={tx('Neu')} />
              </div>
              {selectedFahrerId && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{tx('Fahrer')}</span>
                  <span className="font-medium">
                    {(() => {
                      const f = fahrerverwaltung.find(d => d.record_id === selectedFahrerId);
                      return f
                        ? [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ')
                        : '—';
                    })()}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset} variant="outline">
                {tx('Neue Bestellung anlegen')}
              </Button>
              <Button asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht eine gespeicherte Bestellung.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
