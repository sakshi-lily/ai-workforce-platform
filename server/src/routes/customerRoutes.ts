import { Router, Request, Response, NextFunction } from "express";
import {
  getAllCustomers,
  getCustomerByDomain,
  createCustomer,
} from "../services/customerService";

export const customerRouter = Router();

// GET /api/customers - List all customers
customerRouter.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    const customers = await getAllCustomers(limit);
    res.status(200).json({
      status: "success",
      count: customers.length,
      data: customers,
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/customers/lookup?domain=example.com - Parameterized lookup
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

    const customer = await getCustomerByDomain(domain);
    if (!customer) {
      res.status(404).json({
        status: "not_found",
        message: `No customer found with domain '${domain}'`,
      });
      return;
    }

    res.status(200).json({
      status: "success",
      data: customer,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/customers - Insert new customer with parameter validation
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

    const created = await createCustomer({
      companyName,
      domain,
      contactName,
      contactEmail,
      industry,
      status,
    });

    res.status(201).json({
      status: "success",
      message: "Customer record created successfully.",
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
