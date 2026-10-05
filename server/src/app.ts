import express, { Request, Response } from "express";
import cors from "cors";

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

// Health check endpoint (Phase 3 milestone requirement)
app.get("/api/health", (_req: Request, res: Response) => {
  res.status(200).json({ status: "ok" });
});
