import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'first_name',
    'last_name',
    'email',
    'phone',
    { row: ['street', 'house_number'], cols: '2fr 1fr' },
    { row: ['postal_code', 'city'], cols: '1fr 2fr' },
    'customer_since',
    'customer_status',
    'notes',
  ],
  defaults: {
    'customer_since': { kind: 'today' },
    'customer_status': { kind: 'lookup', key: 'aktiv', label: 'Aktiv' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, { lookupKey: string }[]> = {};
