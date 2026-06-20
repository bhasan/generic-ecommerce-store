import { Request, Response } from 'express';
import { OrderingConstraintsService } from '../services/orderingConstraints.service';

const orderingConstraintsService = new OrderingConstraintsService();

export class OrderingConstraintsController {
  async getOrderingConstraints(_req: Request, res: Response) : Promise<void> {
    const constraints = await orderingConstraintsService.getOrderingConstraints();
    res.status(200).json(constraints);
  }

  async updateOrderingConstraints(req: Request, res: Response) : Promise<void> {
    const constraints = await orderingConstraintsService.updateOrderingConstraints(req.body);
    res.status(200).json({ message: 'Ordering constraints updated successfully', constraints });
  }
}
