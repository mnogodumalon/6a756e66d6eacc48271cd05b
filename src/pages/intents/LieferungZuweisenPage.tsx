/**
 * Lieferung zuweisen — 4-Schritt-Wizard.
 * Steps: 1) Bestellung auswählen (status 'bereit_zur_lieferung') →
 *         2) Fahrer auswählen (status 'verfuegbar') →
 *         3) Prüfen (SummaryStep) →
 *         4) Fertig (SuccessStep).
 * Reads: bestellverwaltung, fahrerverwaltung, kundenverwaltung.
 * Writes: updateBestellverwaltungEntry (fahrer + order_status → 'unterwegs'),
 *         updateFahrerverwaltungEntry (driver_status → 'im_einsatz').
 * Composes: IntentWizardShell, EntitySelectStep, SummaryStep, SuccessStep.
 */

import { useState } from 'react';
import { IconTruck, IconUser } from '@tabler/icons-react';
import { useDashboardData } from '@/hooks/useDashboardData';
import { useIntentSubmit } from '@/hooks/useIntentSubmit';
import type { Bestellverwaltung, Fahrerverwaltung } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { LivingAppsService, createRecordUrl, extractRecordId } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/blocks/IntentWizardShell';
import { EntitySelectStep } from '@/components/blocks/EntitySelectStep';
import { SummaryStep } from '@/components/blocks/SummaryStep';
import { SuccessStep } from '@/components/blocks/SuccessStep';
import { formatDate, formatCurrency, lookupKey } from '@/lib/formatters';

const DRAFT_KEY = 'intent:lieferung-zuweisen';

const STEPS = [
  { label: 'Bestellung' },
  { label: 'Fahrer' },
  { label: 'Prüfen' },
  { label: 'Fertig' },
];

interface WizardState {
  bestellungId: string;
  fahrerId: string;
}

