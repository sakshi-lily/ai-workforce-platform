import { Router, Request, Response, NextFunction } from "express";
import {
  getAllCustomers,
  getCustomerByDomain,
  createCustomer,
} from "../services/customerService";
import { requireAuth } from "../auth/middleware";

export const customerRouter = Router();

// Protect all customer routes with authoritative authentication
customerRouter.use(requireAuth);

// GET /api/customers - List customers scoped to authenticated user's organization
customerRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    // Host-controlled tenant boundary: strictly use req.user.organizationId
    const organizationId = req.user!.organizationId;
    const result = await getAllCustomers(organizationId, limit);
    res.status(200).json({
      status: "success",
      source: result.source, // "cache" (HIT) or "database" (MISS)
      latencyMs: result.latencyMs,
      count: result.data.length,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/customers/lookup?domain=example.com - Parameterized lookup scoped to authenticated organization
customerRouter.get("/lookup", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const domain = req.query.domain as string;
    if (!domain || !domain.trim()) {
      res.status(400).json({
        status: "error",
        message: "Query parameter 'domain' is required.",
      });
      return;
    }

    const organizationId = req.user!.organizationId;
    const result = await getCustomerByDomain(domain, organizationId);
    if (!result.data) {
      res.status(404).json({
        status: "not_found",
        message: `No customer found with domain '${domain}'`,
        source: result.source,
        latencyMs: result.latencyMs,
      });
      return;
    }

    res.status(200).json({
      status: "success",
      source: result.source,
      latencyMs: result.latencyMs,
      data: result.data,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/customers - Insert new customer with server-enforced organization ownership
customerRouter.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { companyName, domain, contactName, contactEmail, industry, status } = req.body;

    if (!companyName || typeof companyName !== "string" || !companyName.trim()) {
      res.status(400).json({
        status: "error",
        message: "Field 'companyName' is required and must be a non-empty string.",
      });
      return;
    }

    if (!domain || typeof domain !== "string" || !domain.trim()) {
      res.status(400).json({
        status: "error",
        message: "Field 'domain' is required and must be a valid company domain.",
      });
      return;
    }

    // Enforce server-derived identity: ignore any client-supplied userId or organizationId
    const created = await createCustomer({
      userId: req.user!.id,
      organizationId: req.user!.organizationId,
      companyName,
      domain,
      contactName,
      contactEmail,
      industry,
      status,
    });

    res.status(201).json({
      status: "success",
      message: "Customer record created and cache invalidated successfully.",
      data: created,
    });
  } catch (error: unknown) {
    // Handle MySQL unique key constraint violation
    if (typeof error === "object" && error !== null && "code" in error && error.code === "ER_DUP_ENTRY") {
      res.status(409).json({
        status: "conflict",
        message: "A customer with this domain already exists in this workspace.",
      });
      return;
    }
    next(error);
  }
});
