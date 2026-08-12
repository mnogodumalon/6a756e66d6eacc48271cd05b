/**
 * Bestellung zuweisen — 3-Schritt-Wizard.
 * Steps: 1) Bestellung wählen (nur Status neu|in_bearbeitung|bereit_zur_lieferung)
 *         → 2) Fahrer zuweisen (nur Status verfuegbar)
 *         → 3) Status & Abschluss (Status vorwärts setzen + delivery_notes).
 * Reads: bestellverwaltung (enriched), fahrerverwaltung, kundenverwaltung.
 * Writes: bestellverwaltung (updateBestellverwaltungEntry),
 *          fahrerverwaltung (updateFahrerverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichBestellverwaltung } from '@/lib/enrich';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import type { Fahrerverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  IconTruck,
  IconUser,
  IconPackage,
  IconCircleCheck,
  IconAlertCircle,
  IconPhone,
  IconMapPin,
} from '@tabler/icons-react';
import { tx } from '@/i18n';

const ELIGIBLE_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung']);

function forwardStatuses(currentKey: string): string[] {
  if (currentKey === 'neu') return ['in_bearbeitung', 'bereit_zur_lieferung'];
  if (currentKey === 'in_bearbeitung') return ['bereit_zur_lieferung', 'unterwegs'];
  if (currentKey === 'bereit_zur_lieferung') return ['unterwegs', 'geliefert'];
  return [];
}

function statusLabel(key: string): string {
  const map: Record<string, string> = {
    neu: 'Neu',
    in_bearbeitung: 'In Bearbeitung',
    bereit_zur_lieferung: 'Bereit zur Lieferung',
    unterwegs: 'Unterwegs',
    geliefert: 'Geliefert',
    storniert: 'Storniert',
  };
  return map[key] ?? key;
}

export default function BestellungZuweisenPage() {
  const { bestellverwaltung, fahrerverwaltung, kundenverwaltungMap, fahrerverwaltungMap, loading, error, fetchAll } =
    useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedOrder, setSelectedOrder] = useState<EnrichedBestellverwaltung | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<Fahrerverwaltung | null>(null);
  const [chosenStatus, setChosenStatus] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const enrichedOrders = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap]
  );

  const eligibleOrders = useMemo(
    () => enrichedOrders.filter(o => ELIGIBLE_STATUSES.has(o.fields.order_status?.key ?? '')),
    [enrichedOrders]
  );

  const availableDrivers = useMemo(
    () => fahrerverwaltung.filter(d => d.fields.driver_status?.key === 'verfuegbar'),
    [fahrerverwaltung]
  );

  const forwardOptions = selectedOrder
    ? forwardStatuses(selectedOrder.fields.order_status?.key ?? '')
    : [];

  function handleSelectOrder(id: string) {
    const order = eligibleOrders.find(o => o.record_id === id) ?? null;
    setSelectedOrder(order);
    setSelectedDriver(null);
    setChosenStatus('');
    setDeliveryNotes(order?.fields.delivery_notes ?? '');
    setStep(2);
  }

  function handleSelectDriver(id: string) {
    const driver = availableDrivers.find(d => d.record_id === id) ?? null;
    setSelectedDriver(driver);
    const opts = forwardStatuses(selectedOrder?.fields.order_status?.key ?? '');
    setChosenStatus(opts[0] ?? '');
    setStep(3);
  }

  async function handleSubmit() {
    if (!selectedOrder || !selectedDriver || !chosenStatus) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedOrder.record_id, {
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedDriver.record_id),
        order_status: chosenStatus,
        delivery_notes: deliveryNotes || undefined,
      });
      await LivingAppsService.updateFahrerverwaltungEntry(selectedDriver.record_id, {
        driver_status: 'im_einsatz',
      });
      await fetchAll();
      setSuccess(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : tx('Fehler beim Speichern'));
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setStep(1);
    setSelectedOrder(null);
    setSelectedDriver(null);
    setChosenStatus('');
    setDeliveryNotes('');
    setSubmitError(null);
    setSuccess(false);
  }

  if (success) {
    return (
      <div className="max-w-lg mx-auto py-16 px-4 text-center space-y-4">
        <div className="flex justify-center">
          <IconCircleCheck size={56} stroke={1.5} className="text-green-500" />
        </div>
        <h2 className="text-xl font-semibold">{tx('Bestellung erfolgreich zugewiesen')}</h2>
        <p className="text-muted-foreground text-sm">
          {tx('Bestellung')} <span className="font-medium">{selectedOrder?.record_id}</span>{' '}
          {tx('ist jetzt')} <span className="font-medium">{statusLabel(chosenStatus)}</span>.{' '}
          {tx('Fahrer')}{' '}
          <span className="font-medium">
            {selectedDriver?.fields.driver_first_name} {selectedDriver?.fields.driver_last_name}
          </span>{' '}
          {tx('ist im Einsatz.')}
        </p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
          <Button onClick={handleReset}>{tx('Neue Zuweisung')}</Button>
          <Button variant="outline" asChild>
            <a href="#/">{tx('Zurück zum Dashboard')}</a>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <IntentWizardShell
      title={tx('Bestellung zuweisen')}
      subtitle={tx('Fahrer zuweisen und Lieferstatus vorwärts setzen')}
      steps={[
        { label: tx('Bestellung') },
        { label: tx('Fahrer') },
        { label: tx('Abschluss') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Bestellung wählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleOrders.map(o => ({
            id: o.record_id,
            title: o.kundeName
              ? `${tx('Kunde')}: ${o.kundeName}`
              : `${tx('Bestellung')} ${o.record_id.slice(-6)}`,
            subtitle: [
              o.fields.delivery_city,
              o.fields.order_date
                ? `${tx('Datum')}: ${o.fields.order_date.slice(0, 10)}`
                : null,
              o.fields.total_amount != null
                ? `${o.fields.total_amount.toFixed(2)} €`
                : null,
            ]
              .filter(Boolean)
              .join(' · '),
            status: o.fields.order_status
              ? { key: o.fields.order_status.key, label: o.fields.order_status.label }
              : undefined,
            stats: [
              {
                label: tx('Artikel'),
                value: o.fields.ordered_items
                  ? o.fields.ordered_items.length > 40
                    ? `${o.fields.ordered_items.slice(0, 40)}…`
                    : o.fields.ordered_items
                  : '—',
              },
              {
                label: tx('Betrag'),
                value: o.fields.total_amount != null ? `${o.fields.total_amount.toFixed(2)} €` : '—',
              },
            ],
            icon: <IconPackage size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleSelectOrder}
          searchPlaceholder={tx('Bestellung suchen …')}
          emptyText={tx('Keine offenen Bestellungen vorhanden')}
          emptyIcon={<IconPackage size={32} stroke={1.5} className="text-muted-foreground" />}
        />
      )}

      {/* ── Step 2: Fahrer zuweisen ── */}
      {step === 2 && (
        selectedOrder ? (
          <div className="space-y-4">
            {/* selected order summary strip */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex flex-wrap gap-3 items-center min-w-0">
              <IconPackage size={18} stroke={1.5} className="text-primary shrink-0" />
              <div className="min-w-0">
                <p className="font-medium truncate">
                  {selectedOrder.kundeName || `${tx('Bestellung')} ${selectedOrder.record_id.slice(-6)}`}
                </p>
                <p className="text-xs text-muted-foreground truncate">{selectedOrder.fields.delivery_city}</p>
              </div>
              <StatusBadge
                statusKey={selectedOrder.fields.order_status?.key}
                label={selectedOrder.fields.order_status?.label}
                className="ml-auto shrink-0"
              />
            </div>

            {availableDrivers.length === 0 ? (
              <div className="rounded-2xl border p-8 text-center space-y-2">
                <IconAlertCircle size={32} stroke={1.5} className="text-amber-500 mx-auto" />
                <p className="font-medium">{tx('Kein verfügbarer Fahrer')}</p>
                <p className="text-sm text-muted-foreground">
                  {tx('Aktuell ist kein Fahrer mit Status „Verfügbar" vorhanden.')}
                </p>
                <Button variant="outline" onClick={() => setStep(1)} className="mt-2">
                  {tx('Zurück zur Bestellauswahl')}
                </Button>
              </div>
            ) : (
              <EntitySelectStep
                items={availableDrivers.map(d => ({
                  id: d.record_id,
                  title: `${d.fields.driver_first_name ?? ''} ${d.fields.driver_last_name ?? ''}`.trim(),
                  subtitle: [
                    d.fields.vehicle_type?.label,
                    d.fields.delivery_zone ? `${tx('Zone')}: ${d.fields.delivery_zone}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · '),
                  status: d.fields.driver_status
                    ? { key: d.fields.driver_status.key, label: d.fields.driver_status.label }
                    : undefined,
                  stats: [
                    {
                      label: tx('Telefon'),
                      value: d.fields.driver_phone ?? '—',
                    },
                    {
                      label: tx('Fahrzeug'),
                      value: d.fields.vehicle_type?.label ?? '—',
                    },
                  ],
                  icon: <IconUser size={20} className="text-primary" stroke={1.5} />,
                }))}
                onSelect={handleSelectDriver}
                searchPlaceholder={tx('Fahrer suchen …')}
                emptyText={tx('Kein passender Fahrer gefunden')}
                emptyIcon={<IconUser size={32} stroke={1.5} className="text-muted-foreground" />}
              />
            )}
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">
              {tx('Dieser Schritt braucht eine Bestellung aus Schritt 1.')}
            </p>
            <Button variant="outline" onClick={() => setStep(1)}>
              {tx('Neu starten')}
            </Button>
          </div>
        )
      )}

      {/* ── Step 3: Status & Abschluss ── */}
      {step === 3 && (
        selectedOrder && selectedDriver ? (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* order card */}
              <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <IconPackage size={16} stroke={1.5} />
                  {tx('Bestellung')}
                </div>
                <p className="font-semibold truncate">
                  {selectedOrder.kundeName || selectedOrder.record_id.slice(-6)}
                </p>
                {selectedOrder.fields.delivery_city && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                    <IconMapPin size={13} stroke={1.5} className="shrink-0" />
                    {selectedOrder.fields.delivery_city}
                  </p>
                )}
                {selectedOrder.fields.total_amount != null && (
                  <p className="text-sm font-medium">{selectedOrder.fields.total_amount.toFixed(2)} €</p>
                )}
                <StatusBadge
                  statusKey={selectedOrder.fields.order_status?.key}
                  label={selectedOrder.fields.order_status?.label}
                />
              </div>

              {/* driver card */}
              <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <IconTruck size={16} stroke={1.5} />
                  {tx('Fahrer')}
                </div>
                <p className="font-semibold truncate">
                  {selectedDriver.fields.driver_first_name} {selectedDriver.fields.driver_last_name}
                </p>
                {selectedDriver.fields.vehicle_type && (
                  <p className="text-sm text-muted-foreground">{selectedDriver.fields.vehicle_type.label}</p>
                )}
                {selectedDriver.fields.driver_phone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1">
                    <IconPhone size={13} stroke={1.5} className="shrink-0" />
                    {selectedDriver.fields.driver_phone}
                  </p>
                )}
                {selectedDriver.fields.delivery_zone && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1 truncate">
                    <IconMapPin size={13} stroke={1.5} className="shrink-0" />
                    {tx('Zone')}: {selectedDriver.fields.delivery_zone}
                  </p>
                )}
              </div>
            </div>

            {/* mini-form: new status + delivery notes */}
            <div className="rounded-2xl border p-4 space-y-4">
              <h3 className="font-medium text-sm">{tx('Neuen Status setzen')}</h3>

              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">{tx('Bestellstatus')}</label>
                <Select value={chosenStatus} onValueChange={setChosenStatus}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={tx('Status wählen …')} />
                  </SelectTrigger>
                  <SelectContent>
                    {forwardOptions.map(key => (
                      <SelectItem key={key} value={key}>
                        {statusLabel(key)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <label className="text-sm text-muted-foreground">
                  {tx('Lieferhinweise')} <span className="text-xs opacity-60">({tx('optional')})</span>
                </label>
                <Textarea
                  value={deliveryNotes}
                  onChange={e => setDeliveryNotes(e.target.value)}
                  placeholder={tx('z. B. Klingel 2. OG, bitte anrufen …')}
                  rows={3}
                  className="w-full"
                />
              </div>
            </div>

            {submitError && (
              <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 flex items-center gap-2 text-sm text-destructive">
                <IconAlertCircle size={16} stroke={1.5} className="shrink-0" />
                {submitError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleSubmit}
                disabled={submitting || !chosenStatus}
                className="flex-1"
              >
                <IconTruck size={16} stroke={1.5} className="mr-2" />
                {submitting ? tx('Wird gespeichert …') : tx('Zuweisen & Status setzen')}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                {tx('Zurück')}
              </Button>
            </div>
          </div>
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
