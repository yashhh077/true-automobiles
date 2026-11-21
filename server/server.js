require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const routes = require("./routes/ticketRoutes");

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

// Clear message in the logs if the variable did not reach the server
console.log(
  "MONGO_URI set?",
  MONGO_URI ? "YES (starts with " + MONGO_URI.slice(0, 14) + ")" : "NO",
);
console.log(
  "Env keys seen:",
  Object.keys(process.env)
    .filter((k) => /MONGO|CLIENT|PORT/i.test(k))
    .join(", ") || "none",
);

if (!MONGO_URI && process.env.RENDER) {
  console.error(
    "MONGO_URI is missing on Render. Add it in Environment tab of THIS service and redeploy.",
  );
  process.exit(1);
}

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN
      ? process.env.CLIENT_ORIGIN.split(",")
      : true,
  }),
);
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (req, res) =>
  res.json({ ok: true, db: mongoose.connection.readyState === 1 }),
);
app.use("/api", routes);

app.use((req, res) => res.status(404).json({ message: "Route not found" }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: "Internal server error" });
});

mongoose
  .connect(MONGO_URI || "mongodb://127.0.0.1:27017/true_automotives", {
    serverSelectionTimeoutMS: 15000,
  })
  .then(() => {
    console.log("MongoDB connected");
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("MongoDB connection failed:", err.message);
    process.exit(1);
  });
