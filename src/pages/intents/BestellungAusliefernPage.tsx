/**
 * Bestellung Ausliefern — 3-Schritt-Wizard.
 * Steps: 1) Bestellung wählen (status bereit_zur_lieferung) →
 *        2) Fahrer zuweisen (status verfuegbar) + Bestellung & Fahrer synchron aktualisieren →
 *        3) Lieferung bestätigen + optionale Notiz → Bestellung geliefert, Fahrer verfügbar.
 * Reads: bestellverwaltung, fahrerverwaltung, kundenverwaltung.
 * Writes: updateBestellverwaltungEntry (order_status, fahrer, delivery_notes),
 *         updateFahrerverwaltungEntry (driver_status).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useMemo } from 'react';
import { tx } from '@/i18n';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Fahrerverwaltung, Bestellverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { formatDateTime, formatCurrency, lookupKey } from '@/lib/formatters';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { IconTruck, IconUser, IconMapPin, IconPackage, IconCircleCheck, IconAlertCircle } from '@tabler/icons-react';

export default function BestellungAusliefernPage() {
  const { bestellverwaltung, fahrerverwaltung, kundenverwaltungMap, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState(1);
  const [selectedBestellungId, setSelectedBestellungId] = useState<string | null>(null);
  const [selectedFahrerId, setSelectedFahrerId] = useState<string | null>(null);
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const bereiteBestellungen = useMemo(
    () => bestellverwaltung.filter(b => lookupKey(b.fields.order_status) === 'bereit_zur_lieferung'),
    [bestellverwaltung]
  );

  const verfuegbareFahrer = useMemo(
    () => fahrerverwaltung.filter(f => lookupKey(f.fields.driver_status) === 'verfuegbar'),
    [fahrerverwaltung]
  );

  const selectedBestellung: Bestellverwaltung | undefined = useMemo(
    () => bestellverwaltung.find(b => b.record_id === selectedBestellungId),
    [bestellverwaltung, selectedBestellungId]
  );

  const selectedFahrer: Fahrerverwaltung | undefined = useMemo(
    () => fahrerverwaltung.find(f => f.record_id === selectedFahrerId),
    [fahrerverwaltung, selectedFahrerId]
  );

  const kundeForBestellung = useMemo(() => {
    if (!selectedBestellung?.fields.kunde) return null;
    const id = extractRecordId(selectedBestellung.fields.kunde);
    return id ? kundenverwaltungMap.get(id) ?? null : null;
  }, [selectedBestellung, kundenverwaltungMap]);

  const handleFahrerZuweisen = async () => {
    if (!selectedBestellungId || !selectedFahrerId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellungId, {
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrerId),
        order_status: 'unterwegs',
      });
      await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrerId, {
        driver_status: 'im_einsatz',
      });
      await fetchAll();
      setStep(3);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Fehler beim Zuweisen des Fahrers'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleLieferungBestaetigen = async () => {
    if (!selectedBestellungId || !selectedFahrerId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellungId, {
        order_status: 'geliefert',
        ...(deliveryNotes.trim() ? { delivery_notes: deliveryNotes.trim() } : {}),
      });
      await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrerId, {
        driver_status: 'verfuegbar',
      });
      await fetchAll();
      setDone(true);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : tx('Fehler beim Bestätigen der Lieferung'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setStep(1);
    setSelectedBestellungId(null);
    setSelectedFahrerId(null);
    setDeliveryNotes('');
    setSubmitError(null);
    setDone(false);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-6 p-6">
        <div className="rounded-full bg-green-100 p-6">
          <IconCircleCheck size={48} className="text-green-600" stroke={1.5} />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-2xl font-semibold">{tx('Lieferung bestätigt!')}</h2>
          <p className="text-muted-foreground">
            {tx('Die Bestellung wurde erfolgreich als geliefert markiert und der Fahrer ist wieder verfügbar.')}
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <Button onClick={handleReset} variant="default">
            {tx('Neue Lieferung starten')}
          </Button>
          <a href="#/">
            <Button variant="outline">{tx('Zurück zum Dashboard')}</Button>
          </a>
        </div>
      </div>
    );
  }

  return (
    <IntentWizardShell
      title={tx('Bestellung ausliefern')}
      subtitle={tx('Fahrer zuweisen und Lieferung bis zur Zustellung begleiten')}
      steps={[
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
      {/* Schritt 1: Bestellung wählen */}
      {step === 1 && (
        <EntitySelectStep
          items={bereiteBestellungen.map(b => {
            const kundeId = extractRecordId(b.fields.kunde);
            const kd = kundeId ? kundenverwaltungMap.get(kundeId) : undefined;
            const kundeName = kd
              ? `${kd.fields.first_name ?? ''} ${kd.fields.last_name ?? ''}`.trim() || tx('Unbekannter Kunde')
              : tx('Unbekannter Kunde');
            return {
              id: b.record_id,
              title: b.fields.ordered_items ?? tx('Bestellung'),
              subtitle: `${kundeName} · ${b.fields.delivery_street ?? ''} ${b.fields.delivery_city ?? ''}`.trim(),
              status: b.fields.order_status
                ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
                : undefined,
              stats: [
                { label: tx('Betrag'), value: formatCurrency(b.fields.total_amount) },
                { label: tx('Lieferzeit'), value: formatDateTime(b.fields.desired_delivery_time) },
              ],
              icon: <IconPackage size={20} className="text-primary" stroke={1.5} />,
            };
          })}
          onSelect={(id) => { setSelectedBestellungId(id); setStep(2); }}
          searchPlaceholder={tx('Adresse oder Artikel suchen…')}
          emptyText={tx('Keine Bestellungen bereit zur Lieferung')}
          emptyIcon={<IconPackage size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* Schritt 2: Fahrer zuweisen */}
      {step === 2 && (
        selectedBestellungId ? (
          <div className="space-y-6">
            {/* Bestellzusammenfassung */}
            {selectedBestellung && (
              <div className="rounded-2xl border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <IconPackage size={18} className="text-primary" stroke={1.5} />
                  <span className="font-medium text-sm">{tx('Gewählte Bestellung')}</span>
                  {selectedBestellung.fields.order_status && (
                    <StatusBadge
                      statusKey={selectedBestellung.fields.order_status.key}
                      label={selectedBestellung.fields.order_status.label}
                    />
                  )}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div className="flex items-start gap-2">
                    <IconMapPin size={15} className="text-muted-foreground mt-0.5 shrink-0" stroke={1.5} />
                    <span className="text-muted-foreground min-w-0 truncate">
                      {[selectedBestellung.fields.delivery_street, selectedBestellung.fields.delivery_city].filter(Boolean).join(', ') || '—'}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <IconUser size={15} className="text-muted-foreground mt-0.5 shrink-0" stroke={1.5} />
                    <span className="text-muted-foreground min-w-0 truncate">
                      {kundeForBestellung
                        ? `${kundeForBestellung.fields.first_name ?? ''} ${kundeForBestellung.fields.last_name ?? ''}`.trim() || '—'
                        : '—'}
                    </span>
                  </div>
                </div>
                <div className="text-sm font-medium">
                  {selectedBestellung.fields.ordered_items ?? '—'}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{tx('Betrag:')}</span>
                  <span className="font-semibold">{formatCurrency(selectedBestellung.fields.total_amount)}</span>
                </div>
                {selectedBestellung.fields.desired_delivery_time && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{tx('Gewünschte Lieferzeit:')}</span>
                    <span>{formatDateTime(selectedBestellung.fields.desired_delivery_time)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Fahrerliste */}
            <EntitySelectStep
              items={verfuegbareFahrer.map(f => ({
                id: f.record_id,
                title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || tx('Fahrer'),
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone ? tx`Zone: ${f.fields.delivery_zone}` : undefined,
                ].filter(Boolean).join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                icon: <IconTruck size={20} className="text-primary" stroke={1.5} />,
              }))}
              onSelect={(id) => setSelectedFahrerId(id)}
              searchPlaceholder={tx('Fahrer suchen…')}
              emptyText={tx('Kein Fahrer verfügbar')}
              emptyIcon={<IconTruck size={32} className="text-muted-foreground" stroke={1.5} />}
            />

            {/* Vorschau & Aktion */}
            {selectedFahrerId && selectedFahrer && (
              <div className="rounded-2xl border bg-secondary/40 p-4 space-y-3">
                <p className="text-sm font-medium">{tx('Zuweisung bestätigen')}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-muted-foreground">{tx('Fahrer:')}</span>{' '}
                    <span className="font-medium">
                      {`${selectedFahrer.fields.driver_first_name ?? ''} ${selectedFahrer.fields.driver_last_name ?? ''}`.trim()}
                    </span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">{tx('Fahrzeug:')}</span>{' '}
                    <span>{selectedFahrer.fields.vehicle_type?.label ?? '—'}</span>
                  </div>
                  {selectedBestellung?.fields.desired_delivery_time && (
                    <div className="sm:col-span-2">
                      <span className="text-muted-foreground">{tx('Lieferzeit:')}</span>{' '}
                      <span>{formatDateTime(selectedBestellung.fields.desired_delivery_time)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {submitError && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                <IconAlertCircle size={16} stroke={1.5} />
                {submitError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleFahrerZuweisen}
                disabled={!selectedFahrerId || submitting}
                className="flex-1"
              >
                <IconTruck size={16} stroke={1.5} className="mr-2" />
                {submitting ? tx('Wird zugewiesen…') : tx('Fahrer zuweisen & Lieferung starten')}
              </Button>
              <Button variant="outline" onClick={() => setStep(1)}>
                {tx('Zurück')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht eine Bestellung aus Schritt 1.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}

      {/* Schritt 3: Lieferung bestätigen */}
      {step === 3 && (
        selectedBestellungId && selectedFahrerId ? (
          <div className="space-y-6">
            <div className="rounded-2xl border bg-card p-5 space-y-4">
              <div className="flex items-center gap-2 pb-2 border-b">
                <IconTruck size={18} className="text-primary" stroke={1.5} />
                <span className="font-semibold">{tx('Lieferübersicht')}</span>
              </div>

              {selectedBestellung && (
                <div className="space-y-3 text-sm">
                  <div className="font-medium">{selectedBestellung.fields.ordered_items ?? '—'}</div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div className="flex items-start gap-2">
                      <IconMapPin size={15} className="text-muted-foreground mt-0.5 shrink-0" stroke={1.5} />
                      <span className="text-muted-foreground min-w-0">
                        {[
                          selectedBestellung.fields.delivery_street,
                          selectedBestellung.fields.delivery_house_number,
                          selectedBestellung.fields.delivery_postal_code,
                          selectedBestellung.fields.delivery_city,
                        ].filter(Boolean).join(' ') || '—'}
                      </span>
                    </div>
                    <div className="flex items-start gap-2">
                      <IconUser size={15} className="text-muted-foreground mt-0.5 shrink-0" stroke={1.5} />
                      <span className="text-muted-foreground min-w-0">
                        {kundeForBestellung
                          ? `${kundeForBestellung.fields.first_name ?? ''} ${kundeForBestellung.fields.last_name ?? ''}`.trim() || '—'
                          : '—'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{tx('Betrag:')}</span>
                    <span className="font-semibold">{formatCurrency(selectedBestellung.fields.total_amount)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{tx('Status:')}</span>
                    {selectedBestellung.fields.order_status && (
                      <StatusBadge
                        statusKey={selectedBestellung.fields.order_status.key}
                        label={selectedBestellung.fields.order_status.label}
                      />
                    )}
                  </div>
                </div>
              )}

              {selectedFahrer && (
                <div className="pt-3 border-t space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{tx('Fahrer:')}</span>
                    <span className="font-medium">
                      {`${selectedFahrer.fields.driver_first_name ?? ''} ${selectedFahrer.fields.driver_last_name ?? ''}`.trim()}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">{tx('Fahrzeug:')}</span>
                    <span>{selectedFahrer.fields.vehicle_type?.label ?? '—'}</span>
                  </div>
                  {selectedFahrer.fields.delivery_zone && (
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">{tx('Lieferzone:')}</span>
                      <span>{selectedFahrer.fields.delivery_zone}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">{tx('Anmerkung zur Lieferung (optional)')}</label>
              <Textarea
                value={deliveryNotes}
                onChange={e => setDeliveryNotes(e.target.value)}
                placeholder={tx('Z. B. Paket an Nachbar übergeben, Klingelschild beachten…')}
                rows={3}
                className="resize-none"
              />
            </div>

            {submitError && (
              <div className="flex items-center gap-2 rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
                <IconAlertCircle size={16} stroke={1.5} />
                {submitError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <Button
                onClick={handleLieferungBestaetigen}
                disabled={submitting}
                className="flex-1"
              >
                <IconCircleCheck size={16} stroke={1.5} className="mr-2" />
                {submitting ? tx('Wird bestätigt…') : tx('Zustellung bestätigen')}
              </Button>
              <Button variant="outline" onClick={() => setStep(2)} disabled={submitting}>
                {tx('Zurück')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="text-center py-12 space-y-3">
            <p className="text-sm text-muted-foreground">{tx('Dieser Schritt braucht die Auswahl aus Schritt 1 und 2.')}</p>
            <Button variant="outline" onClick={() => setStep(1)}>{tx('Neu starten')}</Button>
          </div>
        )
      )}
    </IntentWizardShell>
  );
}
