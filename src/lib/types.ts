// Hand-maintained row types for the Phase 1 schema. Swap for generated
// Supabase types once a live project is wired up.

export type InvoiceStatus =
  | "processing"
  | "needs_review"
  | "partial"
  | "confirmed"
  | "failed";

export interface InvoiceRow {
  id: string;
  business_id: string;
  vendor_id: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  total_cents: number | null;
  status: InvoiceStatus;
  uploaded_by: string | null;
  file_paths: string[];
  extraction_model: string | null;
  extraction_confidence: number | null;
  header_confidence: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface VendorRow {
  id: string;
  business_id: string;
  name: string;
  normalized_name: string;
  created_at: string;
}

export interface InvoiceListItem extends InvoiceRow {
  vendor: Pick<VendorRow, "name"> | null;
  line_count: number;
}

export interface InvoiceLineRow {
  id: string;
  business_id: string;
  invoice_id: string;
  product_id: string | null;
  raw_text: string | null;
  barcode: string | null;
  name: string | null;
  quantity: number | null;
  unit_cost_cents: number | null;
  line_total_cents: number | null;
  confidence: Record<string, number>;
  illegible: boolean;
  created_at: string;
}
