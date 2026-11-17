# Authentication & Authorization — Postman Test Plan
 
A complete Postman test plan for validating authentication, authorization, token handling, email verification, password management, Google login, error handling, and rate limits.

## Table of Contents

1. [Setup and prerequisites](#1-setup-and-prerequisites)
2. [User registration](#2-user-registration)
3. [User login](#3-user-login)
4. [Admin login](#4-admin-login)
5. [Token handling and logout](#5-token-handling-and-logout)
6. [Email verification](#6-email-verification)
7. [Forgot and reset password](#7-forgot-and-reset-password)
8. [Change password](#8-change-password)
9. [Authorization and role checks](#9-authorization-and-role-checks)
10. [Google login](#10-google-login)
11. [Miscellaneous checks and rate limits](#11-miscellaneous-checks-and-rate-limits)
12. [Suggested test execution order](#12-suggested-test-execution-order)

---

## 1. Setup and prerequisites

### 1.1 Postman environment

Create a Postman environment with these variables:

| Variable | Initial value |
|---|---|
| `baseUrl` | `http://localhost:5000/api` |
| `token` | *(empty)* |
| `adminToken` | *(empty)* |
| `email` | *(empty)* |

### 1.2 Required tools and services

- **Mailpit — email testing:** Use Mailpit to inspect verification and password-reset emails. Start it with:

  ```bash
  docker run -d -p 8025:8025 -p 1025:1025 axllent/mailpit
  ```

  Then open [http://localhost:8025](http://localhost:8025). Only token hashes are stored in the database, so the email is the only place to obtain the raw token.

- **Admin user:** Run `npm run seed:admin`. The script uses `ADMIN_EMAIL` and `ADMIN_PASSWORD` from your `.env` file.

- **Database shell:** Keep `mongosh` or MongoDB Compass available for the scenarios that require inspecting or changing database values.

### 1.3 Add temporary authorization test routes

The trimmed app does not mount any route that uses `authorize()` or `requireVerifiedEmail`, so role-based authorization cannot be tested until temporary routes are added.

Add the following code to `src/app.js`, before `app.use(notFound)`:

```js
import { protect, authorize, requireVerifiedEmail } from './middleware/auth.middleware.js';

app.get('/api/test/admin', protect, authorize('admin'), (req, res) =>
  res.json({ ok: true, role: req.user.role })
);

app.get('/api/test/customer', protect, authorize('customer'), (req, res) =>
  res.json({ ok: true, role: req.user.role })
);

app.get('/api/test/verified', protect, authorize('customer'), requireVerifiedEmail, (req, res) =>
  res.json({ ok: true })
);
```

**Important:** Delete these temporary routes after completing the authorization tests.

### 1.4 Rate-limit behavior

Rate limits can interfere with the test run. The configured limits are:

| Endpoint group | Limit |
|---|---|
| Register, login, Google login, and reset-password | 10 requests per 15 minutes per IP (shared limit) |
| Admin login | 5 requests |
| Resend-verification and forgot-password | 5 requests per hour |

Additional notes:

- Rate-limit counters are stored in memory.
- Saving a file and allowing Nodemon to restart the server resets the counters.
- Run Section 11 (miscellaneous checks and rate limits) last.
- Restart the server if you accidentally receive a `429` response during earlier tests.

### 1.5 Helpful Postman scripts

**Pre-request Script on the Register request** — generate a unique email for each run:

```js
pm.environment.set("email", "user" + Date.now() + "@test.com");
```

**Tests tab on the Login/Register requests** — save the returned user token:

```js
pm.environment.set("token", pm.response.json().data.token);
```

**Protected requests** — configure the Authorization tab as follows:

- Type: **Bearer Token**
- Token: `{{token}}`

For admin-only requests, use `{{adminToken}}` instead.

### 1.6 Standard response formats

Successful responses follow this shape:

```js
{ success, message, data }
```

Error responses follow this shape:

```js
{ success: false, message, errors: [{ field, message }] }
```

---

## 2. User registration

**Endpoint:** `POST {{baseUrl}}/auth/register`

| ID | Scenario | Request body / action | Expected result |
|---|---|---|---|
| 2.1 | Happy path | `{"name":"Ali Khan","email":"{{email}}","password":"Passw0rd123"}` | `201`; `data.token` is present; `user.role` is `customer`; `isEmailVerified` is `false`; no `password` field is returned; verification email arrives in Mailpit. |
| 2.2 | Duplicate email | Send the same body again. | `409`, `Email already registered`; `errors[0].field` is `email`. |
| 2.3 | Role injection | Add `"role":"admin"` to the request body. | `201`, but `user.role` remains `customer`. |
| 2.4 | Short password | Set `"password":"abc1"`. | `400`, `Validation failed`; message: `Password must be 8–64 characters`. |
| 2.5 | Password without a digit | Set `"password":"onlyletters"`. | `400`; message: `Password must contain a letter and a number`. |
| 2.6 | Invalid email | Set `"email":"abc"`. | `400`; message: `Email is invalid`. |
| 2.7 | Missing name | Omit `name`. | `400`; message: `Name is required`. |
| 2.8 | Name too short | Set `"name":"A"`. | `400`; message: `Name must be 2–50 characters`. |
| 2.9 | Email letter case | Register `ALI@Test.com`, then register `ali@test.com`. | The second registration returns `409` because emails are lowercased. |

---

## 3. User login

**Endpoint:** `POST {{baseUrl}}/auth/login`

| ID | Scenario | Request body / action | Expected result |
|---|---|---|---|
| 3.1 | Correct credentials | Submit a registered email and its correct password. | `200`, `Login successful`; token is returned. |
| 3.2 | Wrong password | Submit a registered email with an incorrect password. | `401`, `Invalid email or password`. |
| 3.3 | Unknown email | Submit an email that is not registered. | Same `401` and same message as the wrong-password case (prevents user enumeration). |
| 3.4 | Missing password | Omit the password. | `400`; message: `Password is required`. |
| 3.5 | Uppercase email | Submit an uppercase email with the correct password. | `200`. |
| 3.6 | Unverified user login | Log in as a user whose email is not verified. | `200` (email verification only blocks ordering). |
| 3.7 | NoSQL injection attempt | Submit `{"email":{"$gt":""},"password":"x"}`. | `400`; the request must never return `200`. |

---

## 4. Admin login

**Endpoint:** `POST {{baseUrl}}/auth/admin/login`

| ID | Scenario | Request body / action | Expected result |
|---|---|---|---|
| 4.1 | Correct admin credentials | Log in with the seeded admin's credentials. | `200`; save the returned token as `adminToken`. |
| 4.2 | Customer attempts admin login | Submit a customer's correct email and password. | `403`, `Admin access only`. |
| 4.3 | Admin uses wrong password | Submit the admin email with an incorrect password. | `401`, `Invalid email or password`. |

---

## 5. Token handling and logout

**Endpoints:** `GET {{baseUrl}}/auth/me` and `POST {{baseUrl}}/auth/logout`

| ID | Scenario | Request setup / action | Expected result |
|---|---|---|---|
| 5.1 | Valid Bearer token | Call `/auth/me` with a valid Bearer token. | `200`; current user is returned with no password or token hashes. |
| 5.2 | Missing Authorization header | Call `/auth/me` without an Authorization header. | `401`, `Not authorised, token missing`. |
| 5.3 | Incorrect authorization scheme | Send header `Token abc` (without `Bearer `). | `401`, `token missing`. |
| 5.4 | Garbage token | Send `Bearer garbage`. | `401`, `token invalid or expired`. |
| 5.5 | Modified token signature | Change one character of a valid token's signature. | `401`, `token invalid or expired`. |
| 5.6 | Token signed with another secret | Build a token on jwt.io using a different secret. | `401`, `token invalid or expired`. |
| 5.7 | Expired token | Set `JWT_EXPIRES_IN=10s`, restart the server, log in, and wait 11 seconds. | `401`, `token invalid or expired`. Revert the configuration afterwards. |
| 5.8 | Logout with a valid token | Call logout with a valid token. | `200`, `Logged out`. Because authentication is stateless, the token still works afterwards; this is expected. |
| 5.9 | Logout without a token | Call logout without a token. | `401`. |
| 5.10 | User deleted from database | Delete the user in the database, then call `/auth/me` using that user's old token. | `401`, `user no longer exists`. |

---

## 6. Email verification

| ID | Scenario | Request | Expected result |
|---|---|---|---|
| 6.1 | Resend without login | `POST {{baseUrl}}/auth/resend-verification`, without a token. | `401`. |
| 6.2 | Resend as an unverified user | Send the same request with the user's token. | `200`, `Verification email sent`; a new email arrives in Mailpit. |
| 6.3 | Verify using the newest token | `POST {{baseUrl}}/auth/verify-email` with `{"token":"<from Mailpit>"}`. | `200`, `Email verified successfully`; `isEmailVerified` becomes `true`. |
| 6.4 | Reuse a verification token | Submit the same token again. | `400`, `Verification link is invalid or has expired`. |
| 6.5 | Use the token from before a resend | Resend verification, then submit the older token. | `400` (the new token replaces the old one). |
| 6.6 | Random 64-character hexadecimal token | Submit a random 64-character hex token. | `400`, `invalid or has expired`. |
| 6.7 | Token too short | Submit `{"token":"abc"}`. | `400`, `Token is invalid`. |
| 6.8 | Missing token | Submit `{}`. | `400`, `Token is required`. |
| 6.9 | Resend after verification | Call `POST {{baseUrl}}/auth/resend-verification` for an already verified user. | `400`, `Email is already verified`. |
| 6.10 | Expired verification token | In the database, set `emailVerifyExpires` to a date in the past, then verify. | `400`. |

---

## 7. Forgot and reset password

| ID | Scenario | Request | Expected result |
|---|---|---|---|
| 7.1 | Existing email | `POST {{baseUrl}}/auth/forgot-password` with `{"email":"..."}`. | `200`, `If an account exists…`; email arrives in Mailpit. |
| 7.2 | Unknown email | Send the forgot-password request for an unknown email. | Identical `200` response; no email is sent. |
| 7.3 | Invalid email format | Submit `{"email":"x"}`. | `400`. |
| 7.4 | Weak new password | `POST {{baseUrl}}/auth/reset-password` with `{"token":"<valid>","password":"short"}`. | `400` validation error. The token is not consumed. |
| 7.5 | Valid password reset | Submit `{"token":"<valid>","password":"NewPass123"}`. | `200`; a "password changed" email is sent. |
| 7.6 | Reuse reset token | Submit the same reset token again. | `400`, `Reset link is invalid or has expired`. |
| 7.7 | Use an old JWT after reset | Call `GET {{baseUrl}}/auth/me` using a JWT issued before the reset. | `401`, `Password was changed, please log in again`. |
| 7.8 | Login with old password | Attempt login with the old password. | `401`. |
| 7.9 | Login with new password | Attempt login with the new password. | `200`. |
| 7.10 | Request reset twice, then use first link | Request password reset twice and use the link from the first request. | `400` (the second request replaces the first token). |
| 7.11 | Expired reset token | In the database, set `passwordResetExpires` to a date in the past, then reset the password. | `400`. |

---

## 8. Change password

**Endpoint:** `PUT {{baseUrl}}/users/password`

| ID | Scenario | Request body / action | Expected result |
|---|---|---|---|
| 8.1 | No token | Submit any request without a token. | `401`. |
| 8.2 | Wrong current password | Submit `{"currentPassword":"wrong","newPassword":"Another123"}`. | `401`, `Current password is incorrect`. |
| 8.3 | New password is unchanged | Set the current and new passwords to the same value. | `400`, `New password must be different`. |
| 8.4 | Weak new password | Set `"newPassword":"abc"`. | `400`. |
| 8.5 | Valid password change | Submit the correct current password and a strong new password. | `200`; `data.token` contains a fresh token. Save it as `token`. |
| 8.6 | Old token after password change | Call `GET {{baseUrl}}/auth/me` with the old token. | `401`, `Password was changed…`. |
| 8.7 | Fresh token after password change | Call `GET {{baseUrl}}/auth/me` with the token returned in test 8.5. | `200`. |

---

## 9. Authorization and role checks

**Prerequisite:** Add the temporary test routes described in [Section 1.3](#13-add-temporary-authorization-test-routes).

| ID | Scenario | Request setup / action | Expected result |
|---|---|---|---|
| 9.1 | Admin route without a token | `GET {{baseUrl}}/test/admin` without a token. | `401`. |
| 9.2 | Customer accesses admin route | `GET {{baseUrl}}/test/admin` with a customer token. | `403`, `Access denied`. |
| 9.3 | Admin accesses admin route | `GET {{baseUrl}}/test/admin` with `adminToken`. | `200`. |
| 9.4 | Admin accesses customer-only route | `GET {{baseUrl}}/test/customer` with `adminToken`. | `403`. |
| 9.5 | Customer accesses customer route | `GET {{baseUrl}}/test/customer` with a customer token. | `200`. |
| 9.6 | Unverified customer accesses verified route | `GET {{baseUrl}}/test/verified` with an unverified customer's token. | `403`, `Please verify your email address before placing an order`. |
| 9.7 | Verified customer accesses verified route | Verify the customer's email, then repeat test 9.6. | `200`. |
| 9.8 | Modify token payload without re-signing | Change the customer token's payload to `"role":"admin"` without re-signing it, then call `/test/admin`. | `401` (forgery is rejected). |
| 9.9 | Change the user's role in the database | Set the customer's `role` to `admin` in the database, then call `/test/admin` with their old token. | `200`, because the role is read from the database, not the token. Set the role back afterwards. |
| 9.10 | Disable an account | Set `isActive:false`, then call `/auth/me` with the user's existing token. | `403`, `Account disabled`. |
| 9.11 | Disabled user attempts login | Attempt login as the same disabled user. | `403`, `Your account has been disabled`. |

---

## 10. Google login

**Endpoint:** `POST {{baseUrl}}/auth/google`

| ID | Scenario | Request body / action | Expected result |
|---|---|---|---|
| 10.1 | Missing Google credential | Submit `{}`. | `400`, `Google credential is required`. |
| 10.2 | Google login not configured | Submit `{"credential":"abc"}` while `GOOGLE_CLIENT_ID` is empty. | `500`, `Google login is not configured`. |
| 10.3 | Invalid Google credential | Submit `{"credential":"abc"}` with a client ID configured. | `401`, `Invalid Google credential`. |
| 10.4 | Valid Google ID token | Use a real Google ID token from your frontend or the OAuth Playground. | `200`. The new user has `authProvider` set to `google` and `isEmailVerified` set to `true`. If the email already exists locally, the account is linked. An admin email receives `403`, `Admins must log in with email and password`. |

---

## 11. Miscellaneous checks and rate limits

**Run this section last.** See [Rate-limit behavior](#14-rate-limit-behavior) in the setup notes before running these tests.

| ID | Scenario | Request / action | Expected result |
|---|---|---|---|
| 11.1 | Health check | `GET {{baseUrl}}/health`. | `200`, `database: "connected"`. |
| 11.2 | Unknown route | `GET {{baseUrl}}/nope`. | `404`, `Route not found: GET /api/nope`. |
| 11.3 | Malformed JSON | Send a malformed JSON request body. | `400`, `Invalid JSON body`. |
| 11.4 | Login rate limit | Submit a wrong-password login 11 times in a row. | The 11th request returns `429`, `Too many attempts, try again later`. Check the `RateLimit-*` headers. |
| 11.5 | Admin login rate limit | Attempt admin login 6 times. | The 6th request returns `429`. |
| 11.6 | Forgot-password rate limit | Submit forgot-password 6 times. | The 6th request returns `429`. |

---

## 12. Suggested test execution order

Follow this order to reduce interference between tests:

1. Seed the admin user.
2. Run Section 2 — User registration.
3. Run Section 3 — User login.
4. Run Section 5 — Token handling and logout.
5. Run Section 6 — Email verification.
6. Run Section 7 — Forgot and reset password.
7. Run Section 8 — Change password.
8. Run Section 4 — Admin login.
9. Run Section 9 — Authorization and role checks.
10. Run Section 10 — Google login.
11. Restart the server, then run Section 11 — Miscellaneous checks and rate limits.

**Final cleanup:** Remove the temporary authorization test routes added in Section 1.3.

---

## Optional next step

A ready-to-import Postman collection JSON can also be generated with these requests and the token-saving scripts.
