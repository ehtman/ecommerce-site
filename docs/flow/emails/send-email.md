# Send email – internal helper `sendEmail()`

The one shared function every service uses to send an email (verification, password reset, password changed). It is not an HTTP endpoint: services call it after their database work succeeds. Email failures are logged, never thrown, so a broken mail server never fails the request.

```mermaid
flowchart TD
    CALL["Calling service<br/>registerUser, resendVerification, forgotPassword, resetPassword<br/>auth.service.js, changePassword user.service.js"] --> TPL{"Which template?<br/>emails/templates.js"}
    TPL -->|verify| T1["verifyEmailTemplate name, token<br/>subject Verify your ShopEase email<br/>link FRONTEND_URL/verify-email?token=..., valid 24h"]
    TPL -->|reset| T2["resetPasswordTemplate name, token<br/>subject Reset your ShopEase password<br/>link FRONTEND_URL/reset-password?token=..., valid 30 min"]
    TPL -->|notice| T3["passwordChangedTemplate name<br/>subject Your ShopEase password was changed"]
    T1 --> LAY["layout + button + escapeHtml name<br/>returns subject, html, text"]
    T2 --> LAY
    T3 --> LAY
    LAY --> SE["sendEmail to, subject, html, text<br/>emails/sendEmail.js"]
    SE --> D1{"env.isTest?"}
    D1 -->|Yes| OB["outbox.push to, subject, html, text<br/>tests read links from outbox"]
    OB --> RET[Return to calling service]
    D1 -->|No| TR["transporter.sendMail<br/>nodemailer, from EMAIL_FROM<br/>created once: SMTP_HOST, SMTP_PORT, secure if 465, auth if SMTP_USER"]
    TR --> SMTP["SMTP server<br/>Mailpit in development, real provider in production"]
    SMTP --> D2{"Sent OK?"}
    D2 -->|Yes| RET
    D2 -->|No| LOG["console.error Email to ... failed<br/>error swallowed, not thrown"]
    LOG --> RET
    RET --> NEXT["Service continues<br/>controller sends its success response"]
```

**Files involved:** `server/src/emails/sendEmail.js` (sendEmail, nodemailer transporter, test outbox and clearOutbox), `server/src/emails/templates.js` (verifyEmailTemplate, resetPasswordTemplate, passwordChangedTemplate, layout, button, escapeHtml), `server/src/config/env.js` (SMTP_*, EMAIL_FROM, FRONTEND_URL, isTest), `server/src/modules/auth/auth.service.js` (callers: registerUser, resendVerification, forgotPassword, resetPassword), `server/src/modules/users/user.service.js` (caller: changePassword).
