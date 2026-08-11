import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'kunde',
    'fahrer',
    'order_date',
    'desired_delivery_time',
    'ordered_items',
    'order_status',
    'total_amount',
    'payment_method',
    { row: ['delivery_street', 'delivery_house_number'], cols: '2fr 1fr' },
    { row: ['delivery_postal_code', 'delivery_city'], cols: '1fr 2fr' },
    'delivery_notes',
  ],
  defaults: {
    'order_date': { kind: 'today', withTime: true },
    'order_status': { kind: 'lookup', key: 'neu', label: 'Neu' },
    'desired_delivery_time': { kind: 'todayOffset', days: 1, withTime: true },
    'payment_method': { kind: 'lookup', key: 'bar', label: 'Barzahlung bei Lieferung' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};

export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
