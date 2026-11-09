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
anon key protected by the policies in `supabase/schema.sql`. The browser stores
authenticated session tokens in session-scoped storage; they are not included
in workspace backups. Authentication links must return credentials in the URL
fragment; do not put `token_hash` values in query strings or custom email-template
redirects. The app rejects query-string verification tokens and uses a
`no-referrer` policy. Keep the Content Security Policy restrictive and do not
add unreviewed scripts that could read those tokens.

Before using real learner data, apply and review the Supabase policies and
workflow triggers in `supabase/schema.sql` on a test project. The local role
selector is not an authorization control. Report problems with access control
or exposure of student data through the private reporting channel above.

The standards-review record can contain reviewer names, credentials, and
document references. It is stored with local projects and may be included in
exports, backups, or configured cloud submissions; enter only information
approved for those storage locations and keep exported files private. Reviewer
credentials and standards references are self-reported and are not verified by
the application.
