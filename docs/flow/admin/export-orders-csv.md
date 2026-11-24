# Export orders as CSV (admin) – `GET /api/admin/reports/orders/export`

An admin downloads every order of a period (optionally only one status) as a CSV file named `orders_<from>_<to>.csv`, one line per order. The dates are checked before anything is sent; the file is then STREAMED from a MongoDB cursor line by line, waiting for `drain` when the client is slow, so memory stays small. An error in the middle of the stream cuts the connection instead of sending JSON. Only admins may call it.

```mermaid
flowchart TD
    A[Client] -->|"GET /api/admin/reports/orders/export?from=&to=&status=&tz="| B[Express app<br/>app.js]
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
    Z2 -->|Yes| V1["validate(ordersExportRules)<br/>admin.validation.js"]
    V1 --> V2{"ordersExportRules pass?<br/>from, to: optional, YYYY-MM-DD and a real calendar date<br/>status: optional, one of ORDER_STATUS<br/>tz: optional, known IANA time zone"}
    V2 -->|No| EV["ApiError 400<br/>Validation failed<br/>first error per field"]
    V2 -->|Yes| CT["ordersCsv<br/>admin.controller.js"]
    CT --> S1["adminService.prepareOrdersExport(req.query)<br/>admin.service.js, checks dates BEFORE any byte is sent"]
    S1 --> R1
    R1["resolvePeriod(query)<br/>tz = query.tz or UTC<br/>start = from given ? startOfDayInZone(from, tz) : now minus 30 days<br/>end = to given ? endOfDayInZone(to, tz) : now<br/>utils/dates.js"]
    R1 --> R2{"start after end?"}
    R2 -->|Yes| E7["ApiError 400<br/>Start date must be before end date<br/>field from"]
    R2 -->|No| R3{"end minus start longer than<br/>MAX_REPORT_DAYS 366 days?"}
    R3 -->|Yes| E8["ApiError 400<br/>Range can be at most one year<br/>field to"]
    R3 -->|No| S2["match = createdAt between start and end<br/>+ status when query.status is sent"]
    S2 --> S3["return filename orders_ from-day _ to-day .csv<br/>and lines = async generator, not started yet"]
    S3 --> H1["setCsvHeaders(res, filename)<br/>Content-Type text/csv, charset utf-8<br/>Content-Disposition attachment, filename<br/>Cache-Control no-store"]
    H1 --> H2["res.status(200)<br/>res.write(CSV_BOM)"]
    H2 --> G1["for await line of lines<br/>generator yields csvRow(ORDER_CSV_HEADER) first<br/>orderNumber, date, customerName, customerEmail, status,<br/>paymentMethod, paymentStatus, items, itemsPrice,<br/>discountPrice, shippingPrice, totalPrice"]
    G1 --> G2[("Order.aggregate(...).cursor({ batchSize: 200 })<br/>$match match, $sort createdAt 1, _id 1<br/>$lookup users, only name + email<br/>$project date via $dateToString in tz,<br/>items = sum of item quantities")]
    G2 --> L2{"next document from cursor?"}
    L2 -->|"Yes, yield csvRow(doc)"| W1{"res.write(line) returned false?<br/>network buffer full"}
    W1 -->|Yes| W2["await once(res, 'drain')<br/>backpressure"]
    W2 --> L2
    W1 -->|No| L2
    L2 -->|"No, cursor finished"| OK["res.end()<br/>200, complete CSV file"]
    OK --> R[Client]
    L2 -->|"Error while streaming"| X1["catch: console.error unless test<br/>res.destroy(err), no JSON possible after 200"]
    X1 -->|"connection cut, browser reports a failed download"| R
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

**Files involved:** `server/src/app.js` (global middleware, mounts `/api/admin`), `server/src/modules/admin/admin.routes.js` (route, `router.use(protect, authorize(ROLES.ADMIN))`, middleware order), `server/src/middleware/auth.middleware.js` (`protect`, `authorize`), `server/src/middleware/validate.middleware.js` (`validate`), `server/src/modules/admin/admin.validation.js` (`ordersExportRules`), `server/src/modules/admin/admin.controller.js` (`ordersCsv`, `setCsvHeaders`), `server/src/modules/admin/admin.service.js` (`prepareOrdersExport`, `resolvePeriod`, `ORDER_CSV_HEADER`, `fileDays`), `server/src/utils/csv.js` (`csvRow`, `csvCell`, `CSV_BOM`), `server/src/utils/dates.js` (`startOfDayInZone`, `endOfDayInZone`, `dayInZone`), `server/src/config/constants.js` (`ADMIN_REPORTS`, `ORDER_STATUS`), `server/src/modules/orders/order.model.js` (aggregated through a cursor), `server/src/config/env.js` (`isTest`), `server/src/middleware/error.middleware.js` (error response).
