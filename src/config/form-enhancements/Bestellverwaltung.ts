import type { FormEnhancements } from './types';

export const formEnhancements: FormEnhancements = {
  fieldOrder: [
    'kunde',
    { row: ['order_date', 'desired_delivery_time'] },
    'fahrer',
    'ordered_items',
    'total_amount',
    'order_status',
    'payment_method',
    { row: ['delivery_street', 'delivery_house_number'], cols: '2fr 1fr' },
    { row: ['delivery_postal_code', 'delivery_city'], cols: '1fr 2fr' },
    'delivery_notes',
  ],
  defaults: {
    'order_date': { kind: 'today', withTime: true },
    'desired_delivery_time': { kind: 'todayOffset', days: 1, withTime: true },
    'order_status': { kind: 'lookup', key: 'neu', label: 'Neu' },
  },
  computed: {},
};

export const computedDeps: Record<string, string[]> = {};
export const computedApplookupRefs: Record<string, {lookupKey: string}[]> = {};
