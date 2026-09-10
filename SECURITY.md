# Security policy

## Supported versions

Only the latest commit on `main` is supported with security fixes.

## Reporting a vulnerability

Please do not disclose exploitable details in a public issue. Use GitHub's
private vulnerability reporting for the repository when available. If private
reporting is unavailable, contact the repository owner through GitHub and
include:

- the affected file or deployed URL;
- reproducible steps;
- impact and any suggested mitigation.

Do not include credentials, service-role keys, student personal data, or other
secrets in a report.

The application is offline-first and ships without Supabase credentials.
Never commit a Supabase service-role key; browser configuration may only use an
anon key protected by the policies in `supabase/schema.sql`.
