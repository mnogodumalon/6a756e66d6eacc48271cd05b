import { useEffect, useRef, useState } from 'react';
import { PublicShell } from '@/components/PublicShell';
import {
  loadPublicPagesConfig,
  createPublicRecord,
  prepareChallenge,
  PageUnavailableError,
  type PublicPagesConfig,
  type PublicPageConfig,
} from '@/lib/publicClient';
import { makeT } from '@/i18n';
import {
  IconCheck,
  IconUser,
  IconMapPin,
  IconNotes,
  IconSend,
  IconAlertCircle,
} from '@tabler/icons-react';

const tt = makeT({
  de: {
    title: 'Bestellung aufgeben',
    subtitle: 'Füllen Sie das Formular aus – wir melden uns schnellstmöglich bei Ihnen.',
    sec_contact: 'Kontaktdaten',
    sec_address: 'Lieferadresse',
    sec_order: 'Ihre Bestellung',
    first_name: 'Vorname',
    last_name: 'Nachname',
    email: 'E-Mail-Adresse',
    phone: 'Telefonnummer',
    street: 'Straße',
    house_number: 'Hausnummer',
    postal_code: 'Postleitzahl',
    city: 'Stadt',
    notes: 'Was möchten Sie bestellen?',
    notes_ph: 'Beschreiben Sie Ihre Bestellung – Artikel, Menge, besondere Wünsche …',
    required_hint: '* Pflichtfeld',
    submit: 'Bestellung absenden',
    submitting: 'Wird gesendet …',
    success_title: 'Bestellung erhalten!',
    success_body: 'Vielen Dank! Wir haben Ihre Anfrage erhalten und melden uns in Kürze.',
    error_generic: 'Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.',
    error_unavailable: 'Diese Seite ist momentan nicht verfügbar.',
    val_required: 'Dieses Feld ist erforderlich.',
    val_email: 'Bitte geben Sie eine gültige E-Mail-Adresse ein.',
  },
  en: {
    title: 'Place an order',
    subtitle: 'Fill in the form and we will get back to you as soon as possible.',
    sec_contact: 'Contact details',
    sec_address: 'Delivery address',
    sec_order: 'Your order',
    first_name: 'First name',
    last_name: 'Last name',
    email: 'Email address',
    phone: 'Phone number',
    street: 'Street',
    house_number: 'House number',
    postal_code: 'Postal code',
    city: 'City',
    notes: 'What would you like to order?',
    notes_ph: 'Describe your order – items, quantities, special requests …',
    required_hint: '* Required field',
    submit: 'Place order',
    submitting: 'Sending …',
    success_title: 'Order received!',
    success_body: 'Thank you! We have received your request and will be in touch shortly.',
    error_generic: 'Something went wrong. Please try again.',
    error_unavailable: 'This page is currently unavailable.',
    val_required: 'This field is required.',
    val_email: 'Please enter a valid email address.',
  },
  cs: {
    title: 'Objednávkový formulář',
    subtitle: 'Vyplňte formulář a ozveme se vám co nejdříve.',
    sec_contact: 'Kontaktní údaje',
    sec_address: 'Doručovací adresa',
    sec_order: 'Vaše objednávka',
    first_name: 'Jméno',
    last_name: 'Příjmení',
    email: 'E-mailová adresa',
    phone: 'Telefonní číslo',
    street: 'Ulice',
    house_number: 'Číslo popisné',
    postal_code: 'PSČ',
    city: 'Město',
    notes: 'Co si přejete objednat?',
    notes_ph: 'Popište svou objednávku – položky, množství, zvláštní přání …',
    required_hint: '* Povinné pole',
    submit: 'Odeslat objednávku',
    submitting: 'Odesílám …',
    success_title: 'Objednávka přijata!',
    success_body: 'Děkujeme! Vaši objednávku jsme přijali a brzy se vám ozveme.',
    error_generic: 'Něco se pokazilo. Zkuste to prosím znovu.',
    error_unavailable: 'Tato stránka je momentálně nedostupná.',
    val_required: 'Toto pole je povinné.',
    val_email: 'Zadejte prosím platnou e-mailovou adresu.',
  },
});

interface FormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  street: string;
  house_number: string;
  postal_code: string;
  city: string;
  notes: string;
}

type FormErrors = Partial<Record<keyof FormData, string>>;

const EMPTY: FormData = {
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  street: '',
  house_number: '',
  postal_code: '',
  city: '',
  notes: '',
};

function validate(data: FormData): FormErrors {
  const errors: FormErrors = {};
  if (!data.first_name.trim()) errors.first_name = tt('val_required');
  if (!data.last_name.trim()) errors.last_name = tt('val_required');
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email))
    errors.email = tt('val_email');
  if (!data.street.trim()) errors.street = tt('val_required');
  if (!data.house_number.trim()) errors.house_number = tt('val_required');
  if (!data.postal_code.trim()) errors.postal_code = tt('val_required');
  if (!data.city.trim()) errors.city = tt('val_required');
  return errors;
}

function Field({
  label,
  id,
  value,
  onChange,
  error,
  type = 'text',
  required,
  placeholder,
  onFocus,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  type?: string;
  required?: boolean;
  placeholder?: string;
  onFocus?: () => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onFocus={onFocus}
        className={[
          'w-full rounded-lg border px-3 py-2.5 text-sm bg-background text-foreground',
          'placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring',
          error ? 'border-destructive' : 'border-input',
        ].join(' ')}
      />
      {error && (
        <span className="flex items-center gap-1 text-xs text-destructive">
          <IconAlertCircle size={12} className="shrink-0" />
          {error}
        </span>
      )}
    </div>
  );
}

