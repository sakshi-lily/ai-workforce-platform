import { Router, Request, Response } from "express";
import { requireAuth } from "../../auth/middleware";
import { gmailService } from "./gmailService";

export const gmailRouter = Router();

/**
 * GET /api/integrations/gmail/status
 * Returns current Gmail connection status for the authenticated user and organization.
 */
gmailRouter.get("/status", requireAuth, async (req: Request, res: Response) => {
  try {
    const conn = await gmailService.getConnection(req.userId!, req.organizationId!);

    res.json({
      status: "success",
      data: {
        connected: conn?.status === "CONNECTED",
        connectionId: conn?.id || null,
        emailAddress: conn?.status === "CONNECTED" ? conn.email_address : null,
        status: conn?.status || "DISCONNECTED",
        provider: conn?.provider || "google",
      },
    });
  } catch (err: any) {
    res.status(500).json({
      status: "error",
      message: err.message || "Failed to retrieve Gmail status.",
    });
  }
});

/**
 * GET /api/integrations/gmail/connect
 * Initiates the Google OAuth 2.0 flow with anti-CSRF state.
 */
gmailRouter.get("/connect", requireAuth, async (req: Request, res: Response) => {
  try {
    const state = gmailService.generateOAuthState(req.userId!, req.organizationId!);
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI || process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/api/integrations/gmail/callback";

    if (!clientId) {
      res.json({
        status: "success",
        mode: "mock_available",
        authUrl: `/api/integrations/gmail/mock/connect?state=${encodeURIComponent(state)}`,
        state,
        message: "Google OAuth credentials not configured; mock integration available.",
      });
      return;
    }

    const scopes = [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.compose",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" ");

    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.set("client_id", clientId);
    googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", scopes);
    googleAuthUrl.searchParams.set("access_type", "offline");
    googleAuthUrl.searchParams.set("prompt", "consent");
    googleAuthUrl.searchParams.set("state", state);

    res.json({
      status: "success",
      mode: "live",
      authUrl: googleAuthUrl.toString(),
      state,
    });
  } catch (err: any) {
    res.status(500).json({
      status: "error",
      message: err.message || "Failed to initialize OAuth connection.",
    });
  }
});

/**
 * GET /api/integrations/gmail/callback
 * Handles OAuth callback code exchange with state validation.
 */
gmailRouter.get("/callback", requireAuth, async (req: Request, res: Response) => {
  try {
    const { code, state, error } = req.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    if (error) {
      res.status(400).json({
        status: "error",
        error: { code: "OAUTH_ERROR", message: `OAuth Provider Error: ${error}` },
      });
      return;
    }

    if (!code || !state) {
      res.status(400).json({
        status: "error",
        error: { code: "INVALID_CALLBACK", message: "Missing code or state parameters." },
      });
      return;
    }

    // Anti-CSRF verification
    const isValidState = gmailService.verifyOAuthState(
      state,
      req.userId!,
      req.organizationId!
    );
    if (!isValidState) {
      res.status(403).json({
        status: "error",
        error: {
          code: "INVALID_OAUTH_STATE",
          message: "OAuth state verification failed. Potential CSRF or expired session.",
        },
      });
      return;
    }

    // In mock mode or demo, connect account.
    await gmailService.connectMockAccount(req.userId!, req.organizationId!, "user@example.com");

    res.json({
      status: "success",
      message: "Gmail connected successfully.",
    });
  } catch (err: any) {
    res.status(500).json({
      status: "error",
      message: err.message || "Failed to complete Gmail authorization.",
    });
  }
});

/**
 * POST /api/integrations/gmail/disconnect
 * Disconnects the Gmail account for the authenticated user and organization.
 */
gmailRouter.post("/disconnect", requireAuth, async (req: Request, res: Response) => {
  try {
    await gmailService.disconnect(req.userId!, req.organizationId!);
    res.json({
      status: "success",
      message: "Gmail integration disconnected successfully.",
    });
  } catch (err: any) {
    res.status(500).json({
      status: "error",
      message: err.message || "Failed to disconnect Gmail.",
    });
  }
});

/**
 * POST /api/integrations/gmail/mock/connect
 * Fast connection endpoint for testing, dev, and UI demo.
 */
gmailRouter.post("/mock/connect", requireAuth, async (req: Request, res: Response) => {
  try {
    const email = req.body?.email || "dev@ai-workforce.local";
    const conn = await gmailService.connectMockAccount(
      req.userId!,
      req.organizationId!,
      email
    );

    res.json({
      status: "success",
      message: "Mock Gmail account connected successfully.",
      data: {
        connectionId: conn.id,
        emailAddress: conn.email_address,
        status: conn.status,
      },
    });
  } catch (err: any) {
    res.status(500).json({
      status: "error",
      message: err.message || "Failed to connect mock Gmail account.",
    });
  }
});
