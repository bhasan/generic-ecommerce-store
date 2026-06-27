import React from 'react';
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { render } from '@testing-library/react';
import OrderStatusStepper from './OrderStatusStepper';

describe('OrderStatusStepper', () => {
  it('renders delivery steps for delivery method', () => {
    render(<OrderStatusStepper status="OUT_FOR_DELIVERY" deliveryMethod="DELIVERY" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Preparing')).toBeInTheDocument();
    expect(screen.getByText('Out for Delivery')).toBeInTheDocument();
    expect(screen.getByText('Delivered')).toBeInTheDocument();
    expect(screen.queryByText('Ready for Pickup')).not.toBeInTheDocument();
  });

  it('renders pickup steps for pickup method', () => {
    render(<OrderStatusStepper status="READY_FOR_PICKUP" deliveryMethod="PICKUP" />);
    expect(screen.getByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('Preparing')).toBeInTheDocument();
    expect(screen.getByText('Ready for Pickup')).toBeInTheDocument();
    expect(screen.getByText('Arrived')).toBeInTheDocument();
    expect(screen.getByText('Picked Up')).toBeInTheDocument();
    expect(screen.queryByText('Out for Delivery')).not.toBeInTheDocument();
  });

  it('treats curbside as pickup method', () => {
    render(<OrderStatusStepper status="APPROVED" deliveryMethod="CURBSIDE" />);
    expect(screen.getByText('Ready for Pickup')).toBeInTheDocument();
    expect(screen.queryByText('Out for Delivery')).not.toBeInTheDocument();
  });

  it('defaults to pending index for unknown status', () => {
    const { container } = render(<OrderStatusStepper status="NOT_FULFILLING" deliveryMethod="DELIVERY" />);
    const firstStep = container.querySelector('.stepper-step');
    expect(firstStep).toHaveClass('active');
  });
});
