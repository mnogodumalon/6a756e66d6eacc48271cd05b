/**
 * Bestellung aufgeben — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen (aktiv) → 2) Bestelldetails eingeben → 3) Fahrer zuweisen (optional).
 * Reads: kundenverwaltung (customer_status=aktiv), fahrerverwaltung (driver_status=verfuegbar).
 * Writes: bestellverwaltung (createBestellverwaltungEntry, updateBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
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
  IconCheck,
  IconMapPin,
  IconCurrencyEuro,
  IconClipboardList,
  IconUserPlus,
} from '@tabler/icons-react';

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function BestellungAufgebenPage() {
  const WIZARD_STEPS = [
  { label: tx('Kunde') },
  { label: tx('Bestellung') },
  { label: tx('Fahrer') },
];

  const [searchParams] = useSearchParams();
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  // Step state — initialise from URL param
  const initialKundeId = searchParams.get('kundeId');
  const [step, setStep] = useState(initialKundeId ? 2 : 1);

  // Step 1 — selected customer
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(initialKundeId);

  // Step 1 — create new customer mini-form
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newKundeFirstName, setNewKundeFirstName] = useState('');
  const [newKundeLastName, setNewKundeLastName] = useState('');
  const [newKundeEmail, setNewKundeEmail] = useState('');
  const [newKundePhone, setNewKundePhone] = useState('');
  const [newKundeCity, setNewKundeCity] = useState('');
  const [creatingKunde, setCreatingKunde] = useState(false);

  // Step 2 — order details form
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [orderDate, setOrderDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState(PAYMENT_OPTIONS[0]?.key ?? 'bar');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [submittingOrder, setSubmittingOrder] = useState(false);
  const [orderError, setOrderError] = useState<string | null>(null);

  // Step 2 result — stored to prevent duplicate creation on retry
  const [newOrderId, setNewOrderId] = useState<string | null>(null);

  // Step 3 — selected driver
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [assigningDriver, setAssigningDriver] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Derived data
  const activeKunden = (kundenverwaltung as Kundenverwaltung[]).filter(
    (k) => k.fields.customer_status?.key === 'aktiv',
  );
  const availableFahrer = (fahrerverwaltung as Fahrerverwaltung[]).filter(
    (f) => f.fields.driver_status?.key === 'verfuegbar',
  );
  const selectedKunde = selectedKundeId
    ? (kundenverwaltung as Kundenverwaltung[]).find((k) => k.record_id === selectedKundeId) ?? null
    : null;

  // Handlers
  const handleSelectKunde = useCallback(
    (id: string) => {
      setSelectedKundeId(id);
      setStep(2);
    },
    [],
  );

  const handleCreateKunde = useCallback(async () => {
    if (!newKundeFirstName.trim() || !newKundeLastName.trim()) return;
    setCreatingKunde(true);
    try {
      const created = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newKundeFirstName.trim(),
        last_name: newKundeLastName.trim(),
        email: newKundeEmail.trim() || undefined,
        phone: newKundePhone.trim() || undefined,
        city: newKundeCity.trim() || undefined,
        customer_status: 'aktiv',
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNewKundeFirstName('');
      setNewKundeLastName('');
      setNewKundeEmail('');
      setNewKundePhone('');
      setNewKundeCity('');
      setSelectedKundeId(created.record_id);
      setStep(2);
    } finally {
      setCreatingKunde(false);
    }
  }, [newKundeFirstName, newKundeLastName, newKundeEmail, newKundePhone, newKundeCity, fetchAll]);

  const handleSubmitOrder = useCallback(async () => {
    if (!selectedKundeId || !orderedItems.trim() || !totalAmount) return;
    setSubmittingOrder(true);
    setOrderError(null);
    try {
      // Idempotency guard: only create if we don't have an id yet
      let orderId = newOrderId;
      if (!orderId) {
        const kundeURL = createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId);
        const payload: Record<string, unknown> = {
          ordered_items: orderedItems.trim(),
          total_amount: parseFloat(totalAmount),
          order_date: orderDate,
          order_status: 'neu',
          kunde: kundeURL,
        };
        if (desiredDeliveryTime) payload.desired_delivery_time = desiredDeliveryTime;
        if (paymentMethodKey && paymentMethodKey !== 'none') payload.payment_method = paymentMethodKey;
        if (deliveryStreet.trim()) payload.delivery_street = deliveryStreet.trim();
        if (deliveryHouseNumber.trim()) payload.delivery_house_number = deliveryHouseNumber.trim();
        if (deliveryPostalCode.trim()) payload.delivery_postal_code = deliveryPostalCode.trim();
        if (deliveryCity.trim()) payload.delivery_city = deliveryCity.trim();
        if (deliveryNotes.trim()) payload.delivery_notes = deliveryNotes.trim();

        const created = await LivingAppsService.createBestellverwaltungEntry(payload as Parameters<typeof LivingAppsService.createBestellverwaltungEntry>[0]);
        orderId = created.record_id;
        setNewOrderId(orderId);
      }
      await fetchAll();
      setStep(3);
    } catch (e) {
      setOrderError(e instanceof Error ? e.message : tx('Fehler beim Anlegen der Bestellung.'));
    } finally {
      setSubmittingOrder(false);
    }
  }, [
    selectedKundeId,
    orderedItems,
    totalAmount,
    orderDate,
    desiredDeliveryTime,
    paymentMethodKey,
    deliveryStreet,
    deliveryHouseNumber,
    deliveryPostalCode,
    deliveryCity,
    deliveryNotes,
    newOrderId,
    fetchAll,
  ]);

  const handleAssignDriver = useCallback(
    async (fahrerId: string) => {
      if (!newOrderId) return;
      setAssigningDriver(true);
      setAssignError(null);
      setSelectedFahrerId(fahrerId);
      try {
        const fahrerURL = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, fahrerId);
        await LivingAppsService.updateBestellverwaltungEntry(newOrderId, {
          fahrer: fahrerURL,
          order_status: 'in_bearbeitung',
        });
        await fetchAll();
        setDone(true);
      } catch (e) {
        setAssignError(e instanceof Error ? e.message : tx('Fehler beim Zuweisen des Fahrers.'));
        setSelectedFahrerId(null);
      } finally {
        setAssigningDriver(false);
      }
    },
    [newOrderId, fetchAll],
  );

  const handleFinishWithoutDriver = useCallback(async () => {
    setDone(true);
  }, []);

  const handleReset = useCallback(() => {
    setStep(1);
    setSelectedKundeId(null);
    setOrderedItems('');
    setTotalAmount('');
    setOrderDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
    setDesiredDeliveryTime('');
    setPaymentMethodKey(PAYMENT_OPTIONS[0]?.key ?? 'bar');
    setDeliveryStreet('');
    setDeliveryHouseNumber('');
    setDeliveryPostalCode('');
    setDeliveryCity('');
    setDeliveryNotes('');
    setNewOrderId(null);
    setSelectedFahrerId(null);
    setDone(false);
    setOrderError(null);
    setAssignError(null);
  }, []);

  // Context info box shown in steps 2 and 3
  const kundeInfoBox = selectedKunde ? (
    <div className="flex items-center gap-3 rounded-xl border bg-secondary/40 px-4 py-3 mb-4">
      <IconUser size={18} className="text-primary shrink-0" />
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">
          {selectedKunde.fields.first_name} {selectedKunde.fields.last_name}
        </p>
        {selectedKunde.fields.city && (
          <p className="text-xs text-muted-foreground truncate">{selectedKunde.fields.city}</p>
        )}
      </div>
      {newOrderId && (
        <div className="ml-auto flex items-center gap-1 shrink-0">
          <IconCurrencyEuro size={16} className="text-primary" />
          <span className="text-sm font-semibold">
            {parseFloat(totalAmount || '0').toFixed(2)} €
          </span>
        </div>
      )}
    </div>
  ) : null;

  return (
    <IntentWizardShell
      title={tx('Bestellung aufgeben')}
      subtitle={tx('Kunde wählen, Details eingeben, Fahrer zuweisen')}
      steps={WIZARD_STEPS}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Kunde wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={activeKunden.map((k) => ({
            id: k.record_id,
            title: `${k.fields.first_name ?? ''} ${k.fields.last_name ?? ''}`.trim() || k.record_id,
            subtitle: [k.fields.email, k.fields.phone, k.fields.city].filter(Boolean).join(' · '),
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectKunde}
          searchPlaceholder={tx('Kunde suchen …')}
          emptyText={tx('Keine aktiven Kunden gefunden')}
          createLabel={tx('Neuen Kunden anlegen')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={
            showCreateKunde ? (
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <p className="text-sm font-semibold">{tx('Neuen Kunden anlegen')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    value={newKundeFirstName}
                    onChange={(e) => setNewKundeFirstName(e.target.value)}
                    placeholder={tx('Vorname')}
                  />
                  <Input
                    value={newKundeLastName}
                    onChange={(e) => setNewKundeLastName(e.target.value)}
                    placeholder={tx('Nachname')}
                  />
                  <Input
                    type="email"
                    value={newKundeEmail}
                    onChange={(e) => setNewKundeEmail(e.target.value)}
                    placeholder={tx('E-Mail (optional)')}
                  />
                  <Input
                    type="tel"
                    value={newKundePhone}
                    onChange={(e) => setNewKundePhone(e.target.value)}
                    placeholder={tx('Telefon (optional)')}
                  />
                  <Input
                    value={newKundeCity}
                    onChange={(e) => setNewKundeCity(e.target.value)}
                    placeholder={tx('Stadt (optional)')}
                    className="sm:col-span-2"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    disabled={!newKundeFirstName.trim() || !newKundeLastName.trim() || creatingKunde}
                    onClick={handleCreateKunde}
                    className="flex-1"
                  >
                    {creatingKunde ? tx('Wird angelegt …') : tx('Anlegen & auswählen')}
                  </Button>
                  <Button variant="outline" onClick={() => setShowCreateKunde(false)}>
                    {tx('Abbrechen')}
                  </Button>
                </div>
              </div>
            ) : null
          }
        />
      )}

      {/* ── Step 2: Bestelldetails ── */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-4">
            {kundeInfoBox}
            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 mb-1">
                <IconClipboardList size={18} className="text-primary" />
                <h3 className="font-semibold text-sm">{tx('Bestelldetails')}</h3>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">{tx('Bestellte Artikel *')}</label>
                <Textarea
                  value={orderedItems}
                  onChange={(e) => setOrderedItems(e.target.value)}
                  placeholder={tx('Artikel, Mengen, Beschreibung …')}
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">{tx('Gesamtbetrag (€) *')}</label>
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
                  <label className="text-xs text-muted-foreground font-medium">{tx('Bestelldatum & -uhrzeit *')}</label>
                  <Input
                    type="datetime-local"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">{tx('Gewünschte Lieferzeit')}</label>
                  <Input
                    type="datetime-local"
                    value={desiredDeliveryTime}
                    onChange={(e) => setDesiredDeliveryTime(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground font-medium">{tx('Zahlungsart')}</label>
                  <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
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
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1">
                  <IconMapPin size={14} className="text-muted-foreground" />
                  <label className="text-xs text-muted-foreground font-medium">{tx('Lieferadresse')}</label>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input
                    value={deliveryStreet}
                    onChange={(e) => setDeliveryStreet(e.target.value)}
                    placeholder={tx('Straße')}
                    className="sm:col-span-2"
                  />
                  <Input
                    value={deliveryHouseNumber}
                    onChange={(e) => setDeliveryHouseNumber(e.target.value)}
                    placeholder={tx('Nr.')}
                  />
                  <Input
                    value={deliveryPostalCode}
                    onChange={(e) => setDeliveryPostalCode(e.target.value)}
                    placeholder={tx('PLZ')}
                  />
                  <Input
                    value={deliveryCity}
                    onChange={(e) => setDeliveryCity(e.target.value)}
                    placeholder={tx('Ort')}
                    className="sm:col-span-2"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-muted-foreground font-medium">{tx('Lieferhinweise')}</label>
                <Textarea
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder={tx('Klingeln, Etage, Code …')}
                  rows={2}
                />
              </div>

              {orderError && (
                <p className="text-sm text-destructive">{orderError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={() => setStep(1)}
                  className="flex-shrink-0"
                >
                  {tx('Zurück')}
                </Button>
                <Button
                  disabled={!orderedItems.trim() || !totalAmount || !orderDate || submittingOrder}
                  onClick={handleSubmitOrder}
                  className="flex-1"
                >
                  {submittingOrder ? tx('Wird gespeichert …') : tx('Bestellung anlegen & Fahrer wählen')}
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst einen Kunden auswählen.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Zurück zu Schritt 1')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Fahrer zuweisen ── */}
      {step === 3 && (
        newOrderId ? (
          done ? (
            /* Success state */
            <div className="flex flex-col items-center gap-6 py-12">
              <div className="rounded-full bg-primary/10 p-5">
                <IconCheck size={40} className="text-primary" stroke={2} />
              </div>
              <div className="text-center space-y-1">
                <h3 className="text-lg font-semibold">{tx('Bestellung aufgegeben!')}</h3>
                {selectedFahrerId ? (
                  <p className="text-sm text-muted-foreground">
                    {tx('Fahrer zugewiesen. Bestellung ist in Bearbeitung.')}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {tx('Bestellung angelegt. Fahrer kann später zugewiesen werden.')}
                  </p>
                )}
                {selectedKunde && (
                  <p className="text-xs text-muted-foreground">
                    {tx('Kunde')}: {selectedKunde.fields.first_name} {selectedKunde.fields.last_name}
                    {totalAmount && ` · ${parseFloat(totalAmount).toFixed(2)} €`}
                  </p>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                <Button onClick={handleReset} className="flex-1">
                  {tx('Neue Bestellung aufgeben')}
                </Button>
                <Button variant="outline" asChild className="flex-1">
                  <a href="#/">{tx('Zum Dashboard')}</a>
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {kundeInfoBox}
              <div className="rounded-2xl border bg-card p-4 mb-2">
                <p className="text-xs text-muted-foreground">
                  {tx('Bestellung angelegt. Fahrer zuweisen (optional) — oder direkt abschließen.')}
                </p>
              </div>

              <EntitySelectStep
                items={availableFahrer.map((f) => ({
                  id: f.record_id,
                  title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || f.record_id,
                  subtitle: [
                    f.fields.vehicle_type?.label,
                    f.fields.delivery_zone,
                    f.fields.driver_phone,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  icon: <IconTruck size={20} className="text-primary" />,
                  status: f.fields.driver_status
                    ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                    : undefined,
                }))}
                onSelect={handleAssignDriver}
                searchPlaceholder={tx('Fahrer suchen …')}
                emptyText={tx('Keine verfügbaren Fahrer')}
              />

              {assignError && (
                <p className="text-sm text-destructive px-1">{assignError}</p>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="outline"
                  onClick={handleFinishWithoutDriver}
                  disabled={assigningDriver}
                  className="flex-1"
                >
                  {tx('Ohne Fahrer abschließen')}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bestellung noch nicht angelegt. Bitte Schritt 2 abschließen.')}</p>
            <Button variant="outline" onClick={() => setStep(2)}>{tx('Zurück zu Schritt 2')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
