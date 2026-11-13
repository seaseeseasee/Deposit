-- Ward Deposit & Financial Management System
-- PostgreSQL 15+ DRAFT FOR REVIEW. Not executed anywhere.
-- Principles: append-only ledger, per-admission balances, ward-scoped access, full audit.

CREATE EXTENSION IF NOT EXISTS citext;

-- ---------- Enums ----------
CREATE TYPE user_role        AS ENUM ('staff','manager','admin');
CREATE TYPE submission_status AS ENUM ('pending','verified','rejected','duplicate');
CREATE TYPE admission_status AS ENUM ('active','transferred','discharged');
CREATE TYPE txn_type         AS ENUM ('deposit','expense','deduction','adjustment','reversal','refund','transfer_out','transfer_in');
CREATE TYPE txn_direction    AS ENUM ('credit','debit');
CREATE TYPE approval_status  AS ENUM ('pending','approved','rejected');
CREATE TYPE expense_status   AS ENUM ('pending_approval','approved','rejected');

-- ---------- Core ----------
CREATE TABLE wards (
  id             bigserial PRIMARY KEY,
  code           text NOT NULL UNIQUE,
  slug           text NOT NULL UNIQUE,          -- used in /ward/deposit/{slug}
  name           text NOT NULL,
  hospital_name  text NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ward_bank_accounts (
  id             bigserial PRIMARY KEY,
  ward_id        bigint NOT NULL REFERENCES wards(id),
  bank_name      text NOT NULL,
  account_name   text NOT NULL,
  account_no     text NOT NULL,
  qr_image_path  text,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
-- one active account per ward for now; drop this index to allow several later
CREATE UNIQUE INDEX uq_ward_active_account ON ward_bank_accounts(ward_id) WHERE is_active;

CREATE TABLE users (
  id             bigserial PRIMARY KEY,
  username       citext NOT NULL UNIQUE,
  password_hash  text NOT NULL,
  full_name      text NOT NULL,
  role           user_role NOT NULL,
  is_active      boolean NOT NULL DEFAULT true,
  last_login_at  timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_ward_permissions (
  user_id        bigint NOT NULL REFERENCES users(id),
  ward_id        bigint NOT NULL REFERENCES wards(id),
  role_in_ward   user_role NOT NULL CHECK (role_in_ward IN ('staff','manager')),
  PRIMARY KEY (user_id, ward_id)
);

CREATE TABLE patients (
  id             bigserial PRIMARY KEY,
  hn             text UNIQUE,                    -- optional
  full_name      text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE patient_admissions (
  id                  bigserial PRIMARY KEY,
  patient_id          bigint NOT NULL REFERENCES patients(id),
  ward_id             bigint NOT NULL REFERENCES wards(id),
  bed_no              text,
  admitted_at         timestamptz NOT NULL DEFAULT now(),
  discharged_at       timestamptz,
  status              admission_status NOT NULL DEFAULT 'active',
  transferred_from_id bigint REFERENCES patient_admissions(id),
  CHECK (status <> 'discharged' OR discharged_at IS NOT NULL)
);
CREATE UNIQUE INDEX uq_one_active_admission ON patient_admissions(patient_id) WHERE status = 'active';
CREATE INDEX ix_adm_ward ON patient_admissions(ward_id, status);

-- ---------- Public deposit submissions ----------
CREATE TABLE deposit_submissions (
  id                  bigserial PRIMARY KEY,
  ref_no              text NOT NULL UNIQUE,      -- e.g. WA-261113-0042
  ward_id             bigint NOT NULL REFERENCES wards(id),
  patient_name_input  text NOT NULL,
  hn_input            text,
  payer_name          text NOT NULL,
  amount              numeric(12,2) NOT NULL CHECK (amount > 0),
  transfer_at         timestamptz NOT NULL,
  phone               text,
  note                text,
  status              submission_status NOT NULL DEFAULT 'pending',
  duplicate_of_id     bigint REFERENCES deposit_submissions(id),
  admission_id        bigint REFERENCES patient_admissions(id),   -- set by staff on verify
  reviewed_by         bigint REFERENCES users(id),
  reviewed_at         timestamptz,
  reject_reason       text,
  client_ip           inet,
  created_at          timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'rejected' OR reject_reason IS NOT NULL),
  CHECK (status <> 'verified' OR (admission_id IS NOT NULL AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL))
);
CREATE INDEX ix_sub_queue  ON deposit_submissions(ward_id, status, created_at DESC);
CREATE INDEX ix_sub_dupkey ON deposit_submissions(ward_id, amount, transfer_at);

CREATE TABLE deposit_slips (
  id             bigserial PRIMARY KEY,
  submission_id  bigint NOT NULL REFERENCES deposit_submissions(id),
  storage_path   text NOT NULL,                  -- private storage, never public URL
  sha256         char(64) NOT NULL,
  mime           text NOT NULL CHECK (mime IN ('image/jpeg','image/png','image/webp')),
  size_bytes     integer NOT NULL CHECK (size_bytes BETWEEN 1 AND 5242880)
);
CREATE INDEX ix_slip_hash ON deposit_slips(sha256);

-- ---------- Expenses ----------
CREATE TABLE expense_categories (
  id                bigserial PRIMARY KEY,
  name              text NOT NULL UNIQUE,
  requires_approval boolean NOT NULL DEFAULT false,   -- true for property damage
  is_active         boolean NOT NULL DEFAULT true
);

CREATE TABLE expense_records (
  id               bigserial PRIMARY KEY,
  admission_id     bigint NOT NULL REFERENCES patient_admissions(id),
  ward_id          bigint NOT NULL REFERENCES wards(id),
  category_id      bigint NOT NULL REFERENCES expense_categories(id),
  spent_at         date NOT NULL,
  description      text NOT NULL,
  amount           numeric(12,2) NOT NULL CHECK (amount > 0),
  evidence_path    text,
  note             text,
  incident_detail  text,                          -- required when category requires approval
  status           expense_status NOT NULL DEFAULT 'approved',
  created_by       bigint NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- ---------- Ledger (append-only) ----------
CREATE SEQUENCE txn_no_seq;

CREATE TABLE financial_transactions (
  id                    bigserial PRIMARY KEY,
  txn_no                text NOT NULL UNIQUE DEFAULT ('TX-' || lpad(nextval('txn_no_seq')::text, 8, '0')),
  admission_id          bigint NOT NULL REFERENCES patient_admissions(id),
  ward_id               bigint NOT NULL REFERENCES wards(id),
  type                  txn_type NOT NULL,
  direction             txn_direction NOT NULL,
  amount                numeric(12,2) NOT NULL CHECK (amount > 0),
  occurred_at           timestamptz NOT NULL DEFAULT now(),
  source_submission_id  bigint UNIQUE REFERENCES deposit_submissions(id),  -- prevents double-confirm
  source_expense_id     bigint UNIQUE REFERENCES expense_records(id),
  reverses_txn_id       bigint UNIQUE REFERENCES financial_transactions(id), -- a txn can be reversed once
  note                  text,
  created_by            bigint NOT NULL REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (type <> 'deposit' OR source_submission_id IS NOT NULL),
  CHECK (type NOT IN ('expense','deduction') OR source_expense_id IS NOT NULL),
  CHECK (type <> 'reversal' OR reverses_txn_id IS NOT NULL)
);
CREATE INDEX ix_txn_adm  ON financial_transactions(admission_id, occurred_at);
CREATE INDEX ix_txn_ward ON financial_transactions(ward_id, occurred_at);

CREATE FUNCTION forbid_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION '% on % is not allowed (append-only)', TG_OP, TG_TABLE_NAME; END $$;

CREATE TRIGGER trg_txn_immutable BEFORE UPDATE OR DELETE ON financial_transactions
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

-- Reject debits that would take the admission balance below zero.
CREATE FUNCTION check_no_negative_balance() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE bal numeric;
BEGIN
  IF NEW.direction = 'debit' THEN
    PERFORM pg_advisory_xact_lock(NEW.admission_id);      -- serialize per admission
    SELECT COALESCE(SUM(CASE direction WHEN 'credit' THEN amount ELSE -amount END),0)
      INTO bal FROM financial_transactions WHERE admission_id = NEW.admission_id;
    IF bal - NEW.amount < 0 THEN
      RAISE EXCEPTION 'insufficient balance for admission %', NEW.admission_id;
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_no_negative BEFORE INSERT ON financial_transactions
  FOR EACH ROW EXECUTE FUNCTION check_no_negative_balance();

-- ---------- Adjustments & approvals ----------
CREATE TABLE transaction_adjustments (
  id               bigserial PRIMARY KEY,
  original_txn_id  bigint NOT NULL REFERENCES financial_transactions(id),
  kind             text NOT NULL CHECK (kind IN ('void','adjust')),
  direction        txn_direction,                 -- for 'adjust'
  amount           numeric(12,2) CHECK (amount > 0),
  reason           text NOT NULL,
  status           approval_status NOT NULL DEFAULT 'pending',
  result_txn_id    bigint UNIQUE REFERENCES financial_transactions(id),
  requested_by     bigint NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'adjust' OR (direction IS NOT NULL AND amount IS NOT NULL))
);

CREATE TABLE approvals (
  id             bigserial PRIMARY KEY,
  target_type    text NOT NULL CHECK (target_type IN ('expense_record','transaction_adjustment')),
  target_id      bigint NOT NULL,
  ward_id        bigint NOT NULL REFERENCES wards(id),
  status         approval_status NOT NULL DEFAULT 'pending',
  requested_by   bigint NOT NULL REFERENCES users(id),
  decided_by     bigint REFERENCES users(id),
  decided_at     timestamptz,
  comment        text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (decided_by IS NULL OR decided_by <> requested_by),   -- no self-approval
  CHECK (status = 'pending' OR decided_by IS NOT NULL)
);
CREATE INDEX ix_appr_pending ON approvals(ward_id, status);

-- ---------- Audit & settings ----------
CREATE TABLE audit_logs (
  id           bigserial PRIMARY KEY,
  user_id      bigint REFERENCES users(id),      -- NULL for public (relative) actions
  ward_id      bigint REFERENCES wards(id),
  action       text NOT NULL,
  entity_type  text NOT NULL,
  entity_id    bigint,
  before_json  jsonb,
  after_json   jsonb,
  ip           inet,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX ix_audit_ward   ON audit_logs(ward_id, created_at DESC);
CREATE TRIGGER trg_audit_immutable BEFORE UPDATE OR DELETE ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();

CREATE TABLE system_settings (
  key         text PRIMARY KEY,
  value_json  jsonb NOT NULL,
  updated_by  bigint REFERENCES users(id),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
INSERT INTO system_settings(key, value_json) VALUES
  ('require_hn', 'false'),
  ('allow_negative_balance', 'false'),
  ('data_retention_years', 'null');   -- set per hospital policy / PDPA

-- ---------- Balance view ----------
-- A reversal is counted against the category of the transaction it reverses,
-- so deposited/spent/deducted stay correct after voids.
CREATE VIEW v_admission_balance AS
WITH eff AS (
  SELECT t.admission_id,
         COALESCE(o.type, t.type) AS eff_type,
         CASE WHEN t.type = 'reversal' THEN -o.amount ELSE t.amount END AS eff_amount,
         CASE t.direction WHEN 'credit' THEN t.amount ELSE -t.amount END AS signed
  FROM financial_transactions t
  LEFT JOIN financial_transactions o ON o.id = t.reverses_txn_id
)
SELECT a.id AS admission_id, a.patient_id, a.ward_id,
  COALESCE(SUM(e.eff_amount) FILTER (WHERE e.eff_type IN ('deposit','transfer_in')),0) AS total_deposited,
  COALESCE(SUM(e.eff_amount) FILTER (WHERE e.eff_type = 'expense'),0)                  AS total_spent,
  COALESCE(SUM(e.eff_amount) FILTER (WHERE e.eff_type = 'deduction'),0)                AS total_deducted,
  COALESCE(SUM(e.signed),0)                                                            AS balance
FROM patient_admissions a
LEFT JOIN eff e ON e.admission_id = a.id
GROUP BY a.id;

-- ---------- Row-Level Security (defence in depth for ward isolation) ----------
-- The app sets, per transaction:  SET LOCAL app.is_admin = '1'   OR
--                                 SET LOCAL app.ward_ids = '1,2'
-- The app must connect as a NON-owner role (owners bypass RLS unless FORCE is used).
CREATE FUNCTION app_can_see_ward(w bigint) RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT COALESCE(current_setting('app.is_admin', true), '') = '1'
      OR w = ANY (string_to_array(NULLIF(current_setting('app.ward_ids', true), ''), ',')::bigint[])
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['patient_admissions','deposit_submissions','financial_transactions',
                           'expense_records','approvals','audit_logs']
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY ward_scope ON %I USING (app_can_see_ward(ward_id)) WITH CHECK (app_can_see_ward(ward_id))', t);
  END LOOP;
END $$;

-- ---------- Sessions (login) ----------
CREATE TABLE sessions (
  token_hash  char(64) PRIMARY KEY,               -- sha256 of the cookie token; raw token is never stored
  user_id     bigint NOT NULL REFERENCES users(id),
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ix_sessions_expires ON sessions(expires_at);

-- Run the view with the caller's privileges so Row-Level Security applies to it as well.
ALTER VIEW v_admission_balance SET (security_invoker = true);
