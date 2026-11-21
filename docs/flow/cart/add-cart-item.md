# Add item to cart – `POST /api/cart/items`

Puts a product in the logged-in customer's cart; if it is already there the quantities are added together, and the new total must respect the 10-per-product limit and the stock. Any price sent by the client is ignored. Customers only.

```mermaid
flowchart TD
    A[Client] -->|"POST /api/cart/items"| B[Express app<br/>app.js]
    B --> C[Global middleware<br/>helmet, cors, json, urlencoded, mongoSanitize, morgan]
    C --> RL{"apiLimiter: over 300 requests in 15 min?"}
    RL -->|Yes| E429["429 Too many attempts<br/>express-rate-limit answers directly"]
    E429 --> R[Client]
    RL -->|No| RT["cart.routes.js<br/>router.use protect, authorize"]
    RT --> P1{"protect: Bearer token in header?<br/>auth.middleware.js"}
    P1 -->|No| EP1["ApiError 401<br/>Not authorised, token missing"]
    P1 -->|Yes| P2{"jwt.verify token, JWT_SECRET OK?"}
    P2 -->|No| EP2["ApiError 401<br/>token invalid or expired"]
    P2 -->|Yes| P3["User.findById payload.id"]
    P3 --> P4{"User found?"}
    P4 -->|No| EP3["ApiError 401<br/>user no longer exists"]
    P4 -->|Yes| P5{"user.isActive?"}
    P5 -->|No| EP4["ApiError 403<br/>Account disabled"]
    P5 -->|Yes| P6{"user.isTokenOutdated payload.v?"}
    P6 -->|Yes| EP5["ApiError 401<br/>Password was changed, please log in again"]
    P6 -->|No| AZ{"authorize ROLES.CUSTOMER<br/>req.user.role is customer?"}
    AZ -->|No| EP6["ApiError 403<br/>Access denied"]
    AZ -->|Yes| V{"validate addItemRules<br/>productId isMongoId, quantity isInt 1-10 toInt"}
    V -->|No| EV["ApiError 400<br/>Validation failed + field errors"]
    V -->|Yes| CT["cart.controller.js addItem<br/>reads only req.body.productId, quantity"]
    CT --> S1["cartService.addItem<br/>loadActiveProduct: Product.findOne _id, isActive true .select stock name"]
    S1 --> D1{"Active product found?"}
    D1 -->|No| E1["ApiError 404<br/>Product not found"]
    D1 -->|Yes| S2["Cart.forUser userId<br/>findOneAndUpdate upsert"]
    S2 --> S3["findLine cart, productId<br/>newQty = existing quantity or 0 + quantity"]
    S3 --> Q1{"checkQuantity: newQty more than MAX_CART_QTY 10?"}
    Q1 -->|Yes| E2["ApiError 400<br/>You can buy at most 10 of one product"]
    Q1 -->|No| Q2{"product.stock is 0?"}
    Q2 -->|Yes| E3["ApiError 400<br/>name is out of stock"]
    Q2 -->|No| Q3{"newQty more than product.stock?"}
    Q3 -->|Yes| E4["ApiError 400<br/>Only N of name left in stock"]
    Q3 -->|No| L{"Line already in cart?"}
    L -->|Yes| L1["line.quantity = newQty"]
    L -->|No| L2["cart.items.push product, quantity"]
    L1 --> SV["cart.save<br/>schema validators: 1-10, integer, no duplicate product"]
    L2 --> SV
    SV --> SVOK{"Mongoose validation OK?"}
    SVOK -->|No| E5["Mongoose ValidationError<br/>mapped to 400 Validation failed"]
    SVOK -->|Yes| G1["cartService.getCartWithTotals userId<br/>Cart.forUser: findOneAndUpdate upsert, $setOnInsert<br/>.populate items.product PRODUCT_FIELDS"]
    G1 --> G2{"Any line whose product populated as null?<br/>product was deleted"}
    G2 -->|Yes| G3["Drop those lines<br/>cart.save"]
    G2 -->|No| G4
    G3 --> G4["Per line: lineIssue product, quantity<br/>not available / Out of stock / Only N left<br/>lineTotal = DB price x quantity"]
    G4 --> G5["subtotal and itemCount from lines WITHOUT issue<br/>shipping = calcShipping subtotal, utils/pricing.js<br/>0 if empty, free from Rs 5000, else Rs 250"]
    G5 --> S["sendSuccess 200 'Added to cart'<br/>items, itemCount, subtotal, shipping, total,<br/>hasIssues, freeShippingMin"]
    S --> R
    EP1 --> EH
    EP2 --> EH
    EP3 --> EH
    EP4 --> EH
    EP5 --> EH
    EP6 --> EH
    EV --> EH
    E1 --> EH
    E2 --> EH
    E3 --> EH
    E4 --> EH
    E5 --> EH
    EH["errorHandler<br/>error.middleware.js<br/>status + success false JSON"] --> R
```

**Files involved:** `server/src/app.js` (mounts /api/cart, apiLimiter), `server/src/modules/cart/cart.routes.js` (protect + authorize customer for every route), `server/src/middleware/auth.middleware.js` (protect, authorize), `server/src/middleware/validate.middleware.js` (validate), `server/src/modules/cart/cart.validation.js` (addItemRules), `server/src/modules/cart/cart.controller.js` (thin controller, sendSuccess), `server/src/modules/cart/cart.service.js` (business rules, getCartWithTotals), `server/src/modules/cart/cart.model.js` (Cart schema, Cart.forUser upsert), `server/src/utils/pricing.js` (calcShipping), `server/src/config/constants.js` (LIMITS.MAX_CART_QTY, PRICING), `server/src/middleware/error.middleware.js` (errorHandler)
