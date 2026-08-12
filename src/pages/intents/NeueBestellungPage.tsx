/**
 * Neue Bestellung — 3-Schritt-Wizard.
 * Steps: 1) Kunde wählen (nur aktive) → 2) Bestelldetails eingeben → 3) Bestätigen & anlegen.
 * Reads: kundenverwaltung. Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep.
 */
import { useState } from 'react';
import { format } from 'date-fns';
import { IconShoppingCart, IconUser, IconMapPin, IconCheck, IconAlertCircle } from '@tabler/icons-react';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Kundenverwaltung } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { tx } from '@/i18n';

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

interface OrderDetails {
  ordered_items: string;
  total_amount: string;
  desired_delivery_time: string;
  order_date: string;
  paymentKey: string;
  delivery_street: string;
  delivery_house_number: string;
  delivery_postal_code: string;
  delivery_city: string;
  delivery_notes: string;
}

export default function NeueBestellungPage() {
  const { kundenverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedKunde, setSelectedKunde] = useState<Kundenverwaltung | null>(null);
  const [details, setDetails] = useState<OrderDetails>({
    ordered_items: '',
    total_amount: '',
    desired_delivery_time: '',
    order_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    paymentKey: 'none',
    delivery_street: '',
    delivery_house_number: '',
    delivery_postal_code: '',
    delivery_city: '',
    delivery_notes: '',
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);

  // Mini-form state for new Kunde creation
  const [showCreateKunde, setShowCreateKunde] = useState(false);
  const [newFirstName, setNewFirstName] = useState('');
  const [newLastName, setNewLastName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const activeKunden = kundenverwaltung.filter(
    (k) => k.fields.customer_status?.key === 'aktiv'
  );

  const handleSelectKunde = (id: string) => {
    const k = kundenverwaltung.find((k) => k.record_id === id) ?? null;
    setSelectedKunde(k);
    setStep(2);
  };

  const handleCreateKunde = async () => {
    if (!newFirstName || !newLastName) return;
    const created = await LivingAppsService.createKundenverwaltungEntry({
      first_name: newFirstName,
      last_name: newLastName,
      email: newEmail || undefined,
      customer_status: 'aktiv',
    });
    await fetchAll();
    setShowCreateKunde(false);
    setNewFirstName('');
    setNewLastName('');
    setNewEmail('');
    handleSelectKunde(created.record_id);
  };

  const handleSave = async () => {
    if (!selectedKunde) return;
    if (createdId) return; // idempotency guard — already saved

    setSaving(true);
    setSaveError(null);
    try {
      const payload: Parameters<typeof LivingAppsService.createBestellverwaltungEntry>[0] = {
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id),
        order_status: 'neu',
        order_date: details.order_date,
        ordered_items: details.ordered_items,
        total_amount: details.total_amount ? Number(details.total_amount) : undefined,
      };
      if (details.paymentKey && details.paymentKey !== 'none') {
        payload.payment_method = details.paymentKey;
      }
      if (details.desired_delivery_time) {
        payload.desired_delivery_time = details.desired_delivery_time;
      }
      if (details.delivery_street) payload.delivery_street = details.delivery_street;
      if (details.delivery_house_number) payload.delivery_house_number = details.delivery_house_number;
      if (details.delivery_postal_code) payload.delivery_postal_code = details.delivery_postal_code;
      if (details.delivery_city) payload.delivery_city = details.delivery_city;
      if (details.delivery_notes) payload.delivery_notes = details.delivery_notes;

      const result = await LivingAppsService.createBestellverwaltungEntry(payload);
      setCreatedId(result.record_id);
      setStep(3);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : tx('Fehler beim Speichern'));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedKunde(null);
    setCreatedId(null);
    setSaveError(null);
    setDetails({
      ordered_items: '',
      total_amount: '',
      desired_delivery_time: '',
      order_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      paymentKey: 'none',
      delivery_street: '',
      delivery_house_number: '',
      delivery_postal_code: '',
      delivery_city: '',
      delivery_notes: '',
    });
  };

  const detailsValid = details.ordered_items.trim() !== '' && details.total_amount !== '' && details.order_date !== '';

  return (
    <IntentWizardShell
      title={tx('Neue Bestellung')}
      subtitle={tx('In 3 Schritten zur neuen Bestellung')}
      steps={[
        { label: tx('Kunde') },
        { label: tx('Details') },
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
          items={activeKunden.map((k) => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.city].filter(Boolean).join(' · '),
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={handleSelectKunde}
          createLabel={tx('Neuen Kunden anlegen')}
          onCreateNew={() => setShowCreateKunde(true)}
          searchPlaceholder={tx('Kunden suchen …')}
          emptyText={tx('Keine aktiven Kunden gefunden')}
          createDialog={
            showCreateKunde ? (
              <div className="rounded-2xl border p-4 space-y-3 bg-card">
                <p className="text-sm font-medium text-foreground">{tx('Neuen Kunden anlegen')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    value={newFirstName}
                    onChange={(e) => setNewFirstName(e.target.value)}
                    placeholder={tx('Vorname')}
                  />
                  <Input
                    value={newLastName}
                    onChange={(e) => setNewLastName(e.target.value)}
                    placeholder={tx('Nachname')}
                  />
                </div>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder={tx('E-Mail (optional)')}
                />
                <div className="flex gap-2">
                  <Button
                    disabled={!newFirstName || !newLastName}
                    onClick={handleCreateKunde}
                  >
                    {tx('Anlegen & auswählen')}
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

      {/* Step 2: Bestelldetails */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-6">
            {/* Ausgewählter Kunde */}
            <div className="rounded-2xl border bg-card p-4 flex items-center gap-3">
              <IconUser size={20} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
                </p>
                {selectedKunde.fields.email && (
                  <p className="text-xs text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                )}
              </div>
              <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => setStep(1)}>
                {tx('Ändern')}
              </Button>
            </div>

            {/* Pflichtfelder */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{tx('Bestellinhalt')}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{tx('Bestellte Artikel')} *</label>
                  <textarea
                    className="w-full min-h-[80px] rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                    value={details.ordered_items}
                    onChange={(e) => setDetails((d) => ({ ...d, ordered_items: e.target.value }))}
                    placeholder={tx('z. B. 2x Pizza Margherita, 1x Cola')}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{tx('Gesamtbetrag (€)')} *</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={details.total_amount}
                    onChange={(e) => setDetails((d) => ({ ...d, total_amount: e.target.value }))}
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{tx('Bestelldatum & -uhrzeit')} *</label>
                  <Input
                    type="datetime-local"
                    value={details.order_date}
                    onChange={(e) => setDetails((d) => ({ ...d, order_date: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            {/* Optionale Felder */}
            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{tx('Lieferung & Zahlung')}</h3>
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{tx('Wunschlieferzeit')}</label>
                  <Input
                    type="datetime-local"
                    value={details.desired_delivery_time}
                    onChange={(e) => setDetails((d) => ({ ...d, desired_delivery_time: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{tx('Zahlungsmethode')}</label>
                  <Select
                    value={details.paymentKey}
                    onValueChange={(v) => setDetails((d) => ({ ...d, paymentKey: v }))}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder={tx('Zahlungsmethode wählen')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{tx('Keine Angabe')}</SelectItem>
                      {PAYMENT_OPTIONS.map((o) => (
                        <SelectItem key={o.key} value={o.key}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="text-sm font-semibold text-foreground">{tx('Lieferadresse')}</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">{tx('Straße')}</label>
                  <Input
                    value={details.delivery_street}
                    onChange={(e) => setDetails((d) => ({ ...d, delivery_street: e.target.value }))}
                    placeholder={tx('Musterstraße')}
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{tx('Hausnr.')}</label>
                  <Input
                    value={details.delivery_house_number}
                    onChange={(e) => setDetails((d) => ({ ...d, delivery_house_number: e.target.value }))}
                    placeholder="42"
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">{tx('PLZ')}</label>
                  <Input
                    value={details.delivery_postal_code}
                    onChange={(e) => setDetails((d) => ({ ...d, delivery_postal_code: e.target.value }))}
                    placeholder="12345"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">{tx('Stadt')}</label>
                  <Input
                    value={details.delivery_city}
                    onChange={(e) => setDetails((d) => ({ ...d, delivery_city: e.target.value }))}
                    placeholder={tx('Musterstadt')}
                  />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">{tx('Lieferhinweise')}</label>
                <textarea
                  className="w-full min-h-[60px] rounded-md border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                  value={details.delivery_notes}
                  onChange={(e) => setDetails((d) => ({ ...d, delivery_notes: e.target.value }))}
                  placeholder={tx('z. B. Klingeln bei Müller')}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <Button
                disabled={!detailsValid}
                onClick={() => setStep(3)}
                className="w-full sm:w-auto"
              >
                {tx('Weiter zur Bestätigung')}
              </Button>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Zurück')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Bitte zuerst einen Kunden auswählen.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Zum ersten Schritt')}</Button>
          </div>
        )
      )}

      {/* Step 3: Bestätigung */}
      {step === 3 && (
        createdId ? (
          /* Erfolgszustand */
          <div className="text-center py-12 space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-primary/10 p-4">
                <IconCheck size={32} className="text-primary" />
              </div>
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-foreground">{tx('Bestellung angelegt!')}</h2>
              <p className="text-sm text-muted-foreground">
                {tx('Bestell-ID:')} <span className="font-mono text-xs">{createdId}</span>
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={handleReset}>
                <IconShoppingCart size={16} className="mr-2" />
                {tx('Neue Bestellung anlegen')}
              </Button>
              <Button variant="outline" asChild>
                <a href="#/">{tx('Zurück zum Dashboard')}</a>
              </Button>
            </div>
          </div>
        ) : selectedKunde && detailsValid ? (
          /* Zusammenfassung vor dem Speichern */
          <div className="space-y-6">
            <h2 className="text-base font-semibold text-foreground">{tx('Zusammenfassung')}</h2>

            {/* Kunde */}
            <div className="rounded-2xl border bg-card p-4 space-y-1">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{tx('Kunde')}</p>
              <p className="text-sm font-medium text-foreground">
                {[selectedKunde.fields.first_name, selectedKunde.fields.last_name].filter(Boolean).join(' ')}
              </p>
              {selectedKunde.fields.email && (
                <p className="text-xs text-muted-foreground">{selectedKunde.fields.email}</p>
              )}
            </div>

            {/* Bestelldetails */}
            <div className="rounded-2xl border bg-card p-4 space-y-3">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{tx('Bestelldetails')}</p>
              <div className="space-y-2">
                <div>
                  <p className="text-xs text-muted-foreground">{tx('Artikel')}</p>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{details.ordered_items}</p>
                </div>
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">{tx('Gesamtbetrag')}</p>
                  <p className="text-sm font-semibold text-foreground">
                    {Number(details.total_amount).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </p>
                </div>
                {details.desired_delivery_time && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{tx('Wunschlieferzeit')}</p>
                    <p className="text-sm text-foreground">{details.desired_delivery_time.replace('T', ' ')}</p>
                  </div>
                )}
                {details.paymentKey && details.paymentKey !== 'none' && (
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-muted-foreground">{tx('Zahlung')}</p>
                    <p className="text-sm text-foreground">
                      {PAYMENT_OPTIONS.find((o) => o.key === details.paymentKey)?.label ?? details.paymentKey}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Lieferadresse */}
            {(details.delivery_street || details.delivery_city) && (
              <div className="rounded-2xl border bg-card p-4 space-y-1">
                <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide flex items-center gap-1">
                  <IconMapPin size={12} />{tx('Lieferadresse')}
                </p>
                <p className="text-sm text-foreground">
                  {[
                    [details.delivery_street, details.delivery_house_number].filter(Boolean).join(' '),
                    [details.delivery_postal_code, details.delivery_city].filter(Boolean).join(' '),
                  ].filter(Boolean).join(', ')}
                </p>
                {details.delivery_notes && (
                  <p className="text-xs text-muted-foreground">{details.delivery_notes}</p>
                )}
              </div>
            )}

            {saveError && (
              <div className="rounded-2xl border border-destructive/50 bg-destructive/10 p-4 flex items-start gap-3">
                <IconAlertCircle size={18} className="text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{saveError}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Button
                disabled={saving}
                onClick={handleSave}
                className="w-full sm:w-auto"
              >
                {saving ? tx('Wird gespeichert …') : tx('Bestellung anlegen')}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)} disabled={saving}>
                {tx('Zurück')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Die vorherigen Schritte müssen ausgefüllt sein.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
