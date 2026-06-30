import { Request, Response } from 'express';
import { tenantManagementService } from '../services/tenantManagement.service';
import { successResponse } from '../utils/responseEnvelope';

export class TenantManagementController {
  async list(_req: Request, res: Response): Promise<void> {
    const tenants = await tenantManagementService.listTenants();
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
    });

    res.status(201).json(successResponse(result));
  }

  async setStatus(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const { status } = req.body;

    if (status !== 'ACTIVE' && status !== 'SUSPENDED') {
      res.status(400).json({ error: { message: 'status must be ACTIVE or SUSPENDED', code: 'BAD_REQUEST' } });
      return;
    }

    const tenant = await tenantManagementService.setTenantStatus(id, status);
    res.json(successResponse({ tenant }));
  }

  async regenerateTokens(req: Request, res: Response): Promise<void> {
    const id = parseInt(req.params.id, 10);
    const tokens = await tenantManagementService.regenerateTokens(id);
    res.json(successResponse(tokens));
  }
}

export const tenantManagementController = new TenantManagementController();
