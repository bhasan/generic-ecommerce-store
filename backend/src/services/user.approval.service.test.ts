import { describe, it, expect, vi } from 'vitest';
import { UserApprovalService } from './user.approval.service';

const prismaMock = vi.hoisted(() => ({
  user: {
    count: vi.fn(),
  },
}));

vi.mock('../config/database', () => ({
  default: prismaMock,
}));

describe('UserApprovalService', () => {
  it('returns pending registration count correctly', async () => {
    const approvalService = new UserApprovalService();
    prismaMock.user.count.mockResolvedValue(5);

    const count = await approvalService.getPendingRegistrationCount();
    expect(count).toBe(5);
    expect(prismaMock.user.count).toHaveBeenCalledWith({
      where: { approved: false, rejected: false },
    });
  });
});