export default function PublicOrder() {
  const [cfg, setCfg] = useState<PublicPagesConfig | null>(null);
  const [page, setPage] = useState<PublicPageConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const [data, setData] = useState<FormData>(EMPTY);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const challengePrepared = useRef(false);

  useEffect(() => {
    loadPublicPagesConfig().then(c => {
      const p = c?.pages['anfrage'] ?? null;
      if (!c || !p) {
        setUnavailable(true);
      } else {
        setCfg(c);
        setPage(p);
      }
      setConfigLoading(false);
    });
  }, []);

  if (configLoading || unavailable || !cfg || !page) {
    return <PublicShell loading={configLoading} unavailable={!configLoading && unavailable} />;
  }

  function set(field: keyof FormData) {
    return (v: string) => {
      setData(prev => ({ ...prev, [field]: v }));
      if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }));
    };
  }

  function handleFocus() {
    if (challengePrepared.current) return;
    challengePrepared.current = true;
    prepareChallenge(cfg!, page!, 'POST', `/apps/${page!.app_id}/records`);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate(data);
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      await createPublicRecord(cfg!, page!, {
        first_name: data.first_name.trim(),
        last_name: data.last_name.trim(),
        email: data.email.trim() || undefined,
        phone: data.phone.trim() || undefined,
        street: data.street.trim(),
        house_number: data.house_number.trim(),
        postal_code: data.postal_code.trim(),
        city: data.city.trim(),
        notes: data.notes.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      if (err instanceof PageUnavailableError) {
        setSubmitError(tt('error_unavailable'));
      } else {
        setSubmitError(tt('error_generic'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <PublicShell title={tt('title')}>
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <div className="flex items-center justify-center w-16 h-16 rounded-full bg-success/10">
            <IconCheck size={32} className="text-success" stroke={2} />
          </div>
          <h2 className="text-xl font-semibold text-foreground">{tt('success_title')}</h2>
          <p className="text-sm text-muted-foreground max-w-sm">{tt('success_body')}</p>
        </div>
      </PublicShell>
    );
  }

  return (
    <PublicShell title={tt('title')} description={tt('subtitle')}>
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-6">
        {/* Contact */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-2">
            <IconUser size={16} className="shrink-0 text-muted-foreground" />
            {tt('sec_contact')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              id="first_name"
              label={tt('first_name')}
              value={data.first_name}
              onChange={set('first_name')}
              error={errors.first_name}
              required
              onFocus={handleFocus}
            />
            <Field
              id="last_name"
              label={tt('last_name')}
              value={data.last_name}
              onChange={set('last_name')}
              error={errors.last_name}
              required
              onFocus={handleFocus}
            />
            <Field
              id="email"
              label={tt('email')}
              value={data.email}
              onChange={set('email')}
              error={errors.email}
              type="email"
              onFocus={handleFocus}
            />
            <Field
              id="phone"
              label={tt('phone')}
              value={data.phone}
              onChange={set('phone')}
              error={errors.phone}
              type="tel"
              onFocus={handleFocus}
            />
          </div>
        </section>

        {/* Address */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-2">
            <IconMapPin size={16} className="shrink-0 text-muted-foreground" />
            {tt('sec_address')}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <Field
                id="street"
                label={tt('street')}
                value={data.street}
                onChange={set('street')}
                error={errors.street}
                required
                onFocus={handleFocus}
              />
            </div>
            <Field
              id="house_number"
              label={tt('house_number')}
              value={data.house_number}
              onChange={set('house_number')}
              error={errors.house_number}
              required
              onFocus={handleFocus}
            />
            <Field
              id="postal_code"
              label={tt('postal_code')}
              value={data.postal_code}
              onChange={set('postal_code')}
              error={errors.postal_code}
              required
              onFocus={handleFocus}
            />
            <div className="sm:col-span-2">
              <Field
                id="city"
                label={tt('city')}
                value={data.city}
                onChange={set('city')}
                error={errors.city}
                required
                onFocus={handleFocus}
              />
            </div>
          </div>
        </section>

        {/* Order */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-foreground border-b pb-2">
            <IconNotes size={16} className="shrink-0 text-muted-foreground" />
            {tt('sec_order')}
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="notes" className="text-sm font-medium text-foreground">
              {tt('notes')}
            </label>
            <textarea
              id="notes"
              value={data.notes}
              placeholder={tt('notes_ph')}
              onChange={e => set('notes')(e.target.value)}
              onFocus={handleFocus}
              rows={4}
              className="w-full rounded-lg border border-input px-3 py-2.5 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-y"
            />
          </div>
        </section>

        {submitError && (
          <div className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-4 py-3 text-sm text-destructive">
            <IconAlertCircle size={16} className="shrink-0" />
            {submitError}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="flex items-center justify-center gap-2 w-full rounded-lg bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-colors"
          >
            {submitting ? (
              tt('submitting')
            ) : (
              <>
                <IconSend size={16} className="shrink-0" />
                {tt('submit')}
              </>
            )}
          </button>
          <p className="text-xs text-muted-foreground text-center">{tt('required_hint')}</p>
        </div>
      </form>
    </PublicShell>
  );
}
