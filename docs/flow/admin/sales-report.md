# Sales report (admin) – `GET /api/admin/reports/sales`

An admin gets the sales (every order that was NOT cancelled) of a period of calendar days in a chosen time zone, grouped by day, ISO week or month, with grand totals, average order value, revenue per category and the top 10 products. No `from` means the last 30 days, no `to` means now, and the period may be at most 366 days. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/admin/reports/sales?from=&to=&groupBy=&tz="| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan, apiLimiter]
    C --> D["Router mount<br/>app.use('/api/admin', adminRoutes)"]
    D --> G0["router.use(protect, authorize(ROLES.ADMIN))<br/>admin.routes.js, guards every admin route"]
    G0 --> P1["protect<br/>auth.middleware.js"]
    P1 --> P2{"Bearer token<br/>in header?"}
    P2 -->|No| E1["ApiError 401<br/>Not authorised, token missing"]
    P2 -->|Yes| P3{"jwt.verify OK?"}
    P3 -->|No| E2["ApiError 401<br/>token invalid or expired"]
    P3 -->|Yes| P4[("User.findById(payload.id)")]
    P4 --> P5{User exists?}
    P5 -->|No| E3["ApiError 401<br/>user no longer exists"]
    P5 -->|Yes| P6{user.isActive?}
    P6 -->|No| E4["ApiError 403<br/>Account disabled"]
    P6 -->|Yes| P7{"user.isTokenOutdated(payload.v)?"}
    P7 -->|Yes| E5["ApiError 401<br/>Password was changed, please log in again"]
    P7 -->|No| Z1["authorize(ROLES.ADMIN)<br/>auth.middleware.js"]
    Z1 --> Z2{role is admin?}
    Z2 -->|No| E6["ApiError 403<br/>Access denied"]
    Z2 -->|Yes| V1["validate(salesReportRules)<br/>admin.validation.js"]
    V1 --> V2{"salesReportRules pass?<br/>from, to: optional, YYYY-MM-DD and a real calendar date<br/>groupBy: optional, day, week or month<br/>tz: optional, known IANA time zone"}
    V2 -->|No| EV["ApiError 400<br/>Validation failed<br/>first error per field"]
    V2 -->|Yes| CT["salesReport<br/>admin.controller.js"]
    CT --> S1["adminService.getSalesReport(req.query)<br/>admin.service.js"]
    S1 --> R1
    R1["resolvePeriod(query)<br/>tz = query.tz or UTC<br/>start = from given ? startOfDayInZone(from, tz) : now minus 30 days<br/>end = to given ? endOfDayInZone(to, tz) : now<br/>utils/dates.js"]
    R1 --> R2{"start after end?"}
    R2 -->|Yes| E7["ApiError 400<br/>Start date must be before end date<br/>field from"]
    R2 -->|No| R3{"end minus start longer than<br/>MAX_REPORT_DAYS 366 days?"}
    R3 -->|Yes| E8["ApiError 400<br/>Range can be at most one year<br/>field to"]
    R3 -->|No| S2["groupBy = query.groupBy or day<br/>format from GROUP_FORMATS<br/>day %Y-%m-%d, week %G-W%V, month %Y-%m"]
    S2 --> S3[("Order.aggregate, one round trip<br/>$match createdAt between start and end,<br/>status not cancelled, then $facet")]
    S3 --> F1[("facet rows<br/>$group by $dateToString format, createdAt, timezone tz<br/>orders, itemsSold, revenue<br/>$sort _id 1")]
    S3 --> F2[("facet byCategory<br/>$unwind items<br/>$lookup products, then $lookup categories<br/>$group by category name or Uncategorised<br/>revenue, itemsSold, $sort revenue -1, _id 1")]
    S3 --> F3[("facet topProducts<br/>$unwind items, $group by items.product<br/>name, sold, revenue<br/>$sort revenue -1, _id 1, $limit 10")]
    F1 --> S4["rows: period, orders, itemsSold, revenue,<br/>averageOrderValue = Math.round(revenue / orders)<br/>totals = sum of rows + averageOrderValue or 0"]
    F2 --> S4
    F3 --> S4
    S4 --> OK["sendSuccess 200 Sales report<br/>from, to, groupBy, timezone, rows, totals,<br/>byCategory, topProducts"]
    OK --> R[Client]
    E1 --> EH["errorHandler<br/>error.middleware.js"]
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    E6 --> EH
    EV --> EH
    E7 --> EH
    E8 --> EH
    EH -->|"JSON { success: false, message, errors? }"| R
```

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/admin/admin.validation.js` (`salesReportRules`, `dayRule`, `tzRule`), `server/src/utils/dates.js` (`isValidTimeZone`, `startOfDayInZone`, `endOfDayInZone`, `DAY_MS`), `server/src/config/constants.js` (`ADMIN_REPORTS`, `ORDER_STATUS`), `server/src/modules/admin/admin.controller.js` (`salesReport`), `server/src/modules/admin/admin.service.js` (`getSalesReport`, `resolvePeriod`), `server/src/modules/orders/order.model.js` (aggregated), `server/src/utils/ApiResponse.js` (`sendSuccess`), `server/src/middleware/error.middleware.js` (error response).
