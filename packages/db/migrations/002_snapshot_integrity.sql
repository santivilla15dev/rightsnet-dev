CREATE FUNCTION protect_order_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF NEW.quote_id<>OLD.quote_id OR NEW.organization_id<>OLD.organization_id OR NEW.asset_id<>OLD.asset_id OR NEW.price<>OLD.price OR NEW.scope<>OLD.scope OR NEW.policy_snapshot<>OLD.policy_snapshot OR NEW.contract_text<>OLD.contract_text OR NEW.contract_hash<>OLD.contract_hash OR NEW.expires_at<>OLD.expires_at THEN RAISE EXCEPTION 'Order snapshot is immutable'; END IF;
IF OLD.accepted_at IS NOT NULL AND (NEW.accepted_at IS DISTINCT FROM OLD.accepted_at OR NEW.accepted_by IS DISTINCT FROM OLD.accepted_by) THEN RAISE EXCEPTION 'Acceptance is immutable'; END IF;
RETURN NEW; END $$;
CREATE TRIGGER protect_order BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION protect_order_snapshot();
CREATE FUNCTION protect_license_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
IF NEW.order_id<>OLD.order_id OR NEW.public_token<>OLD.public_token OR NEW.starts_at<>OLD.starts_at OR NEW.ends_at<>OLD.ends_at OR NEW.payload<>OLD.payload OR NEW.signature<>OLD.signature OR NEW.key_id<>OLD.key_id THEN RAISE EXCEPTION 'License snapshot is immutable'; END IF;
RETURN NEW; END $$;
CREATE TRIGGER protect_license BEFORE UPDATE ON licenses FOR EACH ROW EXECUTE FUNCTION protect_license_snapshot();
CREATE TRIGGER prevent_order_delete BEFORE DELETE ON orders FOR EACH ROW EXECUTE FUNCTION reject_evidence_mutation();
CREATE TRIGGER prevent_license_delete BEFORE DELETE ON licenses FOR EACH ROW EXECUTE FUNCTION reject_evidence_mutation();
