-- Rename the system role and warehouse approval tags without losing existing users.
ALTER TYPE "RoleCode" RENAME VALUE 'STOCK_CONTROLLER' TO 'STOREMAN';

UPDATE "roles"
SET "name" = 'Storeman', "updated_at" = CURRENT_TIMESTAMP
WHERE "code" = 'STOREMAN';

UPDATE "transaction_approvals"
SET "approval_required_tag" = REPLACE("approval_required_tag", 'STOCK_CONTROLLER:', 'STOREMAN:')
WHERE "approval_required_tag" LIKE 'STOCK_CONTROLLER:%';

UPDATE "transaction_approvals"
SET "approval_required_tag" = REPLACE("approval_required_tag", 'HEAD_STOCK_CONTROLLER:', 'WAREHOUSE_MANAGER:')
WHERE "approval_required_tag" LIKE 'HEAD_STOCK_CONTROLLER:%';

UPDATE "transaction_approvals"
SET "approver_tag_snapshot" = REPLACE("approver_tag_snapshot", 'STOCK_CONTROLLER:', 'STOREMAN:')
WHERE "approver_tag_snapshot" LIKE 'STOCK_CONTROLLER:%';

UPDATE "transaction_approvals"
SET "approver_tag_snapshot" = REPLACE("approver_tag_snapshot", 'HEAD_STOCK_CONTROLLER:', 'WAREHOUSE_MANAGER:')
WHERE "approver_tag_snapshot" LIKE 'HEAD_STOCK_CONTROLLER:%';
