/**
 * Bestellung zuweisen — 3-Schritt-Wizard.
 * Steps: 1) Bestellung auswählen (filter: order_status neu|in_bearbeitung|bereit_zur_lieferung)
 *        → 2) Fahrer zuweisen (filter: driver_status verfuegbar)
 *        → 3) Status setzen & speichern (updateBestellverwaltungEntry mit fahrer + order_status + delivery_notes).
 * Reads: bestellverwaltung, fahrerverwaltung. Writes: bestellverwaltung (updateBestellverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { makeT } from '@/i18n';
import { LOOKUP_OPTIONS, APP_IDS } from '@/types/app';
import type { Bestellverwaltung, Fahrerverwaltung } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { useDashboardData } from '@/hooks/useDashboardData';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  IconShoppingCart,
  IconUser,
  IconCheck,
  IconTruck,
  IconAlertCircle,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Bestellung zuweisen', /* i18n-exempt */
    subtitle: 'Offene Bestellung einem verfügbaren Fahrer zuweisen',
    step1: 'Bestellung',
    step2: 'Fahrer',
    step3: 'Bestätigen',
    step1_heading: 'Bestellung auswählen',
    step1_sub: 'Nur offene, in Bearbeitung oder lieferbereite Bestellungen',
    step2_heading: 'Fahrer auswählen',
    step2_sub: 'Nur verfügbare Fahrer werden angezeigt',
    step2_back: 'Zurück zur Bestellung',
    step3_heading: 'Status & Notizen',
    step3_back: 'Zurück zur Fahrerwahl',
    step3_order_label: 'Bestellung',
    step3_driver_label: 'Fahrer',
    step3_status_label: 'Bestellstatus',
    step3_notes_label: 'Liefernotiz (optional)',
    step3_notes_placeholder: 'z.B. Klingeln bei Ankunft, Code 1234 …',
    step3_confirm: 'Zuweisen & speichern',
    step3_saving: 'Wird gespeichert…',
    success_title: 'Bestellung erfolgreich zugewiesen!',
    success_sub: 'Der Fahrer ist informiert und der Status wurde aktualisiert.',
    success_new: 'Weitere Bestellung zuweisen',
    success_home: 'Zurück zum Dashboard',
    no_orders: 'Keine offenen Bestellungen vorhanden',
    no_drivers: 'Keine verfügbaren Fahrer',
    missing_step: 'Dieser Schritt benötigt eine Auswahl aus einem vorherigen Schritt.',
    restart: 'Neu starten',
    amount: 'Betrag',
    city: 'Stadt',
    items: 'Artikel',
    zone: 'Zone',
    vehicle: 'Fahrzeug',
    error_save: 'Speichern fehlgeschlagen. Bitte erneut versuchen.',
  },
  en: {
    title: 'Assign Order', /* i18n-exempt */
    subtitle: 'Assign an open order to an available driver',
    step1: 'Order',
    step2: 'Driver',
    step3: 'Confirm',
    step1_heading: 'Select order',
    step1_sub: 'Only open, in-progress or ready-to-deliver orders',
    step2_heading: 'Select driver',
    step2_sub: 'Only available drivers are shown',
    step2_back: 'Back to order',
    step3_heading: 'Status & notes',
    step3_back: 'Back to driver selection',
    step3_order_label: 'Order',
    step3_driver_label: 'Driver',
    step3_status_label: 'Order status',
    step3_notes_label: 'Delivery note (optional)',
    step3_notes_placeholder: 'e.g. ring bell on arrival, code 1234 …',
    step3_confirm: 'Assign & save',
    step3_saving: 'Saving…',
    success_title: 'Order successfully assigned!',
    success_sub: 'The driver is informed and the status has been updated.',
    success_new: 'Assign another order',
    success_home: 'Back to dashboard',
    no_orders: 'No open orders available',
    no_drivers: 'No available drivers',
    missing_step: 'This step requires a selection from a previous step.',
    restart: 'Restart',
    amount: 'Amount',
    city: 'City',
    items: 'Items',
    zone: 'Zone',
    vehicle: 'Vehicle',
    error_save: 'Save failed. Please try again.',
  },
  cs: {
    title: 'Přiřadit objednávku', /* i18n-exempt */
    subtitle: 'Přiřadit otevřenou objednávku dostupnému řidiči',
    step1: 'Objednávka',
    step2: 'Řidič',
    step3: 'Potvrdit',
    step1_heading: 'Vybrat objednávku',
    step1_sub: 'Pouze otevřené, zpracovávané nebo připravené objednávky',
    step2_heading: 'Vybrat řidiče',
    step2_sub: 'Zobrazují se pouze dostupní řidiči',
    step2_back: 'Zpět na objednávku',
    step3_heading: 'Stav & poznámky',
    step3_back: 'Zpět na výběr řidiče',
    step3_order_label: 'Objednávka',
    step3_driver_label: 'Řidič',
    step3_status_label: 'Stav objednávky',
    step3_notes_label: 'Poznámka k doručení (volitelné)',
    step3_notes_placeholder: 'např. zazvonit při příjezdu, kód 1234 …',
    step3_confirm: 'Přiřadit & uložit',
    step3_saving: 'Ukládání…',
    success_title: 'Objednávka úspěšně přiřazena!',
    success_sub: 'Řidič je informován a stav byl aktualizován.',
    success_new: 'Přiřadit další objednávku',
    success_home: 'Zpět na dashboard',
    no_orders: 'Žádné otevřené objednávky',
    no_drivers: 'Žádní dostupní řidiči',
    missing_step: 'Tento krok vyžaduje výběr z předchozího kroku.',
    restart: 'Začít znovu',
    amount: 'Částka',
    city: 'Město',
    items: 'Položky',
    zone: 'Zóna',
    vehicle: 'Vozidlo',
    error_save: 'Uložení selhalo. Zkuste to znovu.',
  },
});

