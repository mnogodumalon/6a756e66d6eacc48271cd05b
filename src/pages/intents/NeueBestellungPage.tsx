/**
 * Neue Bestellung — 3-Schritt-Wizard.
 * Steps: 1) Kunde auswählen (nur aktive Kunden) → 2) Bestelldetails eingeben →
 *        3) Fahrer zuweisen (optional, nur verfügbare Fahrer) & Bestellung anlegen.
 * Reads: kundenverwaltung, fahrerverwaltung.
 * Writes: bestellverwaltung (createBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState } from 'react';
import { format } from 'date-fns';
import {
  IconUser,
  IconTruck,
  IconCheck,
  IconShoppingCart,
  IconMapPin,
  IconCurrencyEuro,
} from '@tabler/icons-react';
import { makeT } from '@/i18n';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';

// ─── i18n ────────────────────────────────────────────────────────────────────

const tt = makeT({
  de: {
    title: 'Neue Bestellung', /* i18n-exempt */
    subtitle: 'Lieferbestellung in 3 Schritten anlegen', /* i18n-exempt */
    step1: 'Kunde',
    step2: 'Details',
    step3: 'Fahrer & Bestätigen',
    searchKunde: 'Kunden suchen …',
    emptyKunde: 'Keine aktiven Kunden gefunden',
    orderedItems: 'Bestellte Artikel',
    orderedItemsPlaceholder: 'Artikel beschreiben …',
    totalAmount: 'Gesamtbetrag (€)',
    orderDate: 'Bestelldatum',
    desiredDeliveryTime: 'Gewünschte Lieferzeit',
    deliveryStreet: 'Lieferstraße',
    deliveryHouseNumber: 'Hausnummer',
    deliveryPostalCode: 'Postleitzahl',
    deliveryCity: 'Stadt',
    paymentMethod: 'Zahlungsmethode',
    deliveryNotes: 'Lieferhinweise',
    noPaymentMethod: 'Keine Angabe',
    nextStep: 'Weiter zu Schritt 3',
    backStep: 'Zurück zu Schritt 2',
    searchFahrer: 'Fahrer suchen …',
    emptyFahrer: 'Keine verfügbaren Fahrer gefunden',
    withoutDriver: 'Ohne Fahrer weiter',
    createOrder: 'Bestellung anlegen',
    creating: 'Wird angelegt …',
    successTitle: 'Bestellung erfolgreich angelegt!',
    successSummary: 'Zusammenfassung',
    kunde: 'Kunde',
    fahrer: 'Fahrer',
    keinFahrer: 'Kein Fahrer zugewiesen',
    betrag: 'Betrag',
    newOrder: 'Neue Bestellung anlegen',
    backDashboard: 'Zurück zum Dashboard',
    stepMissingKunde: 'Dieser Schritt benötigt einen ausgewählten Kunden.',
    stepMissingDetails: 'Dieser Schritt benötigt ausgefüllte Bestelldetails.',
    restart: 'Neu starten',
    errorTitle: 'Fehler beim Anlegen',
    required: 'Bitte Pflichtfelder ausfüllen.',
    orderSummary: 'Bestellübersicht',
    selectedKunde: 'Ausgewählter Kunde',
    selectedFahrer: 'Ausgewählter Fahrer',
    optional: 'optional',
    zone: 'Zone',
    vehicle: 'Fahrzeug',
  },
  en: {
    title: 'New Order', /* i18n-exempt */
    subtitle: 'Create a delivery order in 3 steps', /* i18n-exempt */
    step1: 'Customer',
    step2: 'Details',
    step3: 'Driver & Confirm',
    searchKunde: 'Search customers …',
    emptyKunde: 'No active customers found',
    orderedItems: 'Ordered items',
    orderedItemsPlaceholder: 'Describe items …',
    totalAmount: 'Total amount (€)',
    orderDate: 'Order date',
    desiredDeliveryTime: 'Desired delivery time',
    deliveryStreet: 'Delivery street',
    deliveryHouseNumber: 'House number',
    deliveryPostalCode: 'Postal code',
    deliveryCity: 'City',
    paymentMethod: 'Payment method',
    deliveryNotes: 'Delivery notes',
    noPaymentMethod: 'Not specified',
    nextStep: 'Continue to step 3',
    backStep: 'Back to step 2',
    searchFahrer: 'Search drivers …',
    emptyFahrer: 'No available drivers found',
    withoutDriver: 'Continue without driver',
    createOrder: 'Create order',
    creating: 'Creating …',
    successTitle: 'Order successfully created!',
    successSummary: 'Summary',
    kunde: 'Customer',
    fahrer: 'Driver',
    keinFahrer: 'No driver assigned',
    betrag: 'Amount',
    newOrder: 'New order',
    backDashboard: 'Back to dashboard',
    stepMissingKunde: 'This step requires a selected customer.',
    stepMissingDetails: 'This step requires filled order details.',
    restart: 'Start over',
    errorTitle: 'Error creating order',
    required: 'Please fill in required fields.',
    orderSummary: 'Order summary',
    selectedKunde: 'Selected customer',
    selectedFahrer: 'Selected driver',
    optional: 'optional',
    zone: 'Zone',
    vehicle: 'Vehicle',
  },
});

