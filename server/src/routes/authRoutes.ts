import { Router, Request, Response, NextFunction } from "express";
import { RegisterInputSchema, LoginInputSchema } from "../auth/schemas";
import { authService, AuthError } from "../auth/authService";
import { requireAuth } from "../auth/middleware";

export const authRouter = Router();

/**
 * POST /api/auth/register
 * Registers a new user account and returns an authenticated JWT session.
 */
authRouter.post("/register", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const parseResult = RegisterInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    res.status(400).json({
      status: "error",
      error: {
        code: "INVALID_REGISTRATION_DATA",
        message: errorDetails,
      },
    });
    return;
  }

  try {
    const result = await authService.registerUser(parseResult.data);
    res.status(201).json({
      status: "success",
      message: "User registered successfully.",
      data: result,
      token: result.token,
      user: result.user,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        status: "error",
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }
    next(error);
  }
});

/**
 * POST /api/auth/login
 * Verifies email and password credentials, returning a signed JWT token.
 */
authRouter.post("/login", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const parseResult = LoginInputSchema.safeParse(req.body);
  if (!parseResult.success) {
    const errorDetails = parseResult.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    res.status(400).json({
      status: "error",
      error: {
        code: "INVALID_LOGIN_DATA",
        message: errorDetails,
      },
    });
    return;
  }

  try {
    const result = await authService.loginUser(parseResult.data);
    res.status(200).json({
      status: "success",
      message: "Login successful.",
      data: result,
      token: result.token,
      user: result.user,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      res.status(error.statusCode).json({
        status: "error",
        error: {
          code: error.code,
          message: error.message,
        },
      });
      return;
    }
    next(error);
  }
});

/**
 * GET /api/auth/me
 * Restores and returns the currently authenticated user's identity.
 */
authRouter.get("/me", requireAuth, async (req: Request, res: Response): Promise<void> => {
  res.status(200).json({
    status: "success",
    authenticated: true,
    user: req.user,
  });
});

/**
 * POST /api/auth/logout
 * Stateless token logout acknowledgment.
 */
authRouter.post("/logout", (_req: Request, res: Response): void => {
  res.status(200).json({
    status: "success",
    message: "Logged out successfully.",
  });
});
