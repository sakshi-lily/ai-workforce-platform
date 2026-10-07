import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { healthRouter } from "./routes/healthRoutes";
import { customerRouter } from "./routes/customerRoutes";
import { aiRouter } from "./routes/aiRoutes";
import { agentRouter } from "./routes/agentRoutes";
import { ragRouter } from "./routes/ragRoutes";
import { authRouter } from "./routes/authRoutes";
import { taskRouter } from "./tasks/taskRoutes";
import { gmailRouter } from "./integrations/gmail/gmailRoutes";
import { approvalRouter } from "./approvals/approvalRoutes";
import { workerRouter } from "./jobs/workerRoutes";
import { reliabilityRouter } from "./reliability/reliabilityRoutes";

export const app = express();

// Enable CORS (configurable via CORS_ORIGIN in production)
const allowedOrigins = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(",").map((o) => o.trim()) : ["http://localhost:5173", "http://127.0.0.1:5173"];

app.use(
  cors({
    origin: allowedOrigins,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Execution-Mode"],
  })
);

app.use(express.json());

// Mount routers
app.use("/api", reliabilityRouter);
app.use("/api/auth", authRouter);
app.use("/api/health", healthRouter);
app.use("/api/customers", customerRouter);
app.use("/api/ai", aiRouter);
app.use("/api/agent", agentRouter);
app.use("/api/rag", ragRouter);
app.use("/api/tasks", taskRouter);
app.use("/api/jobs", workerRouter);
app.use("/api/integrations/gmail", gmailRouter);
app.use("/api/approvals", approvalRouter);

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
