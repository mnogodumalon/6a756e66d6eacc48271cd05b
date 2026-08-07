/**
 * Lieferung Dispatch — 3-Schritt-Wizard.
 * Steps: 1) Bestellung auswählen → 2) Fahrer auswählen → 3) Status wählen & zuweisen.
 * Reads: bestellverwaltung (filter: neu/in_bearbeitung/bereit_zur_lieferung),
 *        fahrerverwaltung (filter: verfuegbar), kundenverwaltung (für Namen).
 * Writes: bestellverwaltung (updateBestellverwaltungEntry — fahrer + order_status),
 *         fahrerverwaltung (updateFahrerverwaltungEntry — driver_status, nur wenn unterwegs).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */
import { useState, useMemo } from 'react';
import { makeT } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Fahrerverwaltung } from '@/types/app';
import type { EnrichedBestellverwaltung } from '@/types/enriched';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { enrichBestellverwaltung } from '@/lib/enrich';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  IconTruck,
  IconUser,
  IconCircleCheck,
  IconAlertCircle,
  IconPackage,
  IconMapPin,
  IconPhone,
  IconBike,
  IconCar,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Lieferung zuweisen', /* i18n-exempt */
    subtitle: 'Bestellung auswählen, Fahrer zuweisen und Status aktualisieren',
    step1: 'Bestellung',
    step2: 'Fahrer',
    step3: 'Zuweisen',
    done: 'Fertig',
    orderFrom: 'Bestellt am',
    items: 'Artikel',
    total: 'Gesamt',
    city: 'Stadt',
    customer: 'Kunde',
    availableDrivers: '{n} verfügbare Fahrer',
    noAvailableDrivers: 'Keine verfügbaren Fahrer',
    vehicle: 'Fahrzeug',
    zone: 'Zone',
    phone: 'Telefon',
    selectStatus: 'Zielstatus wählen',
    assignBtn: 'Fahrer zuweisen & Status setzen',
    assigning: 'Wird zugewiesen…',
    summaryOrder: 'Bestellung',
    summaryDriver: 'Fahrer',
    summaryNewStatus: 'Neuer Status',
    successTitle: 'Erfolgreich zugewiesen!',
    successDesc: 'Fahrer {driver} wurde der Bestellung zugewiesen.',
    newDispatch: 'Neue Zuweisung',
    backToDashboard: 'Zurück zum Dashboard',
    noOrders: 'Keine offenen Bestellungen',
    noOrdersDesc: 'Alle Bestellungen sind bereits unterwegs, geliefert oder storniert.',
    noDrivers: 'Keine verfügbaren Fahrer',
    noDriversDesc: 'Aktuell sind keine Fahrer mit Status "Verfügbar" eingetragen.',
    prerequisiteHint: 'Dieser Schritt braucht die Auswahl aus dem vorherigen Schritt.',
    restart: 'Neu starten',
    orderLabel: 'Bestellung vom {date}',
    statusInBearbeitung: 'In Bearbeitung',
    statusBereitZurLieferung: 'Bereit zur Lieferung',
    statusUnterwegs: 'Unterwegs',
  },
  en: {
    title: 'Assign Delivery', /* i18n-exempt */
    subtitle: 'Select order, assign driver and update status',
    step1: 'Order',
    step2: 'Driver',
    step3: 'Assign',
    done: 'Done',
    orderFrom: 'Ordered on',
    items: 'Items',
    total: 'Total',
    city: 'City',
    customer: 'Customer',
    availableDrivers: '{n} available drivers',
    noAvailableDrivers: 'No available drivers',
    vehicle: 'Vehicle',
    zone: 'Zone',
    phone: 'Phone',
    selectStatus: 'Choose target status',
    assignBtn: 'Assign driver & set status',
    assigning: 'Assigning…',
    summaryOrder: 'Order',
    summaryDriver: 'Driver',
    summaryNewStatus: 'New Status',
    successTitle: 'Successfully assigned!',
    successDesc: 'Driver {driver} has been assigned to the order.',
    newDispatch: 'New assignment',
    backToDashboard: 'Back to Dashboard',
    noOrders: 'No open orders',
    noOrdersDesc: 'All orders are already out for delivery, delivered, or cancelled.',
    noDrivers: 'No available drivers',
    noDriversDesc: 'No drivers are currently listed with status "Available".',
    prerequisiteHint: 'This step requires the selection from the previous step.',
    restart: 'Start over',
    orderLabel: 'Order from {date}',
    statusInBearbeitung: 'In Progress',
    statusBereitZurLieferung: 'Ready for Delivery',
    statusUnterwegs: 'Out for Delivery',
  },
  cs: {
    title: 'Přiřadit doručení', /* i18n-exempt */
    subtitle: 'Vyberte objednávku, přiřaďte řidiče a aktualizujte stav',
    step1: 'Objednávka',
    step2: 'Řidič',
    step3: 'Přiřadit',
    done: 'Hotovo',
    orderFrom: 'Objednáno',
    items: 'Položky',
    total: 'Celkem',
    city: 'Město',
    customer: 'Zákazník',
    availableDrivers: '{n} dostupných řidičů',
    noAvailableDrivers: 'Žádní dostupní řidiči',
    vehicle: 'Vozidlo',
    zone: 'Zóna',
    phone: 'Telefon',
    selectStatus: 'Vyberte cílový stav',
    assignBtn: 'Přiřadit řidiče a nastavit stav',
    assigning: 'Přiřazuji…',
    summaryOrder: 'Objednávka',
    summaryDriver: 'Řidič',
    summaryNewStatus: 'Nový stav',
    successTitle: 'Úspěšně přiřazeno!',
    successDesc: 'Řidič {driver} byl přiřazen k objednávce.',
    newDispatch: 'Nové přiřazení',
    backToDashboard: 'Zpět na dashboard',
    noOrders: 'Žádné otevřené objednávky',
    noOrdersDesc: 'Všechny objednávky jsou již na cestě, doručeny nebo stornovány.',
    noDrivers: 'Žádní dostupní řidiči',
    noDriversDesc: 'Aktuálně nejsou evidováni žádní řidiči se stavem „Dostupný".',
    prerequisiteHint: 'Tento krok vyžaduje výběr z předchozího kroku.',
    restart: 'Začít znovu',
    orderLabel: 'Objednávka z {date}',
    statusInBearbeitung: 'Zpracovává se',
    statusBereitZurLieferung: 'Připravena k doručení',
    statusUnterwegs: 'Na cestě',
  },
});

