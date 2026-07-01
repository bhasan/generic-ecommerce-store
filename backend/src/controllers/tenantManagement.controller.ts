import { Request, Response } from 'express';
import { tenantManagementService, AuditActor } from '../services/tenantManagement.service';
import { successResponse } from '../utils/responseEnvelope';

function getActor(req: Request): AuditActor {
  return {
    userId: req.user?.userId,
    username: req.user?.username,
    requestId: req.requestId,
  };
}

export class TenantManagementController {
  async list(req: Request, res: Response): Promise<void> {
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const tenants = await tenantManagementService.listTenants(status);
    res.json(successResponse(tenants));
  }

  async create(req: Request, res: Response): Promise<void> {
    const { slug, name, plan, adminUsername, adminPassword } = req.body;

    if (!slug || typeof slug !== 'string') {
      res.status(400).json({ error: { message: 'slug is required', code: 'BAD_REQUEST' } });
      return;
    }
    if (!name || typeof name !== 'string') {
      res.status(400).json({ error: { message: 'name is required', code: 'BAD_REQUEST' } });
      return;
    }
    if (!adminUsername || typeof adminUsername !== 'string') {
      res.status(400).json({ error: { message: 'adminUsername is required', code: 'BAD_REQUEST' } });
      return;
    }
    if (!adminPassword || typeof adminPassword !== 'string') {
      res.status(400).json({ error: { message: 'adminPassword is required', code: 'BAD_REQUEST' } });
      return;
    }

    const result = await tenantManagementService.createTenant({
      slug,
      name,
      plan: plan ?? undefined,
      adminUsername,
      adminPassword,
    }, getActor(req));

    res.status(201).json(successResponse(result));
  }

  async setStatus(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
      res.status(400).json({ error: { message: 'status must be ACTIVE or SUSPENDED', code: 'BAD_REQUEST' } });
      return;
    }

    const tenant = await tenantManagementService.setTenantStatus(id, status, getActor(req));
    res.json(successResponse({ tenant }));
  }

  async remove(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const tenant = await tenantManagementService.deleteTenant(id, getActor(req));
    res.json(successResponse({ tenant }));
  }

  async update(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const { name, plan } = req.body;

    if (name === undefined && plan === undefined) {
      res.status(400).json({ error: { message: 'name or plan is required', code: 'BAD_REQUEST' } });
      return;
    }
    if (name !== undefined && (typeof name !== 'string' || !name.trim())) {
      res.status(400).json({ error: { message: 'name must be a non-empty string', code: 'BAD_REQUEST' } });
      return;
    }
    if (plan !== undefined && plan !== null && typeof plan !== 'string') {
      res.status(400).json({ error: { message: 'plan must be a string or null', code: 'BAD_REQUEST' } });
      return;
    }

    const tenant = await tenantManagementService.updateTenant(
      id,
      {
        name: typeof name === 'string' ? name.trim() : undefined,
        plan: typeof plan === 'string' ? plan.trim() : plan,
      },
      getActor(req),
    );
    res.json(successResponse({ tenant }));
  }

  async regenerateTokens(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const tokens = await tenantManagementService.regenerateTokens(id, getActor(req));
    res.json(successResponse(tokens));
  }
}

export const tenantManagementController = new TenantManagementController();
