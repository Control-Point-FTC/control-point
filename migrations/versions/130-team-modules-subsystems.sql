-- 130-team-modules-subsystems.sql — per-workspace module switches and the
-- team's robot subsystem list (src/types/teamModules.ts).
--
-- disabled_modules: JSON array of module ids the team turned off. NULL means
-- every module is on, so existing workspaces are unchanged.
-- subsystems: JSON array of names. NULL means the defaults (Drivetrain,
-- Intake, ...) until the team edits them.

BEGIN;

ALTER TABLE teams ADD COLUMN disabled_modules TEXT;
ALTER TABLE teams ADD COLUMN subsystems TEXT;

COMMIT;
