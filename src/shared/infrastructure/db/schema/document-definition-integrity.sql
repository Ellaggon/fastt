CREATE FUNCTION fastt_document_definition_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'draft' THEN
    IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'status') IS DISTINCT FROM (to_jsonb(OLD) - 'status')
      OR NOT (NEW.status = OLD.status OR (OLD.status = 'published' AND NEW.status = 'retired')) THEN
      RAISE EXCEPTION 'document_definition_immutable';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_definition_immutable BEFORE UPDATE OR DELETE ON "DocumentDefinitionVersion"
FOR EACH ROW EXECUTE FUNCTION fastt_document_definition_immutable();

CREATE FUNCTION fastt_document_reference_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE predecessor "ProviderDocument"%ROWTYPE;
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status IN ('verified','superseded') AND
    (NEW."definitionVersionId", NEW."subjectType", NEW."subjectReference", NEW."providerId", NEW."fileUrl", NEW."replacesDocumentId")
    IS DISTINCT FROM
    (OLD."definitionVersionId", OLD."subjectType", OLD."subjectReference", OLD."providerId", OLD."fileUrl", OLD."replacesDocumentId") THEN
    RAISE EXCEPTION 'reviewed_document_identity_immutable';
  END IF;
  IF NEW."definitionVersionId" IS NOT NULL AND (TG_OP = 'INSERT' OR NEW."definitionVersionId" IS DISTINCT FROM OLD."definitionVersionId") THEN
    PERFORM 1 FROM "DocumentDefinitionVersion" WHERE id = NEW."definitionVersionId" AND status = 'published' FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'document_definition_not_published'; END IF;
  END IF;
  IF NEW."replacesDocumentId" IS NOT NULL THEN
    IF NEW.id = NEW."replacesDocumentId" THEN RAISE EXCEPTION 'document_replacement_cycle'; END IF;
    IF TG_OP = 'UPDATE' AND NEW."replacesDocumentId" IS DISTINCT FROM OLD."replacesDocumentId" THEN
      RAISE EXCEPTION 'document_predecessor_immutable';
    END IF;
    SELECT * INTO predecessor FROM "ProviderDocument" WHERE id = NEW."replacesDocumentId" FOR UPDATE;
    IF NOT FOUND OR predecessor."providerId" <> NEW."providerId" OR predecessor.type <> NEW.type
      OR predecessor."subjectType" <> NEW."subjectType"
      OR predecessor."subjectReference" IS DISTINCT FROM NEW."subjectReference"
      OR predecessor."definitionVersionId" IS DISTINCT FROM NEW."definitionVersionId" THEN
      RAISE EXCEPTION 'invalid_document_replacement';
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER document_reference_guard BEFORE INSERT OR UPDATE ON "ProviderDocument"
FOR EACH ROW EXECUTE FUNCTION fastt_document_reference_guard();
