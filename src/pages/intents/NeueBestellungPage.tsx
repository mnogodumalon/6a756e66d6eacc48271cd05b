/**
 * Neue Bestellung — 4-Schritt-Wizard.
 * Steps: 1) Kunde wählen → 2) Bestellung eingeben → 3) Fahrer zuweisen → 4) Bestätigen & Erstellen.
 * Reads: kundenverwaltung, fahrerverwaltung. Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useCallback } from 'react';
import { format } from 'date-fns';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kundenverwaltung, Fahrerverwaltung } from '@/types/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tx } from '@/i18n';
import {
  IconUser,
  IconTruck,
  IconMapPin,
  IconCurrencyEuro,
  IconClipboardList,
  IconCheck,
  IconCar,
  IconAlertCircle,
} from '@tabler/icons-react';

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

function getNowLocal(): string {
  return format(new Date(), "yyyy-MM-dd'T'HH:mm");
}

export default function NeueBestellungPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedKunde, setSelectedKunde] = useState<Kundenverwaltung | null>(null);

  // Step 2 form state
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [orderDate, setOrderDate] = useState(getNowLocal());
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');

  // Step 3
  const [selectedFahrer, setSelectedFahrer] = useState<Fahrerverwaltung | null>(null);
  const [fahrerSkipped, setFahrerSkipped] = useState(false);

  // Step 4
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // New Kunde mini-form state
  const [showNewKunde, setShowNewKunde] = useState(false);
  const [newKundeFirst, setNewKundeFirst] = useState('');
  const [newKundeLast, setNewKundeLast] = useState('');
  const [newKundeEmail, setNewKundeEmail] = useState('');
  const [newKundePhone, setNewKundePhone] = useState('');

  const handleKundeSelect = useCallback((id: string) => {
    const k = kundenverwaltung.find(k => k.record_id === id) ?? null;
    setSelectedKunde(k);
    if (k) {
      setDeliveryStreet(k.fields.street ?? '');
      setDeliveryHouseNumber(k.fields.house_number ?? '');
      setDeliveryPostalCode(k.fields.postal_code ?? '');
      setDeliveryCity(k.fields.city ?? '');
    }
    setStep(2);
  }, [kundenverwaltung]);

  const handleCreateKunde = useCallback(async () => {
    if (!newKundeFirst || !newKundeLast) return;
    const created = await LivingAppsService.createKundenverwaltungEntry({
      first_name: newKundeFirst,
      last_name: newKundeLast,
      email: newKundeEmail || undefined,
      phone: newKundePhone || undefined,
      customer_status: 'aktiv',
    });
    await fetchAll();
    setShowNewKunde(false);
    setNewKundeFirst('');
    setNewKundeLast('');
    setNewKundeEmail('');
    setNewKundePhone('');
    const k = kundenverwaltung.find(k2 => k2.record_id === created.record_id) ?? null;
    setSelectedKunde(k);
    if (k) {
      setDeliveryStreet(k.fields.street ?? '');
      setDeliveryHouseNumber(k.fields.house_number ?? '');
      setDeliveryPostalCode(k.fields.postal_code ?? '');
      setDeliveryCity(k.fields.city ?? '');
    }
    setStep(2);
  }, [newKundeFirst, newKundeLast, newKundeEmail, newKundePhone, fetchAll, kundenverwaltung]);

  const handleFahrerSelect = useCallback((id: string) => {
    const f = fahrerverwaltung.find(f => f.record_id === id) ?? null;
    setSelectedFahrer(f);
    setFahrerSkipped(false);
    setStep(4);
  }, [fahrerverwaltung]);

  const handleSkipFahrer = useCallback(() => {
    setSelectedFahrer(null);
    setFahrerSkipped(true);
    setStep(4);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!selectedKunde) return;
    if (createdId) return; // idempotency guard
    setSubmitting(true);
    setSubmitError(null);
    try {
      const result = await LivingAppsService.createBestellverwaltungEntry({
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id),
        fahrer: selectedFahrer
          ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrer.record_id)
          : undefined,
        ordered_items: orderedItems,
        total_amount: parseFloat(totalAmount),
        order_date: orderDate,
        desired_delivery_time: desiredDeliveryTime || undefined,
        payment_method: paymentMethod || undefined,
        delivery_notes: deliveryNotes || undefined,
        delivery_street: deliveryStreet || undefined,
        delivery_house_number: deliveryHouseNumber || undefined,
        delivery_postal_code: deliveryPostalCode || undefined,
        delivery_city: deliveryCity || undefined,
        order_status: 'neu',
      });
      setCreatedId(result.record_id);
      await fetchAll();
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Fehler beim Erstellen der Bestellung.'));
    } finally {
      setSubmitting(false);
    }
  }, [
    selectedKunde, selectedFahrer, orderedItems, totalAmount, orderDate,
    desiredDeliveryTime, paymentMethod, deliveryNotes, deliveryStreet,
    deliveryHouseNumber, deliveryPostalCode, deliveryCity, fetchAll, createdId,
  ]);

  const handleReset = useCallback(() => {
    setStep(1);
    setSelectedKunde(null);
    setOrderedItems('');
    setTotalAmount('');
    setOrderDate(getNowLocal());
    setDesiredDeliveryTime('');
    setPaymentMethod('');
    setDeliveryNotes('');
    setDeliveryStreet('');
    setDeliveryHouseNumber('');
    setDeliveryPostalCode('');
    setDeliveryCity('');
    setSelectedFahrer(null);
    setFahrerSkipped(false);
    setCreatedId(null);
    setSubmitError(null);
  }, []);

  const verfuegbareFahrer = fahrerverwaltung.filter(
    f => f.fields.driver_status?.key === 'verfuegbar'
  );

  const step2Valid = orderedItems.trim() !== '' && totalAmount !== '' && !isNaN(parseFloat(totalAmount));

  return (
    <IntentWizardShell
      title={tx('Neue Bestellung')}
      subtitle={tx('Bestellung in 4 Schritten aufnehmen')}
      steps={[
        { label: tx('Kunde') },
        { label: tx('Bestellung') },
        { label: tx('Fahrer') },
        { label: tx('Bestätigen') },
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
          items={kundenverwaltung.map(k => ({
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
          createLabel={tx('Neuen Kunden anlegen')}
          onCreateNew={() => setShowNewKunde(true)}
          createDialog={showNewKunde && (
            <div className="rounded-2xl border p-4 space-y-3">
              <p className="text-sm font-medium text-foreground">{tx('Neuen Kunden anlegen')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  value={newKundeFirst}
                  onChange={e => setNewKundeFirst(e.target.value)}
                  placeholder={tx('Vorname')}
                />
                <Input
                  value={newKundeLast}
                  onChange={e => setNewKundeLast(e.target.value)}
                  placeholder={tx('Nachname')}
                />
                <Input
                  value={newKundeEmail}
                  onChange={e => setNewKundeEmail(e.target.value)}
                  placeholder={tx('E-Mail')}
                  type="email"
                />
                <Input
                  value={newKundePhone}
                  onChange={e => setNewKundePhone(e.target.value)}
                  placeholder={tx('Telefon')}
                  type="tel"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  disabled={!newKundeFirst || !newKundeLast}
                  onClick={handleCreateKunde}
                >
                  {tx('Anlegen & auswählen')}
                </Button>
                <Button variant="outline" onClick={() => setShowNewKunde(false)}>
                  {tx('Abbrechen')}
                </Button>
              </div>
            </div>
          )}
          emptyText={tx('Keine Kunden gefunden')}
        />
      )}

      {/* Step 2: Bestellung eingeben */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-6">
            {/* Customer context banner */}
            <div className="rounded-2xl border bg-secondary p-4 flex items-center gap-3">
              <IconUser size={20} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </p>
                <p className="text-sm text-muted-foreground truncate">
                  {[selectedKunde.fields.email, selectedKunde.fields.phone].filter(Boolean).join(' · ')}
                </p>
              </div>
              {selectedKunde.fields.customer_status && (
                <StatusBadge
                  statusKey={selectedKunde.fields.customer_status.key}
                  label={selectedKunde.fields.customer_status.label}
                  className="shrink-0"
                />
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-1">
                  <IconClipboardList size={15} />
                  {tx('Bestellte Artikel')} <span className="text-destructive">*</span>
                </label>
                <Textarea
                  value={orderedItems}
                  onChange={e => setOrderedItems(e.target.value)}
                  placeholder={tx('Artikel auflisten …')}
                  rows={3}
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground flex items-center gap-1">
                    <IconCurrencyEuro size={15} />
                    {tx('Gesamtbetrag (€)')} <span className="text-destructive">*</span>
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

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Zahlungsart')}
                  </label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={tx('Zahlungsart wählen')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tx('Keine Angabe')}</SelectItem>
                      {PAYMENT_OPTIONS.map(opt => (
                        <SelectItem key={opt.key} value={opt.key}>{opt.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Bestelldatum/-uhrzeit')} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="datetime-local"
                    value={orderDate}
                    onChange={e => setOrderDate(e.target.value)}
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Gewünschte Lieferzeit')}
                  </label>
                  <Input
                    type="datetime-local"
                    value={desiredDeliveryTime}
                    onChange={e => setDesiredDeliveryTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">
                  {tx('Lieferhinweise')}
                </label>
                <Textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={tx('Klingel, Etage, besondere Hinweise …')}
                  rows={2}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-1">
                  <IconMapPin size={15} />
                  {tx('Lieferadresse')}
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input
                    value={deliveryStreet}
                    onChange={e => setDeliveryStreet(e.target.value)}
                    placeholder={tx('Straße')}
                    className="sm:col-span-2"
                  />
                  <Input
                    value={deliveryHouseNumber}
                    onChange={e => setDeliveryHouseNumber(e.target.value)}
                    placeholder={tx('Hausnr.')}
                  />
                  <Input
                    value={deliveryPostalCode}
                    onChange={e => setDeliveryPostalCode(e.target.value)}
                    placeholder={tx('PLZ')}
                  />
                  <Input
                    value={deliveryCity}
                    onChange={e => setDeliveryCity(e.target.value)}
                    placeholder={tx('Ort')}
                    className="sm:col-span-2"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                disabled={!step2Valid}
                onClick={() => setStep(3)}
                className="flex-1 sm:flex-none"
              >
                {tx('Weiter: Fahrer zuweisen')}
              </Button>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Zurück')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst einen Kunden auswählen.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Zu Schritt 1')}</Button>
          </div>
        )
      )}

      {/* Step 3: Fahrer zuweisen */}
      {step === 3 && (
        selectedKunde ? (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
              <p className="text-sm text-muted-foreground">
                {tx('Fahrer ist optional — du kannst diesen Schritt überspringen.')}
              </p>
              <Button variant="outline" onClick={handleSkipFahrer} className="shrink-0">
                {tx('Ohne Fahrer weiter')}
              </Button>
            </div>

            <EntitySelectStep
              items={verfuegbareFahrer.map(f => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || f.record_id,
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone ? tx`Zone: ${f.fields.delivery_zone}` : undefined,
                ].filter(Boolean).join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconCar size={20} className="text-primary" />,
              }))}
              onSelect={handleFahrerSelect}
              searchPlaceholder={tx('Fahrer suchen …')}
              emptyText={tx('Keine verfügbaren Fahrer gefunden')}
              emptyIcon={<IconTruck size={32} className="text-muted-foreground" />}
            />

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(2)}>
                {tx('Zurück')}
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

      {/* Step 4: Bestätigen & Erstellen */}
      {step === 4 && (
        selectedKunde ? (
          createdId ? (
            <div className="text-center py-12 space-y-6">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto">
                <IconCheck size={32} className="text-primary" />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-semibold text-foreground">{tx('Bestellung erfolgreich erstellt!')}</h3>
                <p className="text-sm text-muted-foreground">
                  {tx('Bestellnummer')}: <span className="font-mono font-medium">{createdId}</span>
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Button onClick={handleReset}>
                  {tx('Neue Bestellung anlegen')}
                </Button>
                <a href="#/" className="inline-flex">
                  <Button variant="outline" className="w-full">
                    {tx('Zurück zum Dashboard')}
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <h3 className="text-base font-semibold text-foreground">{tx('Zusammenfassung')}</h3>

              <div className="rounded-2xl border bg-card overflow-hidden divide-y">
                {/* Customer */}
                <div className="p-4 flex items-start gap-3">
                  <IconUser size={18} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tx('Kunde')}</p>
                    <p className="font-medium text-foreground truncate">
                      {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                    </p>
                    {selectedKunde.fields.email && (
                      <p className="text-sm text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                    )}
                  </div>
                </div>

                {/* Order */}
                <div className="p-4 flex items-start gap-3">
                  <IconClipboardList size={18} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs text-muted-foreground">{tx('Bestellte Artikel')}</p>
                    <p className="text-sm text-foreground whitespace-pre-line line-clamp-2">{orderedItems}</p>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                      <span className="text-sm font-semibold text-foreground">
                        {parseFloat(totalAmount || '0').toFixed(2)} €
                      </span>
                      {paymentMethod && paymentMethod !== 'none' && (
                        <span className="text-sm text-muted-foreground">
                          {PAYMENT_OPTIONS.find(o => o.key === paymentMethod)?.label ?? paymentMethod}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Delivery address */}
                {(deliveryStreet || deliveryCity) && (
                  <div className="p-4 flex items-start gap-3">
                    <IconMapPin size={18} className="text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tx('Lieferadresse')}</p>
                      <p className="text-sm text-foreground">
                        {[deliveryStreet, deliveryHouseNumber].filter(Boolean).join(' ')}
                      </p>
                      <p className="text-sm text-foreground">
                        {[deliveryPostalCode, deliveryCity].filter(Boolean).join(' ')}
                      </p>
                    </div>
                  </div>
                )}

                {/* Delivery time */}
                {desiredDeliveryTime && (
                  <div className="p-4 flex items-start gap-3">
                    <IconTruck size={18} className="text-muted-foreground shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tx('Gewünschte Lieferzeit')}</p>
                      <p className="text-sm text-foreground">{desiredDeliveryTime.replace('T', ' ')}</p>
                    </div>
                  </div>
                )}

                {/* Driver */}
                <div className="p-4 flex items-start gap-3">
                  <IconCar size={18} className="text-muted-foreground shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{tx('Fahrer')}</p>
                    {selectedFahrer ? (
                      <p className="text-sm text-foreground">
                        {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name].filter(Boolean).join(' ')}
                        {selectedFahrer.fields.vehicle_type && (
                          <span className="text-muted-foreground"> · {selectedFahrer.fields.vehicle_type.label}</span>
                        )}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        {fahrerSkipped ? tx('Kein Fahrer zugewiesen') : tx('Nicht ausgewählt')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {submitError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 flex items-center gap-2 text-sm text-destructive">
                  <IconAlertCircle size={16} className="shrink-0" />
                  {submitError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="flex-1 sm:flex-none"
                >
                  {submitting ? tx('Wird erstellt …') : tx('Bestellung erstellen')}
                </Button>
                <Button variant="outline" onClick={() => setStep(3)}>
                  {tx('Zurück')}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
