import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'kunde',
    'order_date',
    'ordered_items',
    'total_amount',
    { row: ['delivery_street', 'delivery_house_number'], cols: '2fr 1fr' },
    { row: ['delivery_postal_code', 'delivery_city'], cols: '1fr 2fr' },
    'order_status',
    'payment_method',
    'desired_delivery_time',
    'fahrer',
    'delivery_notes',
  ],
  defaults: {
    'order_date': { kind: 'today', withTime: true },
    'order_status': { kind: 'lookup', key: 'neu', label: 'Neu' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};

export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
