-- Runtime role for the app: NOT the table owner, so Row-Level Security applies.
-- Dev password only; override via a real secret in production.
CREATE ROLE ward_app LOGIN PASSWORD 'ward_app_dev';
GRANT USAGE ON SCHEMA public TO ward_app;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA public TO ward_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ward_app;
GRANT DELETE ON sessions TO ward_app;
GRANT DELETE ON user_ward_permissions TO ward_app;
