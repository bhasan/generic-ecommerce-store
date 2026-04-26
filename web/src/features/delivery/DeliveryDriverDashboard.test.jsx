import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import DeliveryDriverDashboard from './DeliveryDriverDashboard';

const useAppMock = vi.fn();
const ordersApi = vi.hoisted(() => ({
  getReadyForDeliveryOrders: vi.fn(),
  getOutForDeliveryOrders: vi.fn(),
  updateOrderStatus: vi.fn(),
}));

vi.mock('../../context/AppContext', () => ({
  useApp: () => useAppMock(),
  AppProvider: ({ children }) => children,
}));

vi.mock('../../services/ordersApi', () => ordersApi);

vi.mock('../../components/common/HeaderDivider', () => ({
  default: () => null,
}));

describe('DeliveryDriverDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    useAppMock.mockReturnValue({
      showNotification: vi.fn(),
    });
    ordersApi.getReadyForDeliveryOrders.mockResolvedValue([]);
    ordersApi.getOutForDeliveryOrders.mockResolvedValue([]);
  });

  it('polls delivery orders while the dashboard is mounted', async () => {
    const intervalSpy = vi.spyOn(global, 'setInterval');

    render(<DeliveryDriverDashboard />);

    await waitFor(() => expect(ordersApi.getReadyForDeliveryOrders).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(ordersApi.getOutForDeliveryOrders).toHaveBeenCalledTimes(1));

    const refreshCall = [...intervalSpy.mock.calls].reverse().find(([, delay]) => delay === 60000);
    expect(refreshCall).toBeTruthy();

    const refreshFn = refreshCall?.[0];
    expect(typeof refreshFn).toBe('function');

    await act(async () => {
      await refreshFn?.();
    });

    expect(ordersApi.getReadyForDeliveryOrders).toHaveBeenCalledTimes(2);
    expect(ordersApi.getOutForDeliveryOrders).toHaveBeenCalledTimes(2);

    intervalSpy.mockRestore();
  });

  it('pauses background polling while a driver is editing the route', async () => {
    const intervalSpy = vi.spyOn(global, 'setInterval');
    const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

    ordersApi.getReadyForDeliveryOrders.mockResolvedValue([
      { id: 101, items: [{ productName: 'Wrap', quantity: 1 }], user: { address: '1 Main St' } },
    ]);
    ordersApi.getOutForDeliveryOrders.mockResolvedValue([]);

    render(<DeliveryDriverDashboard />);

    await waitFor(() => expect(screen.getByText(/order: #101/i)).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /start route/i }));
    const checkbox = await screen.findByRole('checkbox');
    fireEvent.click(checkbox);

    await waitFor(() => expect(checkbox).toBeChecked());
    const deliveryRefreshIntervals = intervalSpy.mock.calls.filter(([, delay]) => delay === 60000);
    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(deliveryRefreshIntervals).toHaveLength(1);

    intervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });
});
