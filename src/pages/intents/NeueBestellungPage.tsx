/**
 * Neue Bestellung — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen (aktiv) → 2) Bestelldetails erfassen → 3) Fahrer zuweisen & speichern.
 * Reads: kundenverwaltung (customer_status=aktiv), fahrerverwaltung (driver_status=verfuegbar).
 * Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { tx } from '@/i18n';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboardData } from '@/hooks/useDashboardData';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Kundenverwaltung, Fahrerverwaltung } from '@/types/app';
import {
  IconUser,
  IconTruck,
  IconCheck,
  IconShoppingCart,
  IconAlertCircle,
} from '@tabler/icons-react';

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

export default function NeueBestellungPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  // Step state
  const [step, setStep] = useState(1);

  // Step 1 — Kunde
  const [selectedKundeId, setSelectedKundeId] = useState<string | null>(null);

  // Step 2 — Bestelldetails
  const [orderedItems, setOrderedItems] = useState('');
  const [totalAmount, setTotalAmount] = useState('');
  const [orderDate, setOrderDate] = useState(() => format(new Date(), "yyyy-MM-dd'T'HH:mm"));
  const [desiredDeliveryTime, setDesiredDeliveryTime] = useState('');
  const [deliveryStreet, setDeliveryStreet] = useState('');
  const [deliveryHouseNumber, setDeliveryHouseNumber] = useState('');
  const [deliveryPostalCode, setDeliveryPostalCode] = useState('');
  const [deliveryCity, setDeliveryCity] = useState('');
  const [paymentMethodKey, setPaymentMethodKey] = useState('none');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  // Step 3 — Fahrer & Speichern
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedOrderId, setSavedOrderId] = useState<string | null>(null);

  // Neue Kunden inline
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newKundeFirst, setNewKundeFirst] = useState('');
  const [newKundeLast, setNewKundeLast] = useState('');
  const [newKundeEmail, setNewKundeEmail] = useState('');
  const [newKundePhone, setNewKundePhone] = useState('');
  const [creatingKunde, setCreatingKunde] = useState(false);

  // Nur aktive Kunden
  const activeKunden = (kundenverwaltung as Kundenverwaltung[]).filter(
    (k) => k.fields.customer_status?.key === 'aktiv'
  );

  // Nur verfügbare Fahrer
  const availableFahrer = (fahrerverwaltung as Fahrerverwaltung[]).filter(
    (f) => f.fields.driver_status?.key === 'verfuegbar'
  );

  const selectedKunde = activeKunden.find((k) => k.record_id === selectedKundeId);

  const handleCreateKunde = async () => {
    if (!newKundeFirst || !newKundeLast) return;
    setCreatingKunde(true);
    try {
      const created = await LivingAppsService.createKundenverwaltungEntry({
        first_name: newKundeFirst,
        last_name: newKundeLast,
        email: newKundeEmail || undefined,
        phone: newKundePhone || undefined,
        customer_status: 'aktiv',
      });
      await fetchAll();
      setShowCreateKunde(false);
      setNewKundeFirst('');
      setNewKundeLast('');
      setNewKundeEmail('');
      setNewKundePhone('');
      setSelectedKundeId(created.record_id);
      setStep(2);
    } finally {
      setCreatingKunde(false);
    }
  };

  const step2Valid = orderedItems.trim() !== '' && totalAmount !== '' && orderDate !== '';

  const handleSave = async () => {
    if (!selectedKundeId || !step2Valid) return;
    if (savedOrderId) return; // Idempotenz — kein Doppelt-Anlegen

    setSaving(true);
    setSaveError(null);
    try {
      const created = await LivingAppsService.createBestellverwaltungEntry({
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKundeId),
        fahrer: selectedFahrerId
          ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId)
          : undefined,
        order_status: 'neu',
        ordered_items: orderedItems,
        total_amount: parseFloat(totalAmount),
        order_date: orderDate,
        desired_delivery_time: desiredDeliveryTime || undefined,
        delivery_street: deliveryStreet || undefined,
        delivery_house_number: deliveryHouseNumber || undefined,
        delivery_postal_code: deliveryPostalCode || undefined,
        delivery_city: deliveryCity || undefined,
        payment_method: paymentMethodKey !== 'none' ? paymentMethodKey : undefined,
        delivery_notes: deliveryNotes || undefined,
      });
      setSavedOrderId(created.record_id);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : tx('Unbekannter Fehler'));
    } finally {
      setSaving(false);
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
    setSavedOrderId(null);
    setSaveError(null);
  };

  return (
    <IntentWizardShell
      title={tx('Neue Bestellung')}
      subtitle={tx('Kunde wählen, Details erfassen, Fahrer zuweisen')}
      steps={[
        { label: tx('Kunde') },
        { label: tx('Details') },
        { label: tx('Fahrer & Speichern') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Schritt 1: Kunde wählen ─────────────────────────────────────── */}
      {step === 1 && (
        <EntitySelectStep
          items={activeKunden.map((k) => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.phone, k.fields.city].filter(Boolean).join(' · '),
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
          createLabel={tx('Neuen Kunden anlegen')}
          onCreateNew={() => setShowCreateKunde(true)}
          createDialog={
            showCreateKunde ? (
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <p className="text-sm font-medium text-foreground">{tx('Neuen Kunden anlegen')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    value={newKundeFirst}
                    onChange={(e) => setNewKundeFirst(e.target.value)}
                    placeholder={tx('Vorname')}
                  />
                  <Input
                    value={newKundeLast}
                    onChange={(e) => setNewKundeLast(e.target.value)}
                    placeholder={tx('Nachname')}
                  />
                  <Input
                    value={newKundeEmail}
                    onChange={(e) => setNewKundeEmail(e.target.value)}
                    placeholder={tx('E-Mail (optional)')}
                    type="email"
                  />
                  <Input
                    value={newKundePhone}
                    onChange={(e) => setNewKundePhone(e.target.value)}
                    placeholder={tx('Telefon (optional)')}
                    type="tel"
                  />
                </div>
                <div className="flex gap-2">
                  <Button
                    disabled={!newKundeFirst || !newKundeLast || creatingKunde}
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

      {/* ── Schritt 2: Bestelldetails ───────────────────────────────────── */}
      {step === 2 && (
        selectedKundeId ? (
          <div className="space-y-6">
            {/* Kontext-Chip */}
            <div className="flex items-center gap-2 rounded-xl bg-secondary px-4 py-2 w-fit">
              <IconUser size={16} className="text-muted-foreground" />
              <span className="text-sm text-foreground font-medium">
                {[selectedKunde?.fields.first_name, selectedKunde?.fields.last_name]
                  .filter(Boolean)
                  .join(' ')}
              </span>
              {selectedKunde?.fields.customer_status && (
                <StatusBadge
                  statusKey={selectedKunde.fields.customer_status.key}
                  label={selectedKunde.fields.customer_status.label}
                />
              )}
            </div>

            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  {tx('Bestellte Artikel')} <span className="text-destructive">*</span>
                </label>
                <Textarea
                  value={orderedItems}
                  onChange={(e) => setOrderedItems(e.target.value)}
                  placeholder={tx('z. B. 2x Pizza Margherita, 1x Cola …')}
                  rows={4}
                  className="w-full"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Gesamtbetrag (€)')} <span className="text-destructive">*</span>
                  </label>
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
                  <label className="text-sm font-medium text-foreground">
                    {tx('Bestelldatum & Uhrzeit')} <span className="text-destructive">*</span>
                  </label>
                  <Input
                    type="datetime-local"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Gewünschte Lieferzeit')}
                  </label>
                  <Input
                    type="datetime-local"
                    value={desiredDeliveryTime}
                    onChange={(e) => setDesiredDeliveryTime(e.target.value)}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-sm font-medium text-foreground">
                    {tx('Zahlungsmethode')}
                  </label>
                  <Select value={paymentMethodKey} onValueChange={setPaymentMethodKey}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={tx('Bitte wählen …')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tx('Keine Angabe')}</SelectItem>
                      {PAYMENT_OPTIONS.map((o) => (
                        <SelectItem key={o.key} value={o.key}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Lieferadresse */}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">{tx('Lieferadresse')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <Input
                      value={deliveryStreet}
                      onChange={(e) => setDeliveryStreet(e.target.value)}
                      placeholder={tx('Straße')}
                    />
                  </div>
                  <Input
                    value={deliveryHouseNumber}
                    onChange={(e) => setDeliveryHouseNumber(e.target.value)}
                    placeholder={tx('Hausnummer')}
                  />
                  <Input
                    value={deliveryPostalCode}
                    onChange={(e) => setDeliveryPostalCode(e.target.value)}
                    placeholder={tx('PLZ')}
                  />
                  <div className="sm:col-span-2">
                    <Input
                      value={deliveryCity}
                      onChange={(e) => setDeliveryCity(e.target.value)}
                      placeholder={tx('Stadt')}
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">
                  {tx('Lieferhinweise')}
                </label>
                <Textarea
                  value={deliveryNotes}
                  onChange={(e) => setDeliveryNotes(e.target.value)}
                  placeholder={tx('z. B. 2. Etage, klingeln bei Müller …')}
                  rows={2}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Zurück')}
              </Button>
              <Button disabled={!step2Valid} onClick={() => setStep(3)} className="flex-1">
                {tx('Weiter zu Schritt 3')}
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

      {/* ── Schritt 3: Fahrer zuweisen & Speichern ─────────────────────── */}
      {step === 3 && (
        selectedKundeId && step2Valid ? (
          savedOrderId ? (
            /* Erfolg */
            <div className="flex flex-col items-center gap-6 py-10 text-center">
              <div className="rounded-full bg-primary/10 p-5">
                <IconCheck size={40} className="text-primary" />
              </div>
              <div className="space-y-1">
                <h2 className="text-lg font-semibold text-foreground">{tx('Bestellung angelegt!')}</h2>
                <p className="text-sm text-muted-foreground">
                  {tx('Die Bestellung wurde erfolgreich gespeichert.')}
                </p>
              </div>
              <div className="rounded-xl border bg-secondary p-4 w-full max-w-sm text-left space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{tx('Kunde')}</span>
                  <span className="font-medium truncate ml-2">
                    {[selectedKunde?.fields.first_name, selectedKunde?.fields.last_name]
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">{tx('Betrag')}</span>
                  <span className="font-medium">
                    {parseFloat(totalAmount).toLocaleString('de-DE', {
                      style: 'currency',
                      currency: 'EUR',
                    })}
                  </span>
                </div>
                {desiredDeliveryTime && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{tx('Lieferzeit')}</span>
                    <span className="font-medium">{desiredDeliveryTime.replace('T', ' ')}</span>
                  </div>
                )}
                {selectedFahrerId && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{tx('Fahrer')}</span>
                    <span className="font-medium truncate ml-2">
                      {(() => {
                        const f = availableFahrer.find((x) => x.record_id === selectedFahrerId);
                        return [f?.fields.driver_first_name, f?.fields.driver_last_name]
                          .filter(Boolean)
                          .join(' ');
                      })()}
                    </span>
                  </div>
                )}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
                <Button onClick={handleReset} className="flex-1">
                  {tx('Neue Bestellung anlegen')}
                </Button>
                <a href="#/" className="flex-1">
                  <Button variant="outline" className="w-full">
                    {tx('Zurück zum Dashboard')}
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Live-Zusammenfassung */}
              <div className="rounded-2xl border bg-secondary p-4 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {tx('Zusammenfassung')}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="flex items-center gap-2">
                    <IconUser size={16} className="text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium truncate">
                      {[selectedKunde?.fields.first_name, selectedKunde?.fields.last_name]
                        .filter(Boolean)
                        .join(' ')}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <IconShoppingCart size={16} className="text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">
                      {parseFloat(totalAmount || '0').toLocaleString('de-DE', {
                        style: 'currency',
                        currency: 'EUR',
                      })}
                    </span>
                  </div>
                  {desiredDeliveryTime && (
                    <div className="flex items-center gap-2">
                      <IconTruck size={16} className="text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">
                        {desiredDeliveryTime.replace('T', ' ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Fahrer-Auswahl */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-foreground">{tx('Fahrer zuweisen')}</p>
                  <span className="text-xs text-muted-foreground">{tx('optional')}</span>
                </div>

                {availableFahrer.length === 0 ? (
                  <div className="rounded-xl border bg-card p-6 text-center space-y-1">
                    <IconTruck size={24} className="text-muted-foreground mx-auto" />
                    <p className="text-sm text-muted-foreground">
                      {tx('Kein Fahrer verfügbar — Bestellung trotzdem anlegen?')}
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* "Kein Fahrer"-Karte */}
                    <button
                      type="button"
                      onClick={() => setSelectedFahrerId(null)}
                      className={`rounded-xl border p-3 text-left transition-colors ${
                        selectedFahrerId === null
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-card hover:bg-secondary'
                      }`}
                    >
                      <p className="text-sm font-medium text-foreground">{tx('Kein Fahrer')}</p>
                      <p className="text-xs text-muted-foreground">{tx('Später zuweisen')}</p>
                    </button>

                    {availableFahrer.map((f) => (
                      <button
                        key={f.record_id}
                        type="button"
                        onClick={() => setSelectedFahrerId(f.record_id)}
                        className={`rounded-xl border p-3 text-left transition-colors ${
                          selectedFahrerId === f.record_id
                            ? 'border-primary bg-primary/5'
                            : 'border-border bg-card hover:bg-secondary'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">
                              {[f.fields.driver_first_name, f.fields.driver_last_name]
                                .filter(Boolean)
                                .join(' ') || f.record_id}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {[
                                f.fields.vehicle_type?.label,
                                f.fields.delivery_zone
                                  ? tx`Zone: ${f.fields.delivery_zone}`
                                  : undefined,
                              ]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          </div>
                          {f.fields.driver_status && (
                            <StatusBadge
                              statusKey={f.fields.driver_status.key}
                              label={f.fields.driver_status.label}
                            />
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {saveError && (
                <div className="flex items-center gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  <IconAlertCircle size={16} className="shrink-0" />
                  <span>{saveError}</span>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setStep(2)}>
                  {tx('Zurück')}
                </Button>
                <Button
                  disabled={saving}
                  onClick={handleSave}
                  className="flex-1"
                >
                  {saving ? tx('Wird gespeichert …') : tx('Bestellung anlegen')}
                </Button>
              </div>
            </div>
          )
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}
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
