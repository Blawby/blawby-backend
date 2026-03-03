-- Migration: Invoice Billing Improvements
-- Priority 2: Track invoiced status on time entries & expenses
ALTER TABLE matter_time_entries
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMP WITH TIME ZONE;

ALTER TABLE matter_expenses
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_time_entries_invoice_id ON matter_time_entries(invoice_id);
CREATE INDEX IF NOT EXISTS idx_time_entries_unbilled ON matter_time_entries(matter_id)
  WHERE invoice_id IS NULL AND billable = true;

CREATE INDEX IF NOT EXISTS idx_expenses_invoice_id ON matter_expenses(invoice_id);
CREATE INDEX IF NOT EXISTS idx_expenses_unbilled ON matter_expenses(matter_id)
  WHERE invoice_id IS NULL AND billable = true;

-- Priority 4: Trust transactions ledger
CREATE TABLE IF NOT EXISTS trust_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  client_id UUID NOT NULL REFERENCES user_details(id),
  matter_id UUID REFERENCES matters(id),
  transaction_type VARCHAR(50) NOT NULL
    CHECK (transaction_type IN ('deposit', 'withdrawal', 'transfer', 'refund')),
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  description TEXT,
  source VARCHAR(100),
  invoice_id UUID REFERENCES invoices(id),
  stripe_payment_intent_id VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_trust_transactions_client ON trust_transactions(client_id);
CREATE INDEX IF NOT EXISTS idx_trust_transactions_matter ON trust_transactions(matter_id);
CREATE INDEX IF NOT EXISTS idx_trust_transactions_invoice ON trust_transactions(invoice_id);
CREATE INDEX IF NOT EXISTS idx_trust_transactions_org ON trust_transactions(organization_id);

-- Priority 5: Milestone-invoice linking
ALTER TABLE matter_milestones
  ADD COLUMN IF NOT EXISTS invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoiced_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_matter_milestones_invoice_id ON matter_milestones(invoice_id);

-- Priority 6: Stripe invoice number sync
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS stripe_invoice_number VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_charge_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_transfer_id VARCHAR(255);

ALTER TABLE invoices
  ALTER COLUMN invoice_number DROP NOT NULL;

-- Remove the unique constraint that includes invoice_number (it was NOT NULL before)
DROP INDEX IF EXISTS invoices_org_number_unique_idx;

-- Re-add as partial unique index (only enforce uniqueness when invoice_number is not null)
CREATE UNIQUE INDEX IF NOT EXISTS invoices_org_number_unique_idx
  ON invoices(organization_id, invoice_number)
  WHERE invoice_number IS NOT NULL AND deleted_at IS NULL;

-- Priority 10: Refund requests table
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  invoice_id UUID NOT NULL REFERENCES invoices(id),
  client_user_details_id UUID NOT NULL REFERENCES user_details(id),
  requested_amount INTEGER NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'usd',
  reason TEXT NOT NULL,
  notes TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'approved', 'rejected', 'executed', 'failed', 'cancelled')),
  stripe_refund_id VARCHAR(255),
  stripe_payment_intent_id VARCHAR(255),
  executed_amount INTEGER,
  executed_at TIMESTAMP WITH TIME ZONE,
  executed_by_user_id UUID REFERENCES users(id),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  reviewed_by_user_id UUID REFERENCES users(id),
  review_notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_org ON refund_requests(organization_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_invoice ON refund_requests(invoice_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_client ON refund_requests(client_user_details_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
