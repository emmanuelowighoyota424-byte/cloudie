CREATE TABLE "RealtimeEvent" (
  "id" BIGSERIAL PRIMARY KEY,
  "eventType" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "userId" TEXT,
  "workspaceId" TEXT,
  "payload" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RealtimeEvent_createdAt_idx" ON "RealtimeEvent"("createdAt");
CREATE INDEX "RealtimeEvent_userId_id_idx" ON "RealtimeEvent"("userId","id");
CREATE INDEX "RealtimeEvent_workspaceId_id_idx" ON "RealtimeEvent"("workspaceId","id");
CREATE INDEX "RealtimeEvent_eventType_id_idx" ON "RealtimeEvent"("eventType","id");

CREATE TABLE "RealtimeTicket" (
  "id" TEXT PRIMARY KEY,
  "tokenHash" TEXT NOT NULL UNIQUE,
  "sessionId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "workspaceId" TEXT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "RealtimeTicket_expiresAt_idx" ON "RealtimeTicket"("expiresAt");
CREATE INDEX "RealtimeTicket_sessionId_idx" ON "RealtimeTicket"("sessionId");

CREATE OR REPLACE FUNCTION cloudie_emit_realtime_event() RETURNS trigger AS $$
DECLARE
  row_json jsonb;
  user_id_value text;
  workspace_id_value text;
  event_name text := TG_ARGV[0];
  entity_name text := TG_ARGV[1];
BEGIN
  row_json := to_jsonb(NEW);
  user_id_value := NULLIF(row_json->>'userId', '');
  workspace_id_value := NULLIF(row_json->>'workspaceId', '');

  IF TG_OP = 'UPDATE' AND event_name = 'AUTO_STATUS' THEN
    IF COALESCE(to_jsonb(OLD)->>'status','') = COALESCE(row_json->>'status','') THEN RETURN NEW; END IF;
    event_name := TG_ARGV[2];
  ELSIF event_name = 'AUTO' THEN
    event_name := TG_ARGV[2];
  END IF;

  INSERT INTO "RealtimeEvent"("eventType","entityType","entityId","userId","workspaceId","payload")
  VALUES (event_name, entity_name, COALESCE(row_json->>'id', row_json->>'shipmentId'), user_id_value, workspace_id_value,
          jsonb_build_object('operation', TG_OP));
  PERFORM pg_notify('cloudie_realtime', 'event');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cloudie_emit_shipment_event() RETURNS trigger AS $$
DECLARE
  shipment_row jsonb;
BEGIN
  SELECT to_jsonb(s) INTO shipment_row FROM "Shipment" s WHERE s.id = NEW."shipmentId";
  INSERT INTO "RealtimeEvent"("eventType","entityType","entityId","userId","workspaceId","payload")
  VALUES ('SHIPMENT_EVENT_CREATED','ShipmentEvent',NEW.id,shipment_row->>'customerId',shipment_row->>'workspaceId',jsonb_build_object('operation','INSERT'));
  PERFORM pg_notify('cloudie_realtime', 'event');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION cloudie_emit_order_message_event() RETURNS trigger AS $$
DECLARE
  conversation_row jsonb;
BEGIN
  SELECT to_jsonb(c) INTO conversation_row FROM "OrderChatConversation" c WHERE c.id = NEW."conversationId";
  INSERT INTO "RealtimeEvent"("eventType","entityType","entityId","userId","workspaceId","payload")
  VALUES ('ORDER_MESSAGE_CREATED','OrderChatMessage',NEW.id,NULL,conversation_row->>'workspaceId',jsonb_build_object('operation','INSERT'));
  PERFORM pg_notify('cloudie_realtime', 'event');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE "OrderChatConversation" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL UNIQUE,
  "workspaceId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OrderChatConversation_workspaceId_idx" ON "OrderChatConversation"("workspaceId");
CREATE TABLE "OrderChatParticipant" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "lastReadAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderChatParticipant_conversationId_userId_key" UNIQUE ("conversationId","userId")
);
CREATE INDEX "OrderChatParticipant_userId_idx" ON "OrderChatParticipant"("userId");
CREATE TABLE "OrderChatMessage" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "clientMessageId" TEXT NOT NULL UNIQUE,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "OrderChatMessage_conversationId_createdAt_idx" ON "OrderChatMessage"("conversationId","createdAt");
CREATE INDEX "OrderChatMessage_senderId_idx" ON "OrderChatMessage"("senderId");

CREATE TRIGGER realtime_point_ledger AFTER INSERT ON "PointLedger" FOR EACH ROW EXECUTE FUNCTION cloudie_emit_realtime_event('POINT_LEDGER_CREATED','PointLedger');
CREATE TRIGGER realtime_notification AFTER INSERT ON "Notification" FOR EACH ROW EXECUTE FUNCTION cloudie_emit_realtime_event('NOTIFICATION_CREATED','Notification');
CREATE TRIGGER realtime_shipment_created AFTER INSERT ON "Shipment" FOR EACH ROW EXECUTE FUNCTION cloudie_emit_realtime_event('SHIPMENT_CREATED','Shipment');
CREATE TRIGGER realtime_shipment_status AFTER UPDATE ON "Shipment" FOR EACH ROW EXECUTE FUNCTION cloudie_emit_realtime_event('AUTO_STATUS','Shipment','SHIPMENT_STATUS_CHANGED');
CREATE TRIGGER realtime_shipment_event AFTER INSERT ON "ShipmentEvent" FOR EACH ROW EXECUTE FUNCTION cloudie_emit_shipment_event();
CREATE TRIGGER realtime_order AFTER INSERT OR UPDATE ON "Order" FOR EACH ROW EXECUTE FUNCTION cloudie_emit_realtime_event('AUTO','Order','ORDER_UPDATED');
CREATE TRIGGER realtime_payment AFTER INSERT OR UPDATE ON "Payment" FOR EACH ROW EXECUTE FUNCTION cloudie_emit_realtime_event('PAYMENT_UPDATED','Payment');
CREATE TRIGGER realtime_crypto AFTER INSERT OR UPDATE ON "CryptoDeposit" FOR EACH ROW EXECUTE FUNCTION cloudie_emit_realtime_event('CRYPTO_DEPOSIT_UPDATED','CryptoDeposit');
CREATE TRIGGER realtime_referral AFTER INSERT OR UPDATE ON "Referral" FOR EACH ROW EXECUTE FUNCTION cloudie_emit_realtime_event('REFERRAL_REWARD_CREATED','Referral');
CREATE TRIGGER realtime_tenant AFTER INSERT OR UPDATE ON "TenantProfile" FOR EACH ROW EXECUTE FUNCTION cloudie_emit_realtime_event('TENANT_UPDATED','TenantProfile');
CREATE TRIGGER realtime_kyc AFTER INSERT OR UPDATE ON "KYCVerification" FOR EACH ROW EXECUTE FUNCTION cloudie_emit_realtime_event('KYC_STATUS_CHANGED','KYCVerification');
CREATE TRIGGER realtime_document AFTER INSERT OR UPDATE ON "Document" FOR EACH ROW EXECUTE FUNCTION cloudie_emit_realtime_event('DOCUMENT_UPDATED','Document');
CREATE TRIGGER realtime_order_chat AFTER INSERT ON "OrderChatMessage" FOR EACH ROW EXECUTE FUNCTION cloudie_emit_order_message_event();
