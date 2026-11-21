# src/emails/: sending emails

| File           | What it does                                                                                                                                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sendEmail.js` | `sendEmail({to, subject, html, text})` over SMTP (Mailpit in dev). Errors are logged, never thrown. In `NODE_ENV=test` it pushes to the exported `outbox` array instead (`clearOutbox()` empties it).                                     |
| `templates.js` | `verifyEmailTemplate(name, token)`, `resetPasswordTemplate(name, token)`, `passwordChangedTemplate(name)`. Each returns `{subject, html, text}`. Links point to the **frontend** (`FRONTEND_URL`). Names are HTML-escaped (`escapeHtml`). |

See them for real: `docker compose up -d`, register a user, open http://localhost:8025.

Branch 07 added `orderConfirmationTemplate(name, order)` (items table, totals, ship-to snapshot) and `orderStatusTemplate(name, order)` (confirmed / shipped + tracking / delivered / cancelled + reason). Every user-typed value is escaped.
