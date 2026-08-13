/**
 * Lieferung abschließen — 3-Schritt-Wizard.
 * Steps: 1) Bestellung wählen (Status: neu/in_bearbeitung/bereit_zur_lieferung) →
 *        2) Fahrer zuweisen (nur verfuegbar) →
 *        3) Lieferung bestätigen (geliefert oder stornieren).
 * Reads: bestellverwaltung, fahrerverwaltung.
 * Writes: bestellverwaltung (updateBestellverwaltungEntry), fahrerverwaltung (updateFahrerverwaltungEntry).
 * Composes: IntentWizardShell, EntitySelectStep, StatusBadge.
 */

import { useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { StatusBadge } from '@/components/blocks/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import type { Bestellverwaltung, Fahrerverwaltung } from '@/types/app';
import { LivingAppsService, createRecordUrl } from '@/services/livingAppsService';
import { tx } from '@/i18n';
import { Button } from '@/components/ui/button';
import { IconTruck, IconUser, IconCheck, IconX, IconMapPin, IconPhone, IconPackage } from '@tabler/icons-react';

const ACTIVE_ORDER_STATUSES = new Set(['neu', 'in_bearbeitung', 'bereit_zur_lieferung']);

export default function LieferungAbschliessenPage() {
  const [searchParams] = useSearchParams();
  const initialBestellungId = searchParams.get('bestellungId');

  const { bestellverwaltung, fahrerverwaltung, loading, error, fetchAll } = useDashboardData();

  const [step, setStep] = useState<number>(initialBestellungId ? 2 : 1);
  const [selectedBestellung, setSelectedBestellung] = useState<Bestellverwaltung | null>(null);
  const [selectedFahrer, setSelectedFahrer] = useState<Fahrerverwaltung | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [completed, setCompleted] = useState<'geliefert' | 'storniert' | null>(null);

  // Deep-link: if bestellungId is in URL, auto-select that order
  const resolveBestellung = useCallback(() => {
    if (initialBestellungId && !selectedBestellung && bestellverwaltung) {
      const found = bestellverwaltung.find(b => b.record_id === initialBestellungId);
      if (found) return found;
    }
    return selectedBestellung;
  }, [initialBestellungId, selectedBestellung, bestellverwaltung]);

  const activeBestellung = resolveBestellung();

  // Filtered lists
  const offeneBestellungen = (bestellverwaltung ?? []).filter(
    b => b.fields.order_status && ACTIVE_ORDER_STATUSES.has(b.fields.order_status.key)
  );

  const verfuegbareFahrer = (fahrerverwaltung ?? []).filter(
    f => f.fields.driver_status?.key === 'verfuegbar'
  );

  const vehicleTypeOptions = LOOKUP_OPTIONS['fahrerverwaltung']?.['vehicle_type'] ?? [];

  const handleBestellungSelect = (id: string) => {
    const bestellung = offeneBestellungen.find(b => b.record_id === id);
    if (bestellung) {
      setSelectedBestellung(bestellung);
      setStep(2);
    }
  };

  const handleFahrerSelect = async (fahrerId: string) => {
    const fahrer = verfuegbareFahrer.find(f => f.record_id === fahrerId);
    if (!fahrer || !activeBestellung) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const fahrerURL = createRecordUrl(APP_IDS.FAHRERVERWALTUNG, fahrerId);
      await LivingAppsService.updateBestellverwaltungEntry(activeBestellung.record_id, {
        fahrer: fahrerURL,
        order_status: 'unterwegs',
      });
      await LivingAppsService.updateFahrerverwaltungEntry(fahrerId, {
        driver_status: 'im_einsatz',
      });
      setSelectedFahrer(fahrer);
      await fetchAll();
      setStep(3);
    } catch (e) {
      setSaveError(tx('Fehler beim Zuweisen des Fahrers. Bitte erneut versuchen.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleAbschluss = async (status: 'geliefert' | 'storniert') => {
    if (!activeBestellung || !selectedFahrer) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      await LivingAppsService.updateBestellverwaltungEntry(activeBestellung.record_id, {
        order_status: status,
      });
      await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrer.record_id, {
        driver_status: 'verfuegbar',
      });
      setCompleted(status);
      await fetchAll();
    } catch (e) {
      setSaveError(tx('Fehler beim Abschließen der Lieferung. Bitte erneut versuchen.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedBestellung(null);
    setSelectedFahrer(null);
    setSaveError(null);
    setCompleted(null);
    setStep(1);
  };

  const formatCurrency = (amount?: number) => {
    if (amount == null) return '—';
    return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(amount);
  };

  const truncateItems = (items?: string, maxLen = 60) => {
    if (!items) return '—';
    return items.length > maxLen ? items.slice(0, maxLen) + '…' : items;
  };

  return (
    <IntentWizardShell
      title={tx('Lieferung abschließen')}
      subtitle={tx('Bestellung einem Fahrer zuweisen und als geliefert markieren')}
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
          items={offeneBestellungen.map(b => ({
            id: b.record_id,
            title: `${tx('Bestellung')} #${b.record_id.slice(-6).toUpperCase()}`,
            subtitle: [
              b.fields.delivery_city,
              b.fields.order_date ? b.fields.order_date.slice(0, 10) : null,
              b.fields.total_amount != null ? formatCurrency(b.fields.total_amount) : null,
            ].filter(Boolean).join(' · '),
            status: b.fields.order_status
              ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
              : undefined,
            stats: [
              { label: tx('Artikel'), value: truncateItems(b.fields.ordered_items, 30) },
              { label: tx('Betrag'), value: formatCurrency(b.fields.total_amount) },
            ],
            icon: <IconPackage size={20} className="text-primary" stroke={1.5} />,
          }))}
          onSelect={handleBestellungSelect}
          searchPlaceholder={tx('Bestellung suchen …')}
          emptyText={tx('Keine offenen Bestellungen vorhanden')}
          emptyIcon={<IconPackage size={32} className="text-muted-foreground" stroke={1.5} />}
        />
      )}

      {/* Schritt 2: Fahrer zuweisen */}
      {step === 2 && (
        activeBestellung ? (
          <div className="space-y-4">
            {/* Bestellungs-Kontext */}
            <div className="rounded-2xl border bg-secondary/40 p-4 flex flex-wrap gap-3 items-center">
              <IconPackage size={18} className="text-muted-foreground shrink-0" stroke={1.5} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">
                  {tx('Bestellung')} #{activeBestellung.record_id.slice(-6).toUpperCase()}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {truncateItems(activeBestellung.fields.ordered_items)} · {formatCurrency(activeBestellung.fields.total_amount)}
                </p>
              </div>
              {activeBestellung.fields.order_status && (
                <StatusBadge
                  statusKey={activeBestellung.fields.order_status.key}
                  label={activeBestellung.fields.order_status.label}
                />
              )}
            </div>

            {saveError && (
              <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {saveError}
              </div>
            )}

            {isSaving ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {tx('Fahrer wird zugewiesen …')}
              </div>
            ) : (
              <EntitySelectStep
                items={verfuegbareFahrer.map(f => {
                  const vtLabel = vehicleTypeOptions.find(o => o.key === f.fields.vehicle_type?.key)?.label
                    ?? f.fields.vehicle_type?.label
                    ?? '—';
                  return {
                    id: f.record_id,
                    title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || f.record_id,
                    subtitle: [vtLabel, f.fields.delivery_zone].filter(Boolean).join(' · '),
                    status: f.fields.driver_status
                      ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                      : undefined,
                    stats: [
                      { label: tx('Fahrzeug'), value: vtLabel },
                      { label: tx('Telefon'), value: f.fields.driver_phone ?? '—' },
                    ],
                    icon: <IconUser size={20} className="text-primary" stroke={1.5} />,
                  };
                })}
                onSelect={handleFahrerSelect}
                searchPlaceholder={tx('Fahrer suchen …')}
                emptyText={tx('Keine verfügbaren Fahrer')}
                emptyIcon={<IconUser size={32} className="text-muted-foreground" stroke={1.5} />}
              />
            )}

            <div className="pt-2">
              <Button variant="outline" onClick={() => setStep(1)} className="w-full sm:w-auto">
                {tx('Zurück zu Schritt 1')}
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

      {/* Schritt 3: Lieferung bestätigen */}
      {step === 3 && (
        activeBestellung && selectedFahrer ? (
          completed ? (
            <div className="space-y-6">
              <div className="rounded-2xl border bg-card p-6 text-center space-y-3">
                <div className={`inline-flex items-center justify-center w-14 h-14 rounded-full ${completed === 'geliefert' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                  {completed === 'geliefert'
                    ? <IconCheck size={28} stroke={2} />
                    : <IconX size={28} stroke={2} />}
                </div>
                <h2 className="text-lg font-semibold">
                  {completed === 'geliefert'
                    ? tx('Lieferung erfolgreich abgeschlossen!')
                    : tx('Bestellung wurde storniert.')}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {completed === 'geliefert'
                    ? tx('Die Bestellung wurde als geliefert markiert und der Fahrer ist wieder verfügbar.')
                    : tx('Die Bestellung wurde storniert und der Fahrer ist wieder verfügbar.')}
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button onClick={handleReset} className="flex-1">
                  {tx('Neue Lieferung abschließen')}
                </Button>
                <a href="#/" className="flex-1">
                  <Button variant="outline" className="w-full">
                    {tx('Zurück zum Dashboard')}
                  </Button>
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Bestellungs-Zusammenfassung */}
              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="p-4 border-b bg-secondary/30">
                  <h3 className="font-medium text-sm">{tx('Bestelldetails')}</h3>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <IconPackage size={16} className="text-muted-foreground mt-0.5 shrink-0" stroke={1.5} />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tx('Bestellnummer')}</p>
                      <p className="text-sm font-medium">#{activeBestellung.record_id.slice(-6).toUpperCase()}</p>
                    </div>
                  </div>
                  {activeBestellung.fields.ordered_items && (
                    <div className="flex items-start gap-2">
                      <IconPackage size={16} className="text-muted-foreground mt-0.5 shrink-0" stroke={1.5} />
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">{tx('Artikel')}</p>
                        <p className="text-sm line-clamp-2">{activeBestellung.fields.ordered_items}</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-2">
                    <IconMapPin size={16} className="text-muted-foreground mt-0.5 shrink-0" stroke={1.5} />
                    <div className="min-w-0">
                      <p className="text-xs text-muted-foreground">{tx('Lieferadresse')}</p>
                      <p className="text-sm">
                        {[
                          activeBestellung.fields.delivery_street,
                          activeBestellung.fields.delivery_house_number,
                          activeBestellung.fields.delivery_postal_code,
                          activeBestellung.fields.delivery_city,
                        ].filter(Boolean).join(' ') || '—'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{tx('Betrag')}:</span>
                    <span className="text-sm font-semibold">{formatCurrency(activeBestellung.fields.total_amount)}</span>
                  </div>
                  {activeBestellung.fields.order_status && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{tx('Status')}:</span>
                      <StatusBadge
                        statusKey={activeBestellung.fields.order_status.key}
                        label={activeBestellung.fields.order_status.label}
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Fahrer-Zusammenfassung */}
              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="p-4 border-b bg-secondary/30">
                  <h3 className="font-medium text-sm">{tx('Zugewiesener Fahrer')}</h3>
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <IconUser size={16} className="text-muted-foreground shrink-0" stroke={1.5} />
                    <p className="text-sm font-medium">
                      {`${selectedFahrer.fields.driver_first_name ?? ''} ${selectedFahrer.fields.driver_last_name ?? ''}`.trim() || '—'}
                    </p>
                  </div>
                  {selectedFahrer.fields.driver_phone && (
                    <div className="flex items-center gap-2">
                      <IconPhone size={16} className="text-muted-foreground shrink-0" stroke={1.5} />
                      <p className="text-sm">{selectedFahrer.fields.driver_phone}</p>
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {selectedFahrer.fields.vehicle_type && (
                      <span className="text-xs bg-secondary rounded-full px-2.5 py-1">
                        <IconTruck size={12} className="inline mr-1" stroke={1.5} />
                        {vehicleTypeOptions.find(o => o.key === selectedFahrer.fields.vehicle_type?.key)?.label
                          ?? selectedFahrer.fields.vehicle_type.label}
                      </span>
                    )}
                    {selectedFahrer.fields.delivery_zone && (
                      <span className="text-xs bg-secondary rounded-full px-2.5 py-1">
                        <IconMapPin size={12} className="inline mr-1" stroke={1.5} />
                        {selectedFahrer.fields.delivery_zone}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {saveError && (
                <div className="rounded-xl bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  {saveError}
                </div>
              )}

              {/* Aktions-Buttons */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  className="flex-1"
                  disabled={isSaving}
                  onClick={() => handleAbschluss('geliefert')}
                >
                  <IconCheck size={16} className="mr-2" stroke={2} />
                  {tx('Als geliefert markieren')}
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-destructive/50 text-destructive hover:bg-destructive/5"
                  disabled={isSaving}
                  onClick={() => handleAbschluss('storniert')}
                >
                  <IconX size={16} className="mr-2" stroke={2} />
                  {tx('Stornieren')}
                </Button>
              </div>

              {isSaving && (
                <p className="text-center text-sm text-muted-foreground">{tx('Wird gespeichert …')}</p>
              )}

              <div className="pt-1">
                <Button variant="ghost" onClick={() => setStep(2)} className="w-full sm:w-auto text-muted-foreground">
                  {tx('Zurück zu Schritt 2')}
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