const ELIGIBLE_ORDER_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung']);

const TARGET_STATUS_OPTIONS = LOOKUP_OPTIONS['bestellverwaltung']?.['order_status']?.filter(
  (o) => ['in_bearbeitung', 'bereit_zur_lieferung', 'unterwegs'].includes(o.key)
) ?? [];

function vehicleIcon(key: string | undefined) {
  if (key === 'fahrrad' || key === 'e_bike') return <IconBike size={16} className="text-muted-foreground" />;
  return <IconCar size={16} className="text-muted-foreground" />;
}

export default function LieferungDispatchPage() {
  const { bestellverwaltung, fahrerverwaltung, kundenverwaltung, loading, error, fetchAll, kundenverwaltungMap, fahrerverwaltungMap } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedBestellung, setSelectedBestellung] = useState<EnrichedBestellverwaltung | null>(null);
  const [selectedFahrer, setSelectedFahrer] = useState<Fahrerverwaltung | null>(null);
  const [targetStatusKey, setTargetStatusKey] = useState<string>(TARGET_STATUS_OPTIONS[0]?.key ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const enrichedBestellungen = useMemo(
    () => enrichBestellverwaltung(bestellverwaltung, { fahrerverwaltungMap, kundenverwaltungMap }),
    [bestellverwaltung, fahrerverwaltungMap, kundenverwaltungMap]
  );

  const eligibleOrders = useMemo(
    () => enrichedBestellungen.filter((b) => {
      const key = b.fields.order_status?.key;
      return key ? ELIGIBLE_ORDER_STATUSES.has(key) : false;
    }),
    [enrichedBestellungen]
  );

  const availableDrivers = useMemo(
    () => fahrerverwaltung.filter((f) => f.fields.driver_status?.key === 'verfuegbar'),
    [fahrerverwaltung]
  );

  // suppress unused lint — kundenverwaltung is consumed via enrichment maps
  void kundenverwaltung;

  const handleAssign = async () => {
    if (!selectedBestellung || !selectedFahrer || !targetStatusKey) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellung.record_id, {
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrer.record_id),
        order_status: targetStatusKey,
      });
      if (targetStatusKey === 'unterwegs') {
        await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrer.record_id, {
          driver_status: 'im_einsatz',
        });
      }
      await fetchAll();
      setSuccess(true);
      setStep(4);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setSelectedBestellung(null);
    setSelectedFahrer(null);
    setTargetStatusKey(TARGET_STATUS_OPTIONS[0]?.key ?? '');
    setSubmitError(null);
    setSuccess(false);
    setStep(1);
  };

  const driverFullName = selectedFahrer
    ? `${selectedFahrer.fields.driver_first_name ?? ''} ${selectedFahrer.fields.driver_last_name ?? ''}`.trim()
    : '';

  return (
    <IntentWizardShell
      title={tt('title')}
      subtitle={tt('subtitle')}
      steps={[
        { label: tt('step1') },
        { label: tt('step2') },
        { label: tt('step3') },
        { label: tt('done') },
      ]}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── Step 1: Bestellung auswählen ── */}
      {step === 1 && (
        <EntitySelectStep
          items={eligibleOrders.map((b) => ({
            id: b.record_id,
            title: b.kundeName
              ? `${tt('customer')}: ${b.kundeName}`
              : `${tt('orderFrom')} ${b.fields.order_date ? b.fields.order_date.slice(0, 10) : '—'}`,
            subtitle: [
              b.fields.delivery_city ? `${tt('city')}: ${b.fields.delivery_city}` : null,
              b.fields.ordered_items ? `${tt('items')}: ${b.fields.ordered_items.slice(0, 60)}${b.fields.ordered_items.length > 60 ? '…' : ''}` : null,
              b.fields.total_amount != null ? `${tt('total')}: ${b.fields.total_amount.toFixed(2)} €` : null,
            ]
              .filter(Boolean)
              .join(' · '),
            status: b.fields.order_status
              ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
              : undefined,
            icon: <IconPackage size={20} className="text-primary" />,
          }))}
          onSelect={(id) => {
            const found = eligibleOrders.find((b) => b.record_id === id) ?? null;
            setSelectedBestellung(found);
            setStep(2);
          }}
          emptyText={tt('noOrders')}
          emptyIcon={<IconPackage size={32} className="text-muted-foreground" />}
        />
      )}

      {/* ── Step 2: Fahrer auswählen ── */}
      {step === 2 && (
        selectedBestellung ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-sm text-muted-foreground">
                {tt('summaryOrder')}: <span className="font-medium text-foreground">{selectedBestellung.kundeName || (selectedBestellung.fields.order_date?.slice(0, 10) ?? '—')}</span>
              </p>
              <Badge variant="secondary">
                {availableDrivers.length > 0
                  ? tt('availableDrivers', { n: availableDrivers.length })
                  : tt('noAvailableDrivers')}
              </Badge>
            </div>
            <EntitySelectStep
              items={availableDrivers.map((f) => ({
                id: f.record_id,
                title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || f.record_id,
                subtitle: [
                  f.fields.vehicle_type ? `${tt('vehicle')}: ${f.fields.vehicle_type.label}` : null,
                  f.fields.delivery_zone ? `${tt('zone')}: ${f.fields.delivery_zone}` : null,
                  f.fields.driver_phone ? `${tt('phone')}: ${f.fields.driver_phone}` : null,
                ]
                  .filter(Boolean)
                  .join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: vehicleIcon(f.fields.vehicle_type?.key),
              }))}
              onSelect={(id) => {
                const found = availableDrivers.find((f) => f.record_id === id) ?? null;
                setSelectedFahrer(found);
                setStep(3);
              }}
              emptyText={tt('noDrivers')}
              emptyIcon={<IconUser size={32} className="text-muted-foreground" />}
            />
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('prerequisiteHint')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 3: Status wählen & zuweisen ── */}
      {step === 3 && (
        selectedBestellung && selectedFahrer ? (
          <div className="space-y-6">
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Bestellung */}
              <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <IconPackage size={16} />
                  {tt('summaryOrder')}
                </div>
                <div className="space-y-1 min-w-0">
                  {selectedBestellung.kundeName && (
                    <div className="flex items-center gap-1 text-sm min-w-0">
                      <IconUser size={14} className="shrink-0 text-muted-foreground" />
                      <span className="truncate font-medium">{selectedBestellung.kundeName}</span>
                    </div>
                  )}
                  {selectedBestellung.fields.delivery_city && (
                    <div className="flex items-center gap-1 text-sm min-w-0">
                      <IconMapPin size={14} className="shrink-0 text-muted-foreground" />
                      <span className="truncate">{selectedBestellung.fields.delivery_city}</span>
                    </div>
                  )}
                  {selectedBestellung.fields.ordered_items && (
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {selectedBestellung.fields.ordered_items}
                    </p>
                  )}
                  {selectedBestellung.fields.total_amount != null && (
                    <p className="text-sm font-semibold">{selectedBestellung.fields.total_amount.toFixed(2)} €</p>
                  )}
                  {selectedBestellung.fields.order_status && (
                    <StatusBadge
                      statusKey={selectedBestellung.fields.order_status.key}
                      label={selectedBestellung.fields.order_status.label}
                    />
                  )}
                </div>
              </div>

              {/* Fahrer */}
              <div className="rounded-2xl border bg-card p-4 space-y-2 overflow-hidden">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <IconTruck size={16} />
                  {tt('summaryDriver')}
                </div>
                <div className="space-y-1 min-w-0">
                  <p className="font-medium truncate">{driverFullName}</p>
                  {selectedFahrer.fields.vehicle_type && (
                    <div className="flex items-center gap-1 text-sm min-w-0">
                      {vehicleIcon(selectedFahrer.fields.vehicle_type.key)}
                      <span className="truncate">{selectedFahrer.fields.vehicle_type.label}</span>
                    </div>
                  )}
                  {selectedFahrer.fields.delivery_zone && (
                    <div className="flex items-center gap-1 text-sm min-w-0">
                      <IconMapPin size={14} className="shrink-0 text-muted-foreground" />
                      <span className="truncate">{selectedFahrer.fields.delivery_zone}</span>
                    </div>
                  )}
                  {selectedFahrer.fields.driver_phone && (
                    <div className="flex items-center gap-1 text-sm min-w-0">
                      <IconPhone size={14} className="shrink-0 text-muted-foreground" />
                      <span className="truncate">{selectedFahrer.fields.driver_phone}</span>
                    </div>
                  )}
                  {selectedFahrer.fields.driver_status && (
                    <StatusBadge
                      statusKey={selectedFahrer.fields.driver_status.key}
                      label={selectedFahrer.fields.driver_status.label}
                    />
                  )}
                </div>
              </div>
            </div>

            {/* Status-Auswahl */}
            <div className="space-y-2">
              <label className="text-sm font-medium">{tt('selectStatus')}</label>
              <Select value={targetStatusKey} onValueChange={setTargetStatusKey}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TARGET_STATUS_OPTIONS.map((opt) => (
                    <SelectItem key={opt.key} value={opt.key}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Fehlerhinweis */}
            {submitError && (
              <div className="flex items-start gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                <IconAlertCircle size={16} className="mt-0.5 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            {/* Zuweisen-Button */}
            <Button
              className="w-full"
              disabled={submitting || !targetStatusKey}
              onClick={handleAssign}
            >
              <IconTruck size={16} className="mr-2" />
              {submitting ? tt('assigning') : tt('assignBtn')}
            </Button>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('prerequisiteHint')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}

      {/* ── Step 4: Erfolg ── */}
      {step === 4 && (
        success && selectedBestellung && selectedFahrer ? (
          <div className="flex flex-col items-center text-center py-10 space-y-6">
            <div className="rounded-full bg-primary/10 p-5">
              <IconCircleCheck size={48} className="text-primary" />
            </div>
            <div className="space-y-1">
              <h2 className="text-xl font-semibold">{tt('successTitle')}</h2>
              <p className="text-sm text-muted-foreground">
                {tt('successDesc', { driver: driverFullName })}
              </p>
            </div>
            <div className="rounded-2xl border bg-card p-4 w-full max-w-sm text-left space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{tt('summaryOrder')}</span>
                <span className="font-medium truncate max-w-[60%] text-right">
                  {selectedBestellung.kundeName || selectedBestellung.fields.order_date?.slice(0, 10) || '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{tt('summaryDriver')}</span>
                <span className="font-medium truncate max-w-[60%] text-right">{driverFullName}</span>
              </div>
              <div className="flex justify-between text-sm items-center">
                <span className="text-muted-foreground">{tt('summaryNewStatus')}</span>
                <StatusBadge statusKey={targetStatusKey} />
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 w-full max-w-sm">
              <Button className="flex-1" onClick={handleReset}>
                {tt('newDispatch')}
              </Button>
              <Button variant="outline" className="flex-1" asChild>
                <a href="#/">{tt('backToDashboard')}</a>
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tt('prerequisiteHint')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tt('restart')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
