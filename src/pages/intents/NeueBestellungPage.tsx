/**
 * Neue Bestellung — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen (nur aktive) → 2) Bestelldetails eingeben → 3) Fahrer zuweisen & Bestellung erstellen.
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
  IconCurrencyEuro,
  IconMapPin,
  IconClock,
} from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kundenverwaltung, Fahrerverwaltung } from '@/types/app';
import { tx } from '@/i18n';

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function NeueBestellungPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);

  // Step 1 state
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newKundeFirstName, setNewKundeFirstName] = useState('');
  const [newKundeLastName, setNewKundeLastName] = useState('');
  const [newKundeEmail, setNewKundeEmail] = useState('');
  const [newKundePhone, setNewKundePhone] = useState('');
  const [newKundeCity, setNewKundeCity] = useState('');
  const [createKundeLoading, setCreateKundeLoading] = useState(false);

  // Step 2 state
  const [orderDate, setOrderDate] = useState(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState(PAYMENT_OPTIONS[0]?.key ?? 'bar');
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Step 3 state
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdBestellungId, setCreatedBestellungId] = useState<string | null>(null);

  const selectedKunde = kundenverwaltung.find((k) => k.record_id === selectedKundeId) ?? null;
  const selectedFahrer = fahrerverwaltung.find((f) => f.record_id === selectedFahrerId) ?? null;

  const activeKunden = kundenverwaltung.filter(
    (k) => k.fields.customer_status?.key === 'aktiv',
  );

  const availableFahrer = fahrerverwaltung.filter(
    (f) => f.fields.driver_status?.key === 'verfuegbar',
  );

  const handleCreateKunde = async () => {
    if (!newKundeFirstName || !newKundeLastName || !newKundeCity) return;
    setCreateKundeLoading(true);
    try {
      const created = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newKundeFirstName,
        last_name: newKundeLastName,
        email: newKundeEmail || undefined,
        phone: newKundePhone || undefined,
        city: newKundeCity,
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
      setCreateKundeLoading(false);
    }
  };

  const handleKundeSelect = (id: string) => {
    setSelectedKundeId(id);
    // Pre-fill delivery city from customer city
    const kunde = kundenverwaltung.find((k) => k.record_id === id);
    if (kunde?.fields.city && !deliveryCity) {
      setDeliveryCity(kunde.fields.city);
    }
    setStep(2);
  };

  const handleSubmit = async () => {
    if (!selectedKundeId) return;
    setSubmitting(true);
    setSubmitError(null);

    let pid = createdBestellungId;
    try {
      if (!pid) {
        const payload: Record<string, unknown> = {
          kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId),
          order_status: 'neu',
          order_date: orderDate,
          ordered_items: orderedItems,
          total_amount: totalAmount ? parseFloat(totalAmount) : undefined,
          payment_method: paymentMethodKey !== 'none' ? paymentMethodKey : undefined,
          delivery_notes: deliveryNotes || undefined,
          delivery_street: deliveryStreet || undefined,
          delivery_house_number: deliveryHouseNumber || undefined,
          delivery_postal_code: deliveryPostalCode || undefined,
          delivery_city: deliveryCity || undefined,
          desired_delivery_time: desiredDeliveryTime || undefined,
        };
        if (selectedFahrerId) {
          payload.fahrer = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId);
        }
        const result = await LivingAppsService.createBestellverwaltungEntry(
          payload as Parameters<typeof LivingAppsService.createBestellverwaltungEntry>[0],
        );
        pid = result.record_id;
        setCreatedBestellungId(pid);
      }
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tx('Fehler beim Erstellen der Bestellung'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKundeId(null);
    setOrderedItems('');
    setTotalAmount('');
    setPaymentMethodKey(PAYMENT_OPTIONS[0]?.key ?? 'bar');
    setDesiredDeliveryTime('');
    setDeliveryStreet('');
    setDeliveryHouseNumber('');
    setDeliveryPostalCode('');
    setDeliveryCity('');
    setDeliveryNotes('');
    setSelectedFahrerId(null);
    setCreatedBestellungId(null);
    setSubmitError(null);
    setOrderDate(format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  };

  const kundeLabel = (k: Kundenverwaltung) =>
    [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id;

  const fahrerLabel = (f: Fahrerverwaltung) =>
    [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || f.record_id;

  return (
    <IntentWizardShell
      title={tx('Neue Bestellung')}
      subtitle={tx('In 3 Schritten eine Bestellung anlegen')}
      steps={[
        { label: tx('Kunde') },
        { label: tx('Bestellung') },
        { label: tx('Fahrer') },
        { label: tx('Fertig') },
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
          items={activeKunden.map((k) => ({
            id: k.record_id,
            title: kundeLabel(k),
            subtitle: [k.fields.email, k.fields.phone, k.fields.city].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleKundeSelect}
          searchPlaceholder={tx('Kunden suchen …')}
          createLabel={tx('Neuen Kunden anlegen')}
          onCreateNew={() => setShowCreateKunde(true)}
          emptyText={tx('Keine aktiven Kunden gefunden')}
          createDialog={
            showCreateKunde ? (
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">{tx('Neuen Kunden anlegen')}</p>
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
                </div>
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
                  placeholder={tx('Stadt')}
                />
                <div className="flex gap-2">
                  <Button
                    disabled={!newKundeFirstName || !newKundeLastName || !newKundeCity || createKundeLoading}
                    onClick={handleCreateKunde}
                  >
                    {createKundeLoading ? tx('Wird angelegt …') : tx('Anlegen & auswählen')}
                  </Button>
                  <Button variant="outline" onClick={() => setShowCreateKunde(false)}>
                    {tx('Abbrechen')}
                  </Button>
                </div>
              </div>
            ) : undefined
          }
        />
      )}

      {/* Step 2: Bestelldetails */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-6">
            {/* Kunde-Kontext */}
            <div className="flex items-center gap-3 rounded-2xl border bg-secondary/40 px-4 py-3">
              <IconUser size={18} className="text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{tx('Kunde')}</p>
                <p className="text-sm font-medium truncate">{selectedKunde ? kundeLabel(selectedKunde) : selectedKundeId}</p>
              </div>
            </div>

            {/* Live-Total */}
            {totalAmount && parseFloat(totalAmount) > 0 && (
              <div className="flex items-center gap-3 rounded-2xl border bg-primary/5 px-4 py-3">
                <IconCurrencyEuro size={18} className="text-primary shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">{tx('Bestellwert')}</p>
                  <p className="text-lg font-bold text-primary">
                    {parseFloat(totalAmount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {/* Bestelldatum */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{tx('Bestelldatum & -uhrzeit')} *</label>
                <Input
                  type="datetime-local"
                  value={orderDate}
                  onChange={(e) => setOrderDate(e.target.value)}
                />
              </div>

              {/* Bestellte Artikel */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{tx('Bestellte Artikel')} *</label>
                <textarea
                  className="w-full min-h-[100px] rounded-xl border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  value={orderedItems}
                  onChange={(e) => setOrderedItems(e.target.value)}
                  placeholder={tx('z. B. 2x Pizza Margherita, 1x Cola …')}
                />
              </div>

              {/* Gesamtbetrag */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{tx('Gesamtbetrag (€)')} *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={totalAmount}
                  onChange={(e) => setTotalAmount(e.target.value)}
                  placeholder="0,00"
                />
              </div>

              {/* Zahlungsmethode */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{tx('Zahlungsmethode')}</label>
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

              {/* Gewünschte Lieferzeit */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground flex items-center gap-1">
                  <IconClock size={15} />
                  {tx('Gewünschte Lieferzeit')}
                </label>
                <Input
                  type="datetime-local"
                  value={desiredDeliveryTime}
                  onChange={(e) => setDesiredDeliveryTime(e.target.value)}
                />
              </div>

              {/* Lieferadresse */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground flex items-center gap-1">
                  <IconMapPin size={15} />
                  {tx('Lieferadresse')}
                </label>
                <div className="grid grid-cols-3 gap-2">
                  <div className="col-span-2">
                    <Input
                      value={deliveryStreet}
                      onChange={(e) => setDeliveryStreet(e.target.value)}
                      placeholder={tx('Straße')}
                    />
                  </div>
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
                  <div className="col-span-2">
                    <Input
                      value={deliveryCity}
                      onChange={(e) => setDeliveryCity(e.target.value)}
                      placeholder={tx('Stadt')}
                    />
                  </div>
                </div>
              </div>

              {/* Lieferhinweise */}
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">{tx('Lieferhinweise')}</label>
                <textarea
                  className="w-full min-h-[70px] rounded-xl border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder={tx('z. B. Klingeln bei Müller, 2. OG links …')}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <Button
                disabled={!orderDate || !orderedItems || !totalAmount}
                onClick={() => setStep(3)}
              >
                {tx('Weiter zu Schritt 3')}
              </Button>
              <Button variant="outline" onClick={() => setStep(1)}>
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

      {/* Step 3: Fahrer zuweisen */}
      {step === 3 && (
        selectedKundeId ? (
          <div className="space-y-6">
            {/* Kontext-Zusammenfassung */}
            <div className="rounded-2xl border bg-secondary/40 p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <IconUser size={16} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tx('Kunde')}</p>
                  <p className="text-sm font-medium truncate">{selectedKunde ? kundeLabel(selectedKunde) : '–'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 min-w-0">
                <IconCurrencyEuro size={16} className="text-muted-foreground shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{tx('Betrag')}</p>
                  <p className="text-sm font-medium">
                    {totalAmount
                      ? parseFloat(totalAmount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
                      : '–'}
                  </p>
                </div>
              </div>
            </div>

            <EntitySelectStep
              items={availableFahrer.map((f) => ({
                id: f.record_id,
                title: fahrerLabel(f),
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone ? tx`Zone: ${f.fields.delivery_zone}` : undefined,
                  f.fields.driver_phone,
                ].filter(Boolean).join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconTruck size={20} className="text-primary" />,
              }))}
              onSelect={(id) => {
                setSelectedFahrerId(id);
              }}
              searchPlaceholder={tx('Fahrer suchen …')}
              emptyText={tx('Keine verfügbaren Fahrer')}
            />

            {/* Ausgewählter Fahrer Chip */}
            {selectedFahrerId && selectedFahrer && (
              <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2">
                <IconCheck size={16} className="text-primary shrink-0" />
                <span className="text-sm font-medium">{fahrerLabel(selectedFahrer)}</span>
                <StatusBadge
                  statusKey={selectedFahrer.fields.driver_status?.key}
                  label={selectedFahrer.fields.driver_status?.label}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-auto h-auto py-0.5 px-2 text-xs"
                  onClick={() => setSelectedFahrerId(null)}
                >
                  {tx('Abwählen')}
                </Button>
              </div>
            )}

            {submitError && (
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {submitError}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                disabled={submitting || !orderedItems || !totalAmount}
                onClick={handleSubmit}
              >
                {submitting ? tx('Bestellung wird angelegt …') : tx('Bestellung anlegen')}
              </Button>
              {!selectedFahrerId && (
                <Button
                  variant="outline"
                  disabled={submitting || !orderedItems || !totalAmount}
                  onClick={handleSubmit}
                >
                  {tx('Ohne Fahrer anlegen')}
                </Button>
              )}
              <Button variant="ghost" onClick={() => setStep(2)}>
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

      {/* Step 4: Erfolg */}
      {step === 4 && (
        createdBestellungId ? (
          <div className="space-y-6">
            <div className="rounded-2xl border bg-card p-6 text-center space-y-3">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <IconShoppingCart size={28} className="text-primary" />
              </div>
              <h2 className="text-xl font-bold">{tx('Bestellung angelegt!')}</h2>
              <p className="text-sm text-muted-foreground">{tx('Die Bestellung wurde erfolgreich erstellt.')}</p>
            </div>

            {/* Zusammenfassung */}
            <div className="rounded-2xl border bg-secondary/30 p-4 space-y-3">
              <p className="text-sm font-semibold">{tx('Zusammenfassung')}</p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4 text-sm">
                <div>
                  <dt className="text-muted-foreground">{tx('Kunde')}</dt>
                  <dd className="font-medium">{selectedKunde ? kundeLabel(selectedKunde) : '–'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{tx('Bestelldatum')}</dt>
                  <dd className="font-medium">{orderDate.replace('T', ' ')}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-muted-foreground">{tx('Bestellte Artikel')}</dt>
                  <dd className="font-medium whitespace-pre-wrap">{orderedItems}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{tx('Gesamtbetrag')}</dt>
                  <dd className="font-medium">
                    {totalAmount
                      ? parseFloat(totalAmount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
                      : '–'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{tx('Zahlung')}</dt>
                  <dd className="font-medium">
                    {PAYMENT_OPTIONS.find((o) => o.key === paymentMethodKey)?.label ?? paymentMethodKey}
                  </dd>
                </div>
                {selectedFahrer && (
                  <div>
                    <dt className="text-muted-foreground">{tx('Fahrer')}</dt>
                    <dd className="font-medium">{fahrerLabel(selectedFahrer)}</dd>
                  </div>
                )}
                {deliveryCity && (
                  <div>
                    <dt className="text-muted-foreground">{tx('Lieferort')}</dt>
                    <dd className="font-medium">
                      {[deliveryStreet, deliveryHouseNumber, deliveryPostalCode, deliveryCity]
                        .filter(Boolean)
                        .join(' ')}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button onClick={handleReset}>
                {tx('Neue Bestellung anlegen')}
              </Button>
              <a href="#/">
                <Button variant="outline">{tx('Zurück zum Dashboard')}</Button>
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
