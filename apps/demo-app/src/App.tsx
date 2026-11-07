import { useLayoutEffect, useMemo, useState, type FormEvent } from 'react';
import { copy, type Locale } from './i18n';
import { readAttempt, readFlags, readLocale, type BugFlag } from './bugs';

const LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#17352b"/><path d="M8 22V10h4.2l3.8 7.2L19.8 10H24v12h-3.2v-6.6L17.2 22h-2.4l-3.6-6.6V22H8z" fill="#e7f2ea"/></svg>',
)}`;

const EMAIL_OK = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_ES_BUG = /^[a-z]+@[a-z]+\.com$/i;

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  role: string;
  workMode: '' | 'remote' | 'onsite';
  timezone: string;
  office: string;
  slot: string;
  notes: string;
}

const emptyForm: FormState = {
  fullName: '',
  email: '',
  phone: '',
  role: '',
  workMode: '',
  timezone: '',
  office: '',
  slot: '',
  notes: '',
};

function validate(form: FormState, locale: Locale, flags: Set<BugFlag>): string[] {
  const t = copy[locale];
  const errors: string[] = [];
  if (!form.fullName.trim()) errors.push(t.required);
  const email = form.email.trim();
  const emailOk =
    flags.has('es-validation') && locale === 'es' ? EMAIL_ES_BUG.test(email) : EMAIL_OK.test(email);
  if (!emailOk) errors.push(t.invalidEmail);
  if (!form.phone.trim()) errors.push(t.required);
  if (!form.role) errors.push(t.required);
  if (!form.workMode) errors.push(t.required);
  if (form.workMode === 'remote' && !form.timezone && !flags.has('conditional-required')) {
    errors.push(t.timezoneRequired);
  }
  if (form.workMode === 'onsite' && !form.office) errors.push(t.officeRequired);
  if (!form.slot) errors.push(t.required);
  return [...new Set(errors)];
}

export function App() {
  const initialSearch = window.location.search;
  const flags = useMemo(() => readFlags(initialSearch), [initialSearch]);
  const [locale, setLocale] = useState<Locale>(readLocale(initialSearch));
  const [form, setForm] = useState<FormState>(emptyForm);
  const [errors, setErrors] = useState<string[]>([]);
  const [receipt, setReceipt] = useState<{ id: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const idempotencyKey = useMemo(() => crypto.randomUUID(), []);
  const t = copy[locale];

  useLayoutEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const submitTestId =
    flags.has('ui-refactor-submit') || flags.has('ui-refactor-both')
      ? 'send-application'
      : 'submit-application';
  const confirmationTestId = flags.has('ui-refactor-both') ? 'receipt-banner' : 'confirmation-banner';

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function switchLocale(next: Locale) {
    const url = new URL(window.location.href);
    url.searchParams.set('lang', next);
    window.history.replaceState({}, '', url);
    document.documentElement.lang = next;
    setLocale(next);
    setErrors([]);
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    const nextErrors = validate(form, locale, flags);
    setErrors(nextErrors);
    if (nextErrors.length > 0) {
      setReceipt(null);
      setSaving(false);
      return;
    }

    const attempt = readAttempt(window.location.search);
    const response = await fetch('/api/submissions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        idempotencyKey,
        email: form.email.trim(),
        locale,
        bugs: [...flags],
        attempt,
        name: form.fullName.trim(),
      }),
    });
    if (!response.ok) {
      setErrors([t.required]);
      return;
    }
    const body = (await response.json()) as { id: string; suppressConfirmation: boolean };
    if (body.suppressConfirmation) {
      setReceipt(null);
      setSaving(true);
      return;
    }
    setSaving(false);
    setReceipt({ id: body.id });
  }

  return (
    <>
      <a className="skip" href="#application">
        {locale === 'es' ? 'Saltar al formulario' : 'Skip to application'}
      </a>
      <header className="top">
        <div className="brand">
          {flags.has('a11y') ? <img src={LOGO} width={32} height={32} /> : <img src={LOGO} width={32} height={32} alt="Northline" />}
          <div>
            <p className="kicker">{t.kicker}</p>
            <p className="studio">{t.studio}</p>
          </div>
        </div>
        <div className="langs" role="group" aria-label={locale === 'es' ? 'Idioma' : 'Language'}>
          <button type="button" aria-pressed={locale === 'en'} onClick={() => switchLocale('en')}>
            {copy.en.langName}
          </button>
          <button type="button" aria-pressed={locale === 'es'} onClick={() => switchLocale('es')}>
            {copy.es.langName}
          </button>
        </div>
      </header>
      <main id="application" className="sheet">
        <h1>{t.title}</h1>
        <p className="lede">{t.lede}</p>
        {flags.size > 0 && (
          <p className="bug-banner" data-testid="bug-banner">
            {t.bugs}: {[...flags].join(', ')}
          </p>
        )}
        {receipt && (
          <p role="status" data-testid={confirmationTestId} className="status">
            {t.received} · {receipt.id}
          </p>
        )}
        {saving && (
          <p className="saving" data-testid="saving-note">
            {t.saving}
          </p>
        )}
        <form onSubmit={onSubmit} noValidate>
          <fieldset>
            <legend>{t.profile}</legend>
            <label htmlFor="full-name">{t.fullName}</label>
            <input
              id="full-name"
              data-testid="field-name"
              autoComplete="name"
              value={form.fullName}
              onChange={(event) => update('fullName', event.target.value)}
            />
            {flags.has('a11y') ? (
              <input
                data-testid="field-email"
                placeholder={t.email}
                autoComplete="email"
                inputMode="email"
                value={form.email}
                onChange={(event) => update('email', event.target.value)}
              />
            ) : (
              <>
                <label htmlFor="email">{t.email}</label>
                <input
                  id="email"
                  data-testid="field-email"
                  autoComplete="email"
                  inputMode="email"
                  value={form.email}
                  onChange={(event) => update('email', event.target.value)}
                />
              </>
            )}
            <label htmlFor="phone">{t.phone}</label>
            <input
              id="phone"
              data-testid="field-phone"
              autoComplete="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(event) => update('phone', event.target.value)}
            />
          </fieldset>

          <fieldset>
            <legend>{t.roleSection}</legend>
            <label htmlFor="role">{t.role}</label>
            <select id="role" data-testid="field-role" value={form.role} onChange={(event) => update('role', event.target.value)}>
              <option value="">{t.choose}</option>
              <option value="qa">{t.roles.qa}</option>
              <option value="designer">{t.roles.designer}</option>
              <option value="producer">{t.roles.producer}</option>
            </select>
            <p className="group-label" id="work-mode-label">
              {t.workMode}
            </p>
            <div role="radiogroup" aria-labelledby="work-mode-label" className="choices">
              <div className="choice">
                <input
                  id="work-remote"
                  data-testid="work-mode-remote"
                  type="radio"
                  name="workMode"
                  value="remote"
                  checked={form.workMode === 'remote'}
                  onChange={() => update('workMode', 'remote')}
                />
                <label htmlFor="work-remote">{t.remote}</label>
              </div>
              <div className="choice">
                <input
                  id="work-onsite"
                  data-testid="work-mode-onsite"
                  type="radio"
                  name="workMode"
                  value="onsite"
                  checked={form.workMode === 'onsite'}
                  onChange={() => update('workMode', 'onsite')}
                />
                <label htmlFor="work-onsite">{t.onsite}</label>
              </div>
            </div>
            {form.workMode === 'remote' && (
              <>
                <label htmlFor="timezone">{t.timezone}</label>
                <select
                  id="timezone"
                  data-testid="field-timezone"
                  value={form.timezone}
                  onChange={(event) => update('timezone', event.target.value)}
                >
                  <option value="">{t.choose}</option>
                  {Object.entries(t.timezones).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </>
            )}
            {form.workMode === 'onsite' && (
              <>
                <label htmlFor="office">{t.office}</label>
                <select id="office" data-testid="field-office" value={form.office} onChange={(event) => update('office', event.target.value)}>
                  <option value="">{t.choose}</option>
                  {Object.entries(t.offices).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </>
            )}
          </fieldset>

          <fieldset>
            <legend>{t.review}</legend>
            <label htmlFor="slot">{t.slot}</label>
            <select id="slot" data-testid="field-slot" value={form.slot} onChange={(event) => update('slot', event.target.value)}>
              <option value="">{t.choose}</option>
              {Object.entries(t.slots).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <label htmlFor="notes">{t.notes}</label>
            <textarea id="notes" data-testid="field-notes" value={form.notes} onChange={(event) => update('notes', event.target.value)} />
          </fieldset>

          {errors.length > 0 && (
            <div role="alert" data-testid="form-errors" className="errors">
              {errors.map((error, index) => (
                <p key={`${error}-${index}`}>{error}</p>
              ))}
            </div>
          )}

          <button type="submit" data-testid={submitTestId}>
            {t.submit}
          </button>
          {flags.has('a11y') && <button type="button" data-testid="unnamed-control" />}
        </form>
      </main>
      <footer>
        <p>{t.footer}</p>
      </footer>
    </>
  );
}