const ELIGIBLE_ORDER_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung']);
const ORDER_STATUS_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status'] ?? [];

export default function BestellungZuweisenPage() {
  const [searchParams] = useSearchParams();
  const { bestellverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const initialStep = (() => {
    const s = parseInt(searchParams.get('step') ?? '', 10);
    return s >= 1 && s <= 3 ? s : 1;
  })();

  const [step, setStep] = useState(initialStep);
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(() => searchParams.get('orderId'));
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [orderStatusKey, setOrderStatusKey] = useState('unterwegs');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  // If orderId deep-link is provided and data is loaded, auto-jump to step 2
  useEffect(() => {
    if (selectedBestellungId && step === 1 && !loading) {
      const found = bestellverwaltung.find(b => b.record_id === selectedBestellungId);
      if (found) setStep(2);
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const eligibleOrders = bestellverwaltung.filter(
    (b: Bestellverwaltung) => b.fields.order_status && ELIGIBLE_ORDER_STATUSES.has(b.fields.order_status.key)
  );

  const availableDrivers = fahrerverwaltung.filter(
    (f: Fahrerverwaltung) => f.fields.driver_status?.key === 'verfuegbar'
  );

  const selectedBestellung = bestellverwaltung.find(b => b.record_id === selectedBestellungId) ?? null;
  const selectedFahrer = fahrerverwaltung.find(f => f.record_id === selectedFahrerId) ?? null;

  function handleSelectOrder(id: string) {
    setSelectedBestellungId(id);
    setStep(2);
  }

  function handleSelectDriver(id: string) {
    setSelectedFahrerId(id);
    setStep(3);
  }

  async function handleSave() {
    if (!selectedBestellungId || !selectedFahrerId) return;
    setSaving(true);
    setSaveError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellungId, {
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId),
        order_status: orderStatusKey,
        delivery_notes: deliveryNotes || undefined,
      });
      await fetchAll();
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : tt('error_save'));
    } finally {
      setSaving(false);
    }
  }

  function handleReset() {
    setSelectedBestellungId(null);
    setSelectedFahrerId(null);
    setOrderStatusKey('unterwegs');
    setDeliveryNotes('');
    setSaveError(null);
    setSaved(false);
    setStep(1);
  }

  function formatAmount(amount?: number) {
    if (amount == null) return '–';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  }

  if (saved) {
    return (
      <IntentWizardShell
        title={tt('title')}
        subtitle={tt('subtitle')}
        steps={[{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]}
        currentStep={3}
        onStepChange={setStep}
      >
        <div className="flex flex-col items-center justify-center py-16 gap-5 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <IconCheck size={32} className="text-green-600" stroke={2.5} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{tt('success_title')}</h2>
            <p className="text-sm text-muted-foreground mt-1">{tt('success_sub')}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
            <Button className="flex-1" onClick={handleReset}>
              {tt('success_new')}
            </Button>
            <Button variant="outline" className="flex-1" asChild>
              <a href="#/">{tt('success_home')}</a>
            </Button>
          </div>
        </div>
      </IntentWizardShell>
    );
  }

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[{ label: tt('step1') }, { label: tt('step2') }, { label: tt('step3') }]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* Step 1: Bestellung auswählen */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">{tt('step1_heading')}</h2>
            <p className="text-sm text-muted-foreground">{tt('step1_sub')}</p>
          </div>
          <EntitySelectStep
            items={eligibleOrders.map(b => ({
              id: b.record_id,
              title: b.fields.ordered_items
                ? (b.fields.ordered_items.length > 50
                    ? b.fields.ordered_items.slice(0, 50) + '…'
                    : b.fields.ordered_items)
                : `#${b.record_id.slice(-6)}`,
              subtitle: [
                b.fields.delivery_city,
                b.fields.order_date ? b.fields.order_date.slice(0, 10) : undefined,
              ]
                .filter(Boolean)
                .join(' · '),
              status: b.fields.order_status
                ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
                : undefined,
              stats: [
                { label: tt('amount'), value: formatAmount(b.fields.total_amount) },
                ...(b.fields.delivery_city ? [{ label: tt('city'), value: b.fields.delivery_city }] : []),
              ],
              icon: <IconShoppingCart size={20} className="text-primary" />,
            }))}
            onSelect={handleSelectOrder}
            emptyText={tt('no_orders')}
            emptyIcon={<IconShoppingCart size={32} />}
          />
        </div>
      )}

      {/* Step 2: Fahrer auswählen */}
      {step === 2 && (
        selectedBestellung ? (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{tt('step2_heading')}</h2>
              <p className="text-sm text-muted-foreground">{tt('step2_sub')}</p>
            </div>

            {/* Context: selected order */}
            <div className="rounded-xl border bg-secondary/40 p-3 flex items-start gap-3">
              <IconShoppingCart size={18} className="text-muted-foreground mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs text-muted-foreground">{tt('step3_order_label')}</p>
                <p className="text-sm font-medium truncate">
                  {selectedBestellung.fields.ordered_items
                    ? selectedBestellung.fields.ordered_items.slice(0, 60)
                    : `#${selectedBestellung.record_id.slice(-6)}`}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  {selectedBestellung.fields.order_status && (
                    <StatusBadge
                      statusKey={selectedBestellung.fields.order_status.key}
                      label={selectedBestellung.fields.order_status.label}
                    />
                  )}
                  {selectedBestellung.fields.delivery_city && (
                    <span className="text-xs text-muted-foreground">{selectedBestellung.fields.delivery_city}</span>
                  )}
                </div>
              </div>
            </div>

            <EntitySelectStep
              items={availableDrivers.map(f => ({
                id: f.record_id,
                title: [f.fields.driver_first_name, f.fields.driver_last_name].filter(Boolean).join(' ') || f.record_id.slice(-6),
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone,
                ]
                  .filter(Boolean)
                  .join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                stats: [
                  ...(f.fields.vehicle_type ? [{ label: tt('vehicle'), value: f.fields.vehicle_type.label }] : []),
                  ...(f.fields.delivery_zone ? [{ label: tt('zone'), value: f.fields.delivery_zone }] : []),
                ],
                icon: <IconUser size={20} className="text-primary" />,
              }))}
              onSelect={handleSelectDriver}
              emptyText={tt('no_drivers')}
              emptyIcon={<IconTruck size={32} />}
            />

            <Button variant="outline" className="w-full sm:w-auto" onClick={() => setStep(1)}>
              {tt('step2_back')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('missing_step')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* Step 3: Status setzen & speichern */}
      {step === 3 && (
        selectedBestellung && selectedFahrer ? (
          <div className="space-y-5">
            <div>
              <h2 className="text-lg font-semibold">{tt('step3_heading')}</h2>
            </div>

            {/* Live summary */}
            <div className="rounded-xl border bg-secondary/40 p-4 space-y-3">
              <div className="flex items-start gap-3">
                <IconShoppingCart size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">{tt('step3_order_label')}</p>
                  <p className="text-sm font-medium truncate">
                    {selectedBestellung.fields.ordered_items
                      ? selectedBestellung.fields.ordered_items.slice(0, 70)
                      : `#${selectedBestellung.record_id.slice(-6)}`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {formatAmount(selectedBestellung.fields.total_amount)}
                    {selectedBestellung.fields.delivery_city && ` · ${selectedBestellung.fields.delivery_city}`}
                  </p>
                </div>
              </div>
              <div className="border-t" />
              <div className="flex items-start gap-3">
                <IconUser size={18} className="text-muted-foreground mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">{tt('step3_driver_label')}</p>
                  <p className="text-sm font-medium truncate">
                    {[selectedFahrer.fields.driver_first_name, selectedFahrer.fields.driver_last_name]
                      .filter(Boolean)
                      .join(' ') || selectedFahrer.record_id.slice(-6)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[selectedFahrer.fields.vehicle_type?.label, selectedFahrer.fields.delivery_zone]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
              </div>
            </div>

            {/* Status-Dropdown */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{tt('step3_status_label')}</label>
              <Select value={orderStatusKey} onValueChange={setOrderStatusKey}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORDER_STATUS_OPTIONS.map(opt => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Delivery notes */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{tt('step3_notes_label')}</label>
              <Textarea
                value={deliveryNotes}
                onChange={e => setDeliveryNotes(e.target.value)}
                placeholder={tt('step3_notes_placeholder')}
                rows={3}
                className="resize-none"
              />
            </div>

            {saveError && (
              <div className="flex items-center gap-2 rounded-lg bg-destructive/10 text-destructive text-sm p-3">
                <IconAlertCircle size={16} className="shrink-0" />
                <span>{saveError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                className="flex-1 sm:flex-none sm:min-w-[180px]"
                disabled={saving}
                onClick={handleSave}
              >
                {saving ? tt('step3_saving') : tt('step3_confirm')}
              </Button>
              <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setStep(2)} disabled={saving}>
                {tt('step3_back')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('missing_step')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
