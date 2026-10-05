import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { healthRouter } from "./routes/healthRoutes";
import { customerRouter } from "./routes/customerRoutes";
import { aiRouter } from "./routes/aiRoutes";
import { agentRouter } from "./routes/agentRoutes";

export const app = express();

// Enable CORS for the React development client
app.use(
  cors({
    origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// Mount routers
app.use("/api/health", healthRouter);
app.use("/api/customers", customerRouter);
app.use("/api/ai", aiRouter);
app.use("/api/agent", agentRouter);

// Catch-all 404 handler
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    status: "error",
    message: "Endpoint not found",
  });
});

// Centralized error handler preventing internal provider/database error leakage
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error("[Server Error]", err);
  const message =
    err instanceof Error && process.env.NODE_ENV === "development"
      ? err.message
      : "Internal server error occurred";

  res.status(500).json({
    status: "error",
    message,
  });
});