// ─── Payment options ──────────────────────────────────────────────────────────

const PAYMENT_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['payment_method'] ?? [];

// ─── Form state type ──────────────────────────────────────────────────────────

interface OrderForm {
  ordered_items: string;
  total_amount: string;
  order_date: string;
  desired_delivery_time: string;
  delivery_street: string;
  delivery_house_number: string;
  delivery_postal_code: string;
  delivery_city: string;
  paymentKey: string; // sentinel-safe: 'none' = not set
  delivery_notes: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function NeueBestellungPage() {
  const { kundenverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedKunde, setSelectedKunde] = useState<Kundenverwaltung | null>(null);
  const [selectedFahrer, setSelectedFahrer] = useState<Fahrerverwaltung | null>(null);
  const [form, setForm] = useState<OrderForm>({
    ordered_items: '',
    total_amount: '',
    order_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
    desired_delivery_time: '',
    delivery_street: '',
    delivery_house_number: '',
    delivery_postal_code: '',
    delivery_city: '',
    paymentKey: 'none',
    delivery_notes: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [formError, setFormError] = useState(false);

  // ── Filtered data ──

  const activeKunden = (kundenverwaltung as Kundenverwaltung[]).filter(
    (k) => k.fields.customer_status?.key === 'aktiv',
  );

  const availableFahrer = (fahrerverwaltung as Fahrerverwaltung[]).filter(
    (f) => f.fields.driver_status?.key === 'verfuegbar',
  );

  // ── Helpers ──

  function patchForm(patch: Partial<OrderForm>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleReset() {
    setStep(1);
    setSelectedKunde(null);
    setSelectedFahrer(null);
    setCreatedId(null);
    setSubmitError(null);
    setFormError(false);
    setForm({
      ordered_items: '',
      total_amount: '',
      order_date: format(new Date(), "yyyy-MM-dd'T'HH:mm"),
      desired_delivery_time: '',
      delivery_street: '',
      delivery_house_number: '',
      delivery_postal_code: '',
      delivery_city: '',
      paymentKey: 'none',
      delivery_notes: '',
    });
  }

  // ── Submit ──

  async function handleSubmit() {
    if (!selectedKunde || !form.ordered_items || !form.total_amount || !form.order_date) {
      setFormError(true);
      return;
    }
    setFormError(false);
    setSubmitError(null);

    // Idempotency guard: if already created, don't duplicate
    if (createdId) {
      setStep(4);
      return;
    }

    setSubmitting(true);
    try {
      const result = await LivingAppsService.createBestellverwaltungEntry({
        kunde: createRecordUrl(APP_IDS.KUNDENVERWALTUNG, selectedKunde.record_id),
        fahrer: selectedFahrer
          ? createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrer.record_id)
          : undefined,
        ordered_items: form.ordered_items,
        total_amount: Number(form.total_amount),
        order_date: form.order_date,
        desired_delivery_time: form.desired_delivery_time || undefined,
        delivery_street: form.delivery_street || undefined,
        delivery_house_number: form.delivery_house_number || undefined,
        delivery_postal_code: form.delivery_postal_code || undefined,
        delivery_city: form.delivery_city || undefined,
        payment_method: form.paymentKey !== 'none' ? form.paymentKey : undefined,
        delivery_notes: form.delivery_notes || undefined,
        order_status: 'neu',
      });
      setCreatedId(result.record_id);
      await fetchAll();
      setStep(4);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
        { label: tt('successSummary') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Kunde auswählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={activeKunden.map((k) => ({
            id: k.record_id,
            title: [k.fields.first_name, k.fields.last_name].filter(Boolean).join(' ') || k.record_id,
            subtitle: [k.fields.email, k.fields.city].filter(Boolean).join(' · '),
            status: k.fields.customer_status
              ? { key: k.fields.customer_status.key, label: k.fields.customer_status.label }
              : undefined,
            stats: k.fields.phone ? [{ label: 'Tel.' /* i18n-exempt */, value: k.fields.phone }] : undefined,
            icon: <IconUser size={20} className="text-primary" />,
          }))}
          onSelect={(id) => {
            const found = activeKunden.find((k) => k.record_id === id) ?? null;
            setSelectedKunde(found);
            setStep(2);
          }}
          searchPlaceholder={tt('searchKunde')}
          emptyText={tt('emptyKunde')}
        />
      )}

      {/* ── Step 2: Bestelldetails ── */}
      {step === 2 && (
        selectedKunde ? (
          <div className="space-y-6">
            {/* Kunde summary */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex items-center gap-3">
              <IconUser size={18} className="text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name]
                    .filter(Boolean)
                    .join(' ')}
                </p>
                {selectedKunde.fields.email && (
                  <p className="text-sm text-muted-foreground truncate">{selectedKunde.fields.email}</p>
                )}
              </div>
            </div>

            {/* Form */}
            <div className="space-y-4">
              {/* ordered_items */}
              <div className="space-y-1.5">
                <Label htmlFor="ordered_items">
                  {tt('orderedItems')} <span className="text-destructive">*</span>
                </Label>
                <Textarea
                  id="ordered_items"
                  value={form.ordered_items}
                  onChange={(e) => patchForm({ ordered_items: e.target.value })}
                  placeholder={tt('orderedItemsPlaceholder')}
                  rows={3}
                  className="w-full"
                />
              </div>

              {/* total_amount + order_date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="total_amount">
                    {tt('totalAmount')} <span className="text-destructive">*</span>
                  </Label>
                  <div className="relative">
                    <IconCurrencyEuro size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="total_amount"
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.total_amount}
                      onChange={(e) => patchForm({ total_amount: e.target.value })}
                      className="pl-8 w-full"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="order_date">
                    {tt('orderDate')} <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="order_date"
                    type="datetime-local"
                    value={form.order_date}
                    onChange={(e) => patchForm({ order_date: e.target.value })}
                    className="w-full"
                  />
                </div>
              </div>

              {/* desired_delivery_time */}
              <div className="space-y-1.5">
                <Label htmlFor="desired_delivery_time">
                  {tt('desiredDeliveryTime')} <span className="text-muted-foreground text-xs">({tt('optional')})</span>
                </Label>
                <Input
                  id="desired_delivery_time"
                  type="datetime-local"
                  value={form.desired_delivery_time}
                  onChange={(e) => patchForm({ desired_delivery_time: e.target.value })}
                  className="w-full"
                />
              </div>

              {/* Delivery address */}
              <div className="rounded-2xl border p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
                  <IconMapPin size={16} />
                  <span>{tt('deliveryStreet')}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label htmlFor="delivery_street">{tt('deliveryStreet')}</Label>
                    <Input
                      id="delivery_street"
                      value={form.delivery_street}
                      onChange={(e) => patchForm({ delivery_street: e.target.value })}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="delivery_house_number">{tt('deliveryHouseNumber')}</Label>
                    <Input
                      id="delivery_house_number"
                      value={form.delivery_house_number}
                      onChange={(e) => patchForm({ delivery_house_number: e.target.value })}
                      className="w-full"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="delivery_postal_code">{tt('deliveryPostalCode')}</Label>
                    <Input
                      id="delivery_postal_code"
                      value={form.delivery_postal_code}
                      onChange={(e) => patchForm({ delivery_postal_code: e.target.value })}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="delivery_city">{tt('deliveryCity')}</Label>
                    <Input
                      id="delivery_city"
                      value={form.delivery_city}
                      onChange={(e) => patchForm({ delivery_city: e.target.value })}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              {/* payment_method */}
              <div className="space-y-1.5">
                <Label htmlFor="payment_method">{tt('paymentMethod')}</Label>
                <Select
                  value={form.paymentKey}
                  onValueChange={(v) => patchForm({ paymentKey: v })}
                >
                  <SelectTrigger id="payment_method" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{tt('noPaymentMethod')}</SelectItem>
                    {PAYMENT_OPTIONS.map((opt) => (
                      <SelectItem key={opt.key} value={opt.key}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* delivery_notes */}
              <div className="space-y-1.5">
                <Label htmlFor="delivery_notes">{tt('deliveryNotes')}</Label>
                <Textarea
                  id="delivery_notes"
                  value={form.delivery_notes}
                  onChange={(e) => patchForm({ delivery_notes: e.target.value })}
                  rows={2}
                  className="w-full"
                />
              </div>

              {formError && (
                <p className="text-sm text-destructive">{tt('required')}</p>
              )}

              <Button
                className="w-full"
                disabled={!form.ordered_items || !form.total_amount || !form.order_date}
                onClick={() => setStep(3)}
              >
                {tt('nextStep')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('stepMissingKunde')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Fahrer zuweisen & Bestellung erstellen ── */}
      {step === 3 && (
        selectedKunde && form.ordered_items ? (
          <div className="space-y-6">
            {/* Live summary card */}
            <div className="rounded-2xl border bg-secondary/40 p-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{tt('orderSummary')}</p>
              <div className="flex items-center gap-2">
                <IconUser size={16} className="text-muted-foreground shrink-0" />
                <span className="text-sm truncate">
                  {[selectedKunde.fields.first_name, selectedKunde.fields.last_name]
                    .filter(Boolean)
                    .join(' ')}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <IconCurrencyEuro size={16} className="text-muted-foreground shrink-0" />
                <span className="text-sm font-semibold">
                  {form.total_amount
                    ? `${Number(form.total_amount).toFixed(2)} €`
                    : '—'}
                </span>
              </div>
              {form.delivery_city && (
                <div className="flex items-center gap-2">
                  <IconMapPin size={16} className="text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">
                    {[form.delivery_street, form.delivery_house_number, form.delivery_postal_code, form.delivery_city]
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                </div>
              )}
              {selectedFahrer && (
                <div className="flex items-center gap-2">
                  <IconTruck size={16} className="text-muted-foreground shrink-0" />
                  <span className="text-sm truncate">
                    {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name]
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                </div>
              )}
            </div>

            {/* Fahrer selection */}
            <EntitySelectStep
              items={availableFahrer.map((f) => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || f.record_id,
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone ? `${tt('zone')}: ${f.fields.delivery_zone}` : undefined,
                ]
                  .filter(Boolean)
                  .join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconTruck size={20} className="text-primary" />,
              }))}
              onSelect={(id) => {
                const found = availableFahrer.find((f) => f.record_id === id) ?? null;
                setSelectedFahrer(found);
              }}
              searchPlaceholder={tt('searchFahrer')}
              emptyText={tt('emptyFahrer')}
            />

            {submitError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3">
                <p className="text-sm text-destructive font-medium">{tt('errorTitle')}</p>
                <p className="text-xs text-destructive/80 mt-1">{submitError}</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Button
                className="w-full"
                onClick={handleSubmit}
                disabled={submitting}
              >
                {submitting ? tt('creating') : tt('createOrder')}
              </Button>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSelectedFahrer(null);
                  handleSubmit();
                }}
                disabled={submitting || !!selectedFahrer}
              >
                {tt('withoutDriver')}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => setStep(2)}>
                {tt('backStep')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('stepMissingDetails')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: Erfolg ── */}
      {step === 4 && (
        createdId ? (
          <div className="flex flex-col items-center gap-6 py-8">
            <div className="rounded-full bg-primary/10 p-4">
              <IconCheck size={40} className="text-primary" stroke={1.5} />
            </div>
            <div className="text-center space-y-1">
              <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
              <p className="text-sm text-muted-foreground">{tt('successSummary')}</p>
            </div>

            {/* Summary card */}
            <div className="w-full max-w-md rounded-2xl border bg-card shadow-lg p-5 space-y-3">
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm text-muted-foreground">{tt('kunde')}</span>
                <span className="text-sm font-medium text-right">
                  {[selectedKunde?.fields.first_name, selectedKunde?.fields.last_name]
                    .filter(Boolean)
                    .join(' ')}
                </span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm text-muted-foreground">{tt('betrag')}</span>
                <span className="text-sm font-semibold text-right">
                  {form.total_amount ? `${Number(form.total_amount).toFixed(2)} €` : '—'}
                </span>
              </div>
              <div className="flex justify-between items-start gap-2">
                <span className="text-sm text-muted-foreground">{tt('fahrer')}</span>
                <span className="text-sm font-medium text-right">
                  {selectedFahrer
                    ? [selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name]
                        .filter(Boolean)
                        .join(' ')
                    : tt('keinFahrer')}
                </span>
              </div>
              <div className="flex justify-between items-start gap-2 pt-2 border-t">
                <span className="text-sm text-muted-foreground">Status {/* i18n-exempt */}</span>
                <StatusBadge statusKey="neu" label="Neu" /* i18n-exempt */ />
              </div>
              {(form.delivery_street || form.delivery_city) && (
                <div className="flex justify-between items-start gap-2">
                  <span className="text-sm text-muted-foreground shrink-0">
                    <IconShoppingCart size={14} className="inline mr-1" />
                    {tt('deliveryStreet')}
                  </span>
                  <span className="text-sm text-right">
                    {[form.delivery_street, form.delivery_house_number, form.delivery_postal_code, form.delivery_city]
                      .filter(Boolean)
                      .join(' ')}
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-col gap-3 w-full max-w-md">
              <Button className="w-full" onClick={handleReset}>
                {tt('newOrder')}
              </Button>
              <a href="#/" className="w-full">
                <Button variant="outline" className="w-full">{tt('backDashboard')}</Button>
              </a>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('stepMissingDetails')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
