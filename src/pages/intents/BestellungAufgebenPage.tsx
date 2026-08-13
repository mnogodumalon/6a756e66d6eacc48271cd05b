/**
 * Bestellung aufgeben — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen (nur status='aktiv') → 2) Bestelldetails eingeben → 3) Bestätigen & anlegen.
 * Reads: kundenverwaltung. Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconShoppingCart, IconUser, IconCheck, IconPackage } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kundenverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { tx } from '@/i18n';

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function BestellungAufgebenPage() {
  const { kundenverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedKunde, setSelectedKunde] = useState<Kundenverwaltung | null>(null);

  // Schritt 2: Bestelldetails
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [orderDate, setOrderDate] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState(PAYMENT_OPTIONS[0]?.key ?? '');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Schritt 3: Ergebnis
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Schritt 1: Kundenliste (nur aktive)
  const activeKunden = kundenverwaltung.filter(
    (k) => k.fields.customer_status?.key === 'aktiv'
  );

  const handleKundeSelect = (id: string) => {
    const kunde = kundenverwaltung.find((k) => k.record_id === id) ?? null;
    setSelectedKunde(kunde);
    // Lieferadresse vorausfüllen
    if (kunde) {
      setDeliveryStreet(kunde.fields.street ?? '');
      setDeliveryHouseNumber(kunde.fields.house_number ?? '');
      setDeliveryPostalCode(kunde.fields.postal_code ?? '');
      setDeliveryCity(kunde.fields.city ?? '');
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedKunde) return;
    if (createdOrderId) return; // idempotency guard

    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await LivingAppsService.createBestellverwaltungEntry({
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id),
        order_status: 'neu',
        ordered_items: orderedItems,
        total_amount: totalAmount !== '' ? parseFloat(totalAmount) : undefined,
        order_date: orderDate || undefined,
        desired_delivery_time: desiredDeliveryTime || undefined,
        payment_method: paymentMethodKey || undefined,
        delivery_street: deliveryStreet || undefined,
        delivery_house_number: deliveryHouseNumber || undefined,
        delivery_postal_code: deliveryPostalCode || undefined,
        delivery_city: deliveryCity || undefined,
        delivery_notes: deliveryNotes || undefined,
      });
      setCreatedOrderId(result.record_id);
      await fetchAll();
      setStep(3);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Fehler beim Anlegen der Bestellung.'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKunde(null);
    setOrderedItems('');
    setTotalAmount('');
    setOrderDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setDesiredDeliveryTime('');
    setPaymentMethodKey(PAYMENT_OPTIONS[0]?.key ?? '');
    setDeliveryStreet('');
    setDeliveryHouseNumber('');
    setDeliveryPostalCode('');
    setDeliveryCity('');
    setDeliveryNotes('');
    setSubmitError(null);
    setCreatedOrderId(null);
  };

  const step2Valid = orderedItems.trim().length > 0 && totalAmount !== '';

  return (
    <IntentWizardShell
      title={tx('Bestellung aufgeben')}
      subtitle={tx('In 3 Schritten zur neuen Bestellung')}
      steps={[
        { label: tx('Kunde') },
        { label: tx('Details') },
        { label: tx('Fertig') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Schritt 1: Kunde wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={activeKunden.map((k) => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.city].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          searchPlaceholder={tx('Nach Name, E-Mail oder Stadt suchen …')}
          emptyText={tx('Keine aktiven Kunden gefunden.')}
          emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
        />
      )}

      {/* Schritt 2: Bestelldetails */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-6 max-w-2xl mx-auto">
            {/* Kundenzusammenfassung */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex items-center gap-3">
              <IconUser size={20} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </p>
                {selectedKunde.fields.email && (
                  <p className="text-sm text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                )}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto shrink-0"
                onClick={() => setStep(1)}
              >
                {tx('Ändern')}
              </Button>
            </div>

            {/* Bestellpositionen */}
            <div className="space-y-2">
              <Label htmlFor="ordered_items">
                {tx('Bestellte Artikel')} <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="ordered_items"
                value={orderedItems}
                onChange={(e) => setOrderedItems(e.target.value)}
                placeholder={tx('z. B. 2x Pizza Margherita, 1x Cola 0,5 l …')}
                rows={3}
                className="w-full"
              />
            </div>

            {/* Gesamtbetrag */}
            <div className="space-y-2">
              <Label htmlFor="total_amount">
                {tx('Gesamtbetrag (€)')} <span className="text-destructive">*</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="total_amount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0,00"
                  className="w-full"
                />
                {totalAmount !== '' && parseFloat(totalAmount) > 0 && (
                  <div className="shrink-0 rounded-xl bg-primary/10 px-3 py-2 text-sm font-semibold text-primary">
                    {parseFloat(totalAmount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </div>
                )}
              </div>
            </div>

            {/* Bestelldatum */}
            <div className="space-y-2">
              <Label htmlFor="order_date">{tx('Bestelldatum & -uhrzeit')}</Label>
              <Input
                id="order_date"
                type="datetime-local"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Gewünschte Lieferzeit */}
            <div className="space-y-2">
              <Label htmlFor="desired_delivery_time">{tx('Gewünschte Lieferzeit')}</Label>
              <Input
                id="desired_delivery_time"
                type="datetime-local"
                value={desiredDeliveryTime}
                onChange={(e) => setDesiredDeliveryTime(e.target.value)}
                className="w-full"
              />
            </div>

            {/* Zahlungsmethode */}
            <div className="space-y-2">
              <Label>{tx('Zahlungsmethode')}</Label>
              <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={tx('Zahlungsmethode wählen …')} />
                </SelectTrigger>
                <SelectContent>
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
              <p className="font-medium text-sm">{tx('Lieferadresse')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor="delivery_street">{tx('Straße')}</Label>
                  <Input
                    id="delivery_street"
                    value={deliveryStreet}
                    onChange={(e) => setDeliveryStreet(e.target.value)}
                    placeholder={tx('Straße')}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="delivery_house_number">{tx('Hausnr.')}</Label>
                  <Input
                    id="delivery_house_number"
                    value={deliveryHouseNumber}
                    onChange={(e) => setDeliveryHouseNumber(e.target.value)}
                    placeholder="1a"
                    className="w-full"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="delivery_postal_code">{tx('PLZ')}</Label>
                  <Input
                    id="delivery_postal_code"
                    value={deliveryPostalCode}
                    onChange={(e) => setDeliveryPostalCode(e.target.value)}
                    placeholder="12345"
                    className="w-full"
                  />
                </div>
                <div className="sm:col-span-2 space-y-1">
                  <Label htmlFor="delivery_city">{tx('Stadt')}</Label>
                  <Input
                    id="delivery_city"
                    value={deliveryCity}
                    onChange={(e) => setDeliveryCity(e.target.value)}
                    placeholder={tx('Stadt')}
                    className="w-full"
                  />
                </div>
              </div>
            </div>

            {/* Lieferhinweise */}
            <div className="space-y-2">
              <Label htmlFor="delivery_notes">{tx('Lieferhinweise')}</Label>
              <Textarea
                id="delivery_notes"
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder={tx('z. B. Klingeln bei Müller, 2. OG links …')}
                rows={2}
                className="w-full"
              />
            </div>

            {/* Aktionen */}
            {submitError && (
              <p className="text-sm text-destructive rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2">
                {submitError}
              </p>
            )}
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                className="w-full sm:w-auto"
                disabled={!step2Valid || submitting}
                onClick={handleSubmit}
              >
                <IconShoppingCart size={16} className="mr-2" />
                {submitting ? tx('Wird gespeichert …') : tx('Bestellung anlegen')}
              </Button>
              <Button
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => setStep(1)}
                disabled={submitting}
              >
                {tx('Zurück')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* Schritt 3: Bestätigung */}
      {step === 3 && (
        createdOrderId ? (
          <div className="flex flex-col items-center text-center py-12 space-y-6 max-w-md mx-auto">
            <div className="rounded-full bg-primary/10 p-5">
              <IconCheck size={40} className="text-primary" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{tx('Bestellung angelegt!')}</h2>
              <p className="text-sm text-muted-foreground">
                {tx('Bestellreferenz')}: <span className="font-mono font-medium text-foreground">{createdOrderId}</span>
              </p>
              {selectedKunde && (
                <p className="text-sm text-muted-foreground">
                  {tx('Für')}: {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </p>
              )}
              {totalAmount !== '' && parseFloat(totalAmount) > 0 && (
                <p className="text-sm font-medium text-primary">
                  {parseFloat(totalAmount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                </p>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full">
              <Button className="w-full" onClick={handleReset}>
                <IconPackage size={16} className="mr-2" />
                {tx('Neue Bestellung anlegen')}
              </Button>
              <Button variant="outline" className="w-full" asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
