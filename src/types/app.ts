import { lookupLabel } from '@/i18n';

// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Kundenverwaltung {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    street?: string;
    house_number?: string;
    postal_code?: string;
    city?: string;
    customer_since?: string; // Format: YYYY-MM-DD oder ISO String
    customer_status?: LookupValue;
    notes?: string;
  };
}

export interface Fahrerverwaltung {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    driver_first_name?: string;
    driver_last_name?: string;
    driver_phone?: string;
    driver_email?: string;
    vehicle_type?: LookupValue;
    delivery_zone?: string;
    driver_status?: LookupValue;
    work_start?: string;
    work_end?: string;
    driver_notes?: string;
  };
}

export interface Bestellverwaltung {
  record_id: string;
  /** The API field. */
  created_at: string;
  updated_at: string | null;
  /** Alias of created_at, filled by the read helpers. The API sends
   *  snake_case only — reading `createdat` off a raw record yields
   *  undefined, which type-checks and then crashes at runtime. */
  createdat: string;
  updatedat: string | null;
  fields: {
    fahrer?: string; // applookup -> URL zu 'Fahrerverwaltung' Record
    delivery_notes?: string;
    order_date?: string; // Format: YYYY-MM-DD oder ISO String
    ordered_items?: string;
    total_amount?: number;
    order_status?: LookupValue;
    payment_method?: LookupValue;
    desired_delivery_time?: string; // Format: YYYY-MM-DD oder ISO String
    delivery_street?: string;
    delivery_house_number?: string;
    delivery_postal_code?: string;
    kunde?: string; // applookup -> URL zu 'Kundenverwaltung' Record
    delivery_city?: string;
    delivery_location?: GeoLocation; // { lat, long, info }
  };
}

export const APP_IDS = {
  KUNDENVERWALTUNG: '6a756e49599907d7a527484c',
  FAHRERVERWALTUNG: '6a756e4e20b6941460b32623',
  BESTELLVERWALTUNG: '6a756e4f08a2683e821e7c1c',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'kundenverwaltung': {
    customer_status: [{ key: "aktiv", get label() { return lookupLabel('kundenverwaltung', 'customer_status', "aktiv") ?? "Aktiv"; } }, { key: "inaktiv", get label() { return lookupLabel('kundenverwaltung', 'customer_status', "inaktiv") ?? "Inaktiv"; } }, { key: "gesperrt", get label() { return lookupLabel('kundenverwaltung', 'customer_status', "gesperrt") ?? "Gesperrt"; } }],
  },
  'fahrerverwaltung': {
    vehicle_type: [{ key: "fahrrad", get label() { return lookupLabel('fahrerverwaltung', 'vehicle_type', "fahrrad") ?? "Fahrrad"; } }, { key: "e_bike", get label() { return lookupLabel('fahrerverwaltung', 'vehicle_type', "e_bike") ?? "E-Bike"; } }, { key: "motorroller", get label() { return lookupLabel('fahrerverwaltung', 'vehicle_type', "motorroller") ?? "Motorroller"; } }, { key: "pkw", get label() { return lookupLabel('fahrerverwaltung', 'vehicle_type', "pkw") ?? "PKW"; } }, { key: "transporter", get label() { return lookupLabel('fahrerverwaltung', 'vehicle_type', "transporter") ?? "Transporter"; } }],
    driver_status: [{ key: "verfuegbar", get label() { return lookupLabel('fahrerverwaltung', 'driver_status', "verfuegbar") ?? "Verfügbar"; } }, { key: "im_einsatz", get label() { return lookupLabel('fahrerverwaltung', 'driver_status', "im_einsatz") ?? "Im Einsatz"; } }, { key: "nicht_verfuegbar", get label() { return lookupLabel('fahrerverwaltung', 'driver_status', "nicht_verfuegbar") ?? "Nicht verfügbar"; } }, { key: "inaktiv", get label() { return lookupLabel('fahrerverwaltung', 'driver_status', "inaktiv") ?? "Inaktiv"; } }],
  },
  'bestellverwaltung': {
    order_status: [{ key: "neu", get label() { return lookupLabel('bestellverwaltung', 'order_status', "neu") ?? "Neu"; } }, { key: "in_bearbeitung", get label() { return lookupLabel('bestellverwaltung', 'order_status', "in_bearbeitung") ?? "In Bearbeitung"; } }, { key: "bereit_zur_lieferung", get label() { return lookupLabel('bestellverwaltung', 'order_status', "bereit_zur_lieferung") ?? "Bereit zur Lieferung"; } }, { key: "unterwegs", get label() { return lookupLabel('bestellverwaltung', 'order_status', "unterwegs") ?? "Unterwegs"; } }, { key: "geliefert", get label() { return lookupLabel('bestellverwaltung', 'order_status', "geliefert") ?? "Geliefert"; } }, { key: "storniert", get label() { return lookupLabel('bestellverwaltung', 'order_status', "storniert") ?? "Storniert"; } }],
    payment_method: [{ key: "bar", get label() { return lookupLabel('bestellverwaltung', 'payment_method', "bar") ?? "Barzahlung bei Lieferung"; } }, { key: "ec_karte", get label() { return lookupLabel('bestellverwaltung', 'payment_method', "ec_karte") ?? "EC-Karte bei Lieferung"; } }, { key: "paypal", get label() { return lookupLabel('bestellverwaltung', 'payment_method', "paypal") ?? "PayPal"; } }, { key: "ueberweisung", get label() { return lookupLabel('bestellverwaltung', 'payment_method', "ueberweisung") ?? "Überweisung"; } }, { key: "kreditkarte", get label() { return lookupLabel('bestellverwaltung', 'payment_method', "kreditkarte") ?? "Kreditkarte"; } }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'kundenverwaltung': {
    'first_name': 'string/text',
    'last_name': 'string/text',
    'email': 'string/email',
    'phone': 'string/tel',
    'street': 'string/text',
    'house_number': 'string/text',
    'postal_code': 'string/text',
    'city': 'string/text',
    'customer_since': 'date/date',
    'customer_status': 'lookup/select',
    'notes': 'string/textarea',
  },
  'fahrerverwaltung': {
    'driver_first_name': 'string/text',
    'driver_last_name': 'string/text',
    'driver_phone': 'string/tel',
    'driver_email': 'string/email',
    'vehicle_type': 'lookup/select',
    'delivery_zone': 'string/text',
    'driver_status': 'lookup/select',
    'work_start': 'string/text',
    'work_end': 'string/text',
    'driver_notes': 'string/textarea',
  },
  'bestellverwaltung': {
    'fahrer': 'applookup/select',
    'delivery_notes': 'string/textarea',
    'order_date': 'date/datetimeminute',
    'ordered_items': 'string/textarea',
    'total_amount': 'number',
    'order_status': 'lookup/select',
    'payment_method': 'lookup/select',
    'desired_delivery_time': 'date/datetimeminute',
    'delivery_street': 'string/text',
    'delivery_house_number': 'string/text',
    'delivery_postal_code': 'string/text',
    'kunde': 'applookup/select',
    'delivery_city': 'string/text',
    'delivery_location': 'geo',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateKundenverwaltung = StripLookup<Kundenverwaltung['fields']>;
export type CreateFahrerverwaltung = StripLookup<Fahrerverwaltung['fields']>;
export type CreateBestellverwaltung = StripLookup<Bestellverwaltung['fields']>;