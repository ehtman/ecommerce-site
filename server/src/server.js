
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const helmet = require("helmet");

const connectDB = require("./config/db");
const routes = require("./routes");

const notFoundMiddleware = require("./middlewares/not-found.middleware");
const errorMiddleware = require("./middlewares/error.middleware");

const app = express();

app.use(helmet());

app.use(
  cors({
    origin: process.env.FRONTEND_URL || "http://localhost:5173",
    credentials: true,
  })
);

app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Ecommerce API is running",
  });
});

app.use("/api", routes);

app.use(notFoundMiddleware);
app.use(errorMiddleware);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
};

startServer();

module.exports = app;
