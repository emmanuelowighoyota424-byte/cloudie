INSERT INTO "PointPricingRule" ("id","workspaceId","action","pointCost","enabled","createdById","reason")
SELECT 'system-pricing-ticket-flight',NULL,'ticketing.flight_pdf',10,TRUE,'system','Cloudie default platform pricing'
WHERE NOT EXISTS (SELECT 1 FROM "PointPricingRule" WHERE "action"='ticketing.flight_pdf' AND "workspaceId" IS NULL);
INSERT INTO "PointPricingRule" ("id","workspaceId","action","pointCost","enabled","createdById","reason")
SELECT 'system-pricing-ticket-hotel',NULL,'ticketing.hotel_pdf',10,TRUE,'system','Cloudie default platform pricing'
WHERE NOT EXISTS (SELECT 1 FROM "PointPricingRule" WHERE "action"='ticketing.hotel_pdf' AND "workspaceId" IS NULL);
INSERT INTO "PointPricingRule" ("id","workspaceId","action","pointCost","enabled","createdById","reason")
SELECT 'system-pricing-ticket-invoice',NULL,'ticketing.invoice_pdf',10,TRUE,'system','Cloudie default platform pricing'
WHERE NOT EXISTS (SELECT 1 FROM "PointPricingRule" WHERE "action"='ticketing.invoice_pdf' AND "workspaceId" IS NULL);
INSERT INTO "PointPricingRule" ("id","workspaceId","action","pointCost","enabled","createdById","reason")
SELECT 'system-pricing-ticket-customs',NULL,'ticketing.customs_pdf',10,TRUE,'system','Cloudie default platform pricing'
WHERE NOT EXISTS (SELECT 1 FROM "PointPricingRule" WHERE "action"='ticketing.customs_pdf' AND "workspaceId" IS NULL);
INSERT INTO "PointPricingRule" ("id","workspaceId","action","pointCost","enabled","createdById","reason")
SELECT 'system-pricing-services-email',NULL,'services.email_sent',1,TRUE,'system','Cloudie default platform pricing'
WHERE NOT EXISTS (SELECT 1 FROM "PointPricingRule" WHERE "action"='services.email_sent' AND "workspaceId" IS NULL);
INSERT INTO "PointPricingRule" ("id","workspaceId","action","pointCost","enabled","createdById","reason")
SELECT 'system-pricing-services-image',NULL,'services.image_rendered',2,TRUE,'system','Cloudie default platform pricing'
WHERE NOT EXISTS (SELECT 1 FROM "PointPricingRule" WHERE "action"='services.image_rendered' AND "workspaceId" IS NULL);
