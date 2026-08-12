/**
 * Bestellung aufnehmen — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen (nur aktive Kunden) → 2) Bestelldetails eingeben →
 *         3) Fahrer zuweisen (optional) & Bestellung anlegen.
 * Reads: kundenverwaltung (aktiv), fahrerverwaltung (verfuegbar).
 * Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import {
  IconUser,
  IconTruck,
  IconCheck,
  IconMapPin,
  IconCurrencyEuro,
} from '@tabler/icons-react';
import { tx } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kundenverwaltung, Fahrerverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function BestellungAufnehmenPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  // Wizard state
  const [step, setStep] = useState(1);

  // Schritt 1: Kunde
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);

  // Schritt 2: Bestelldetails
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

  // Schritt 3: Fahrer & Ergebnis
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdOrderId, setCreatedOrderId] = useState<string | null>(null);

  // Gefilterte Listen
  const aktiveKunden = (kundenverwaltung as Kundenverwaltung[]).filter(
    (k) => k.fields.customer_status?.key === 'aktiv'
  );
  const verfuegbareFahrer = (fahrerverwaltung as Fahrerverwaltung[]).filter(
    (f) => f.fields.driver_status?.key === 'verfuegbar'
  );

  const selectedKunde = aktiveKunden.find((k) => k.record_id === selectedKundeId) ?? null;

  const handleSubmit = async (fahrerId: string | null) => {
    if (createdOrderId) return; // Idempotenz: zweiter Klick erzeugt keine doppelte Bestellung

    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: Parameters<typeof LivingAppsService.createBestellverwaltungEntry>[0] = {
        ordered_items: orderedItems,
        total_amount: parseFloat(totalAmount),
        order_date: orderDate,
        order_status: 'neu',
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId!),
      };
      if (desiredDeliveryTime) payload.desired_delivery_time = desiredDeliveryTime;
      if (deliveryStreet) payload.delivery_street = deliveryStreet;
      if (deliveryHouseNumber) payload.delivery_house_number = deliveryHouseNumber;
      if (deliveryPostalCode) payload.delivery_postal_code = deliveryPostalCode;
      if (deliveryCity) payload.delivery_city = deliveryCity;
      if (paymentMethodKey && paymentMethodKey !== 'none') payload.payment_method = paymentMethodKey;
      if (deliveryNotes) payload.delivery_notes = deliveryNotes;
      if (fahrerId) payload.fahrer = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, fahrerId);

      const result = await LivingAppsService.createBestellverwaltungEntry(payload);
      setCreatedOrderId(result.record_id);
      await fetchAll();
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tx('Fehler beim Anlegen der Bestellung'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
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
  };

  const canProceedStep2 = orderedItems.trim() !== '' && totalAmount !== '' && !isNaN(parseFloat(totalAmount));

  return (
    <IntentWizardShell
      title={tx('Bestellung aufnehmen')}
      subtitle={tx('Neue Lieferbestellung in drei Schritten erfassen')}
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
      {/* Schritt 1: Kunde wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={aktiveKunden.map((k) => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || tx('Unbekannter Kunde'),
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
          searchPlaceholder={tx('Kunde suchen …')}
          emptyText={tx('Keine aktiven Kunden gefunden')}
        />
      )}

      {/* Schritt 2: Bestelldetails */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-6">
            {/* Kundeninfo */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex items-center gap-3">
              <IconUser size={20} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {[selectedKunde?.fields.first_name, selectedKunde?.fields.last_name].filter(Boolean).join(' ')}
                </p>
                {selectedKunde?.fields.email && (
                  <p className="text-sm text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                )}
              </div>
            </div>

            {/* Pflichtfelder */}
            <div className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="ordered_items">{tx('Bestellte Artikel')} *</Label>
                <Textarea
                  id="ordered_items"
                  value={orderedItems}
                  onChange={(e) => setOrderedItems(e.target.value)}
                  placeholder={tx('Was wurde bestellt?')}
                  rows={3}
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="total_amount">{tx('Gesamtbetrag (€)')} *</Label>
                  <div className="relative">
                    <IconCurrencyEuro size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="total_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={totalAmount}
                      onChange={(e) => setTotalAmount(e.target.value)}
                      className="pl-8 w-full"
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label htmlFor="order_date">{tx('Bestelldatum & -uhrzeit')} *</Label>
                  <Input
                    id="order_date"
                    type="datetime-local"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    className="w-full"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="desired_delivery_time">{tx('Gewünschte Lieferzeit')}</Label>
                <Input
                  id="desired_delivery_time"
                  type="datetime-local"
                  value={desiredDeliveryTime}
                  onChange={(e) => setDesiredDeliveryTime(e.target.value)}
                  className="w-full"
                />
              </div>
            </div>

            {/* Lieferadresse */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                <IconMapPin size={16} />
                <span>{tx('Lieferadresse')} ({tx('optional')})</span>
              </div>
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

            {/* Zahlung & Notizen */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>{tx('Zahlungsart')} ({tx('optional')})</Label>
                <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tx('Zahlungsart wählen')} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tx('Keine Angabe')}</SelectItem>
                    {PAYMENT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.key} value={opt.key}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="delivery_notes">{tx('Lieferhinweise')} ({tx('optional')})</Label>
              <Textarea
                id="delivery_notes"
                value={deliveryNotes}
                onChange={(e) => setDeliveryNotes(e.target.value)}
                placeholder={tx('Besondere Hinweise zur Lieferung …')}
                rows={2}
                className="w-full"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)} className="w-full sm:w-auto">
                {tx('Zurück')}
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!canProceedStep2}
                className="w-full sm:w-auto"
              >
                {tx('Weiter: Fahrer zuweisen')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst einen Kunden wählen.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Zu Schritt 1')}</Button>
          </div>
        )
      )}

      {/* Schritt 3: Fahrer zuweisen & Bestellung anlegen */}
      {step === 3 && (
        selectedKundeId && orderedItems && totalAmount ? (
          <div className="space-y-6">
            {/* Bestellzusammenfassung */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2">
              <p className="text-sm font-semibold text-muted-foreground">{tx('Zusammenfassung')}</p>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tx('Kunde')}</span>
                  <span className="font-medium truncate max-w-[60%] text-right">
                    {[selectedKunde?.fields.first_name, selectedKunde?.fields.last_name].filter(Boolean).join(' ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tx('Artikel')}</span>
                  <span className="font-medium truncate max-w-[60%] text-right">{orderedItems}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{tx('Betrag')}</span>
                  <span className="font-medium">
                    {parseFloat(totalAmount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </span>
                </div>
              </div>
            </div>

            {/* Fahrerauswahl */}
            <div>
              <p className="text-sm font-medium mb-3">
                {tx('Fahrer wählen')} <span className="text-muted-foreground font-normal">({tx('optional')})</span>
              </p>
              {verfuegbareFahrer.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  {tx('Keine verfügbaren Fahrer gefunden')}
                </p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {verfuegbareFahrer.map((f) => {
                    const isSelected = selectedFahrerId === f.record_id;
                    return (
                      <button
                        key={f.record_id}
                        type="button"
                        onClick={() => setSelectedFahrerId(isSelected ? null : f.record_id)}
                        className={`rounded-2xl border p-4 text-left transition-colors w-full ${
                          isSelected
                            ? 'border-primary bg-primary/10'
                            : 'border-border bg-card hover:bg-secondary/60'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <IconTruck size={20} className={isSelected ? 'text-primary' : 'text-muted-foreground'} />
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">
                              {[f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || tx('Fahrer')}
                            </p>
                            {f.fields.vehicle_type && (
                              <p className="text-xs text-muted-foreground">{f.fields.vehicle_type.label}</p>
                            )}
                            {f.fields.delivery_zone && (
                              <p className="text-xs text-muted-foreground">{tx('Zone')}: {f.fields.delivery_zone}</p>
                            )}
                          </div>
                          {isSelected && <IconCheck size={16} className="text-primary shrink-0 mt-0.5" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {submitError && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting} className="w-full sm:w-auto">
                {tx('Zurück')}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleSubmit(null)}
                disabled={submitting}
                className="w-full sm:w-auto"
              >
                {submitting && !selectedFahrerId ? tx('Wird gespeichert …') : tx('Ohne Fahrer anlegen')}
              </Button>
              {selectedFahrerId && (
                <Button
                  onClick={() => handleSubmit(selectedFahrerId)}
                  disabled={submitting}
                  className="w-full sm:w-auto"
                >
                  {submitting ? tx('Wird gespeichert …') : tx('Bestellung anlegen')}
                </Button>
              )}
              {!selectedFahrerId && (
                <Button
                  onClick={() => handleSubmit(null)}
                  disabled={submitting}
                  className="w-full sm:w-auto"
                >
                  {submitting ? tx('Wird gespeichert …') : tx('Bestellung anlegen')}
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte zunächst Kunde und Bestelldetails eingeben.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Schritt 4: Bestätigung */}
      {step === 4 && (
        createdOrderId ? (
          <div className="text-center py-10 space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-5">
                <IconCheck size={40} className="text-primary" stroke={1.5} />
              </div>
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-semibold">{tx('Bestellung angelegt!')}</h2>
              <p className="text-sm text-muted-foreground">
                {tx('Bestellnummer')}: <span className="font-mono font-medium">{createdOrderId}</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset} variant="outline">
                {tx('Neue Bestellung aufnehmen')}
              </Button>
              <a href="#/">
                <Button className="w-full">{tx('Zurück zum Dashboard')}</Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Keine Bestellung gefunden.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