export default function LieferungZuweisenPage() {
  const { bestellverwaltung, fahrerverwaltung, kundenverwaltungMap, loading, error, fetchAll } =
    useDashboardData();

  const [step, setStep] = useState(1);
  const [state, setState] = useState<WizardState>({ bestellungId: '', fahrerId: '' });

  const selectedBestellung: Bestellverwaltung | undefined = bestellverwaltung.find(
    b => b.record_id === state.bestellungId,
  );
  const selectedFahrer: Fahrerverwaltung | undefined = fahrerverwaltung.find(
    f => f.record_id === state.fahrerId,
  );

  // Eligible records
  const bereiteBestellungen = bestellverwaltung.filter(
    b => lookupKey(b.fields.order_status) === 'bereit_zur_lieferung',
  );
  const verfuegbareFahrer = fahrerverwaltung.filter(
    f => lookupKey(f.fields.driver_status) === 'verfuegbar',
  );

  const { submit, submitting, error: submitError, done, result, reset } = useIntentSubmit(
    async () => {
      if (!selectedBestellung || !selectedFahrer) throw new Error('Auswahl fehlt');
      await LivingAppsService.updateBestellverwaltungEntry(selectedBestellung.record_id, {
        fahrer: createRecordUrl(APP_IDS.FAHRERVERWALTUNG, selectedFahrer.record_id),
        order_status: 'unterwegs',
      });
      await LivingAppsService.updateFahrerverwaltungEntry(selectedFahrer.record_id, {
        driver_status: 'im_einsatz',
      });
      await fetchAll();
      return {
        bestellungId: selectedBestellung.record_id,
        fahrerId: selectedFahrer.record_id,
        fahrerName: `${selectedFahrer.fields.driver_first_name ?? ''} ${selectedFahrer.fields.driver_last_name ?? ''}`.trim(),
        kundeId: extractRecordId(selectedBestellung.fields.kunde) ?? '',
        items: selectedBestellung.fields.ordered_items ?? '',
        total: selectedBestellung.fields.total_amount,
      };
    },
    { draftKey: DRAFT_KEY },
  );

  const handleReset = () => {
    reset();
    setState({ bestellungId: '', fahrerId: '' });
    setStep(1);
  };

  // Answers context bar
  const answers =
    step > 1 && selectedBestellung
      ? [
          {
            label: 'Bestellung',
            value: selectedBestellung.fields.ordered_items
              ? `${selectedBestellung.fields.ordered_items.slice(0, 40)}${selectedBestellung.fields.ordered_items.length > 40 ? '…' : ''}`
              : `Bestellung vom ${formatDate(selectedBestellung.fields.order_date)}`,
          },
          ...(step > 2 && selectedFahrer
            ? [
                {
                  label: 'Fahrer',
                  value: `${selectedFahrer.fields.driver_first_name ?? ''} ${selectedFahrer.fields.driver_last_name ?? ''}`.trim(),
                },
              ]
            : []),
        ]
      : undefined;

  return (
    <IntentWizardShell
      title="Lieferung zuweisen"
      subtitle="Fahrer einer lieferbereiten Bestellung zuordnen"
      steps={STEPS}
      currentStep={step}
      onStepChange={setStep}
      loading={loading}
      error={error}
      onRetry={fetchAll}
      intro={{
        description:
          'Weise einer lieferbereiten Bestellung einen verfügbaren Fahrer zu. Beide Datensätze werden automatisch in den aktiven Lieferstatus versetzt.',
        requirements: ['Mindestens eine Bestellung mit Status „Bereit zur Lieferung"', 'Mindestens ein verfügbarer Fahrer'],
      }}
      answers={answers}
      draftKey={DRAFT_KEY}
      draft={state}
      onDraftRestore={d => setState(d as WizardState)}
    >
      {/* Step 1: Bestellung auswählen */}
      {step === 1 && (
        <EntitySelectStep
          items={bereiteBestellungen.map(b => {
            const kundeRecord = extractRecordId(b.fields.kunde)
              ? kundenverwaltungMap.get(extractRecordId(b.fields.kunde)!)
              : undefined;
            const kundeName = kundeRecord
              ? `${kundeRecord.fields.first_name ?? ''} ${kundeRecord.fields.last_name ?? ''}`.trim()
              : '—';
            return {
              id: b.record_id,
              title: b.fields.ordered_items
                ? b.fields.ordered_items.slice(0, 60) + (b.fields.ordered_items.length > 60 ? '…' : '')
                : `Bestellung vom ${formatDate(b.fields.order_date)}`,
              subtitle: `${kundeName} · ${formatDate(b.fields.order_date)}`,
              status: b.fields.order_status
                ? { key: b.fields.order_status.key, label: b.fields.order_status.label }
                : undefined,
              stats: [
                { label: 'Betrag', value: formatCurrency(b.fields.total_amount) },
              ],
              icon: <IconTruck size={20} className="text-primary" />,
            };
          })}
          onSelect={id => {
            setState(s => ({ ...s, bestellungId: id }));
            setStep(2);
          }}
          searchPlaceholder="Bestellung suchen …"
          emptyText={`Keine lieferbereiten Bestellungen vorhanden (${bereiteBestellungen.length} gesamt)`}
        />
      )}

      {/* Step 2: Fahrer auswählen */}
      {step === 2 && (
        <>
          {!selectedBestellung ? (
            <div className="rounded-2xl border p-6 text-center space-y-3">
              <p className="text-muted-foreground">Keine Bestellung ausgewählt.</p>
              <button
                onClick={() => setStep(1)}
                className="text-sm text-primary underline underline-offset-2"
              >
                Zurück zu Schritt 1
              </button>
            </div>
          ) : (
            <EntitySelectStep
              items={verfuegbareFahrer.map(f => ({
                id: f.record_id,
                title: `${f.fields.driver_first_name ?? ''} ${f.fields.driver_last_name ?? ''}`.trim() || '—',
                subtitle: [
                  f.fields.vehicle_type?.label,
                  f.fields.delivery_zone ? `Zone: ${f.fields.delivery_zone}` : undefined,
                  f.fields.driver_phone,
                ]
                  .filter(Boolean)
                  .join(' · '),
                status: f.fields.driver_status
                  ? { key: f.fields.driver_status.key, label: f.fields.driver_status.label }
                  : undefined,
                stats: [
                  { label: 'Fahrzeug', value: f.fields.vehicle_type?.label ?? '—' },
                ],
                icon: <IconUser size={20} className="text-primary" />,
              }))}
              onSelect={id => {
                setState(s => ({ ...s, fahrerId: id }));
                setStep(3);
              }}
              searchPlaceholder="Fahrer suchen …"
              emptyText={`Kein verfügbarer Fahrer (${verfuegbareFahrer.length} verfügbar)`}
            />
          )}
        </>
      )}

      {/* Step 3: SummaryStep */}
      {step === 3 && !done && (
        <>
          {!selectedBestellung || !selectedFahrer ? (
            <div className="rounded-2xl border p-6 text-center space-y-3">
              <p className="text-muted-foreground">Auswahl unvollständig.</p>
              <button
                onClick={() => setStep(!selectedBestellung ? 1 : 2)}
                className="text-sm text-primary underline underline-offset-2"
              >
                Zurück zur Auswahl
              </button>
            </div>
          ) : (
            <SummaryStep
              items={[
                {
                  label: 'Bestellung',
                  value: selectedBestellung.fields.ordered_items
                    ? selectedBestellung.fields.ordered_items.slice(0, 80)
                    : `Bestellung vom ${formatDate(selectedBestellung.fields.order_date)}`,
                  step: 1,
                },
                {
                  label: 'Bestelldatum',
                  value: formatDate(selectedBestellung.fields.order_date),
                },
                {
                  label: 'Betrag',
                  value: formatCurrency(selectedBestellung.fields.total_amount),
                },
                {
                  label: 'Fahrer',
                  value: `${selectedFahrer.fields.driver_first_name ?? ''} ${selectedFahrer.fields.driver_last_name ?? ''}`.trim(),
                  step: 2,
                },
                {
                  label: 'Fahrzeug',
                  value: selectedFahrer.fields.vehicle_type?.label ?? '—',
                },
                {
                  label: 'Neuer Status (Bestellung)',
                  value: 'Unterwegs',
                },
                {
                  label: 'Neuer Status (Fahrer)',
                  value: 'Im Einsatz',
                },
              ]}
              onEdit={setStep}
              whatHappensNext="Die Bestellung wird auf 'Unterwegs' gesetzt und der Fahrer als 'Im Einsatz' markiert."
              confirmLabel="Zuweisung bestätigen"
              onConfirm={async () => {
                if (await submit()) setStep(4);
              }}
              submitting={submitting}
              missing={[]}
              error={submitError}
            />
          )}
        </>
      )}

      {/* Step 4: SuccessStep */}
      {step === 4 && result && (
        <SuccessStep
          title={`Fahrer ${result.fahrerName} zugewiesen`}
          details={[
            `Bestellung ist jetzt „Unterwegs"`,
            `Fahrer ${result.fahrerName} ist jetzt „Im Einsatz"`,
            result.items ? `Inhalt: ${result.items.slice(0, 60)}${result.items.length > 60 ? '…' : ''}` : undefined,
          ].filter((d): d is string => Boolean(d))}
          actions={[
            { label: 'Nächste Zuweisung', onClick: handleReset },
            { label: 'Zurück zum Dashboard', href: '#/' },
          ]}
        />
      )}
    </IntentWizardShell>
  );
}
