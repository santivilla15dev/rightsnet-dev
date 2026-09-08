-- Allow employee membership role (Ops org-member L1 + company-setup UI)
ALTER TABLE organization_members DROP CONSTRAINT IF EXISTS organization_members_role_check;
ALTER TABLE organization_members
  ADD CONSTRAINT organization_members_role_check
  CHECK (role IN ('owner', 'employee', 'buyer', 'viewer'));
