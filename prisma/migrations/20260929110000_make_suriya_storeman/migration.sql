-- Suriya is a Storeman in the current local user data. Keep the
-- Warehouse Manager organization tag, but make the system role explicit.
WITH target_users AS (
  SELECT id
  FROM "users"
  WHERE lower(name) = lower('Suriya K.')
     OR lower(email) = lower('nub@ad2012r2.local')
     OR lower(email) = lower('suriya@example.com')
), storeman_role AS (
  SELECT id
  FROM "roles"
  WHERE code = 'STOREMAN'
)
INSERT INTO "user_roles" (user_id, role_id)
SELECT target_users.id, storeman_role.id
FROM target_users CROSS JOIN storeman_role
ON CONFLICT (user_id, role_id) DO NOTHING;

DELETE FROM "user_roles" AS user_role
USING "roles" AS role
WHERE user_role.user_id IN (
  SELECT id
  FROM "users"
  WHERE lower(name) = lower('Suriya K.')
     OR lower(email) = lower('nub@ad2012r2.local')
     OR lower(email) = lower('suriya@example.com')
)
  AND user_role.role_id = role.id
  AND role.code = 'USER';
