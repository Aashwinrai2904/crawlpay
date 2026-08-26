-- Bot-classification and policy-action vocabulary is enforced here (not as
-- a Prisma enum) to match the same string vocabulary the middleware and
-- WordPress plugin already use in TS/PHP.
ALTER TABLE "pricing_rules"
  ADD CONSTRAINT "pricing_rules_bot_classification_check"
  CHECK ("bot_classification" IN ('human', 'search-crawler', 'ai-crawler', 'unknown-bot'));

ALTER TABLE "policy_rules"
  ADD CONSTRAINT "policy_rules_bot_classification_check"
  CHECK ("bot_classification" IN ('human', 'search-crawler', 'ai-crawler', 'unknown-bot'));

ALTER TABLE "policy_rules"
  ADD CONSTRAINT "policy_rules_action_check"
  CHECK ("action" IN ('allow', 'charge', 'block'));

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_bot_classification_check"
  CHECK ("bot_classification" IN ('human', 'search-crawler', 'ai-crawler', 'unknown-bot'));
