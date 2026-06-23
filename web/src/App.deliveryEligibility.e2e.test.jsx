import React from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { AppProvider } from './context/AppContext';
import { renderWithProviders } from './test/renderWithProviders';

const journeyProduct = vi.hoisted(() => ({
  id: 101,
  name: 'Blue Dream',
  images: [],
  variants: [
    {
      id: 1001,
      label: 'Default',
      basePrice: 45,
      stock: 10,
      stockEnabled: false,
      isDefault: true,
      active: true,
      pricingMode: 'UNIT',
      quantityOptions: [{ quantity: 1, sortOrder: 0 }],
      priceBreaks: [],
    },
  ],
  category: { name: 'Flower' },
}));

const baseCustomer = vi.hoisted(() => ({
  id: 1,
  username: 'customer-one',
  email: 'customer-one@example.com',
  cashapp: '$customer-one',
  roles: ['CUSTOMER'],
  address: '123 Main St, Houston, TX 77083',
}));

vi.mock('./components/common/AnnouncementBanner', () => ({
  default: () => null,
}));

vi.mock('./features/products/ProductsPage', async () => {
  const { useNavigate } = await import('react-router-dom');
  const { useApp } = await import('./context/AppContext');

  function ProductsPageTestDouble() {
    const navigate = useNavigate();
    const { addToCart } = useApp();

    return (
      <div>
        <h1>Products</h1>
        <button
          type="button"
          onClick={() => {
            addToCart(journeyProduct, journeyProduct.variants[0], 1);
            navigate('/checkout', { state: { deliveryMethod: 'DELIVERY' } });
          }}
        >
          Start delivery checkout
        </button>
      </div>
    );
  }

  return { default: ProductsPageTestDouble };
});

const jsonResponse = (body, init = {}) => new Response(
  JSON.stringify(body),
  {
    status: init.status ?? 200,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  }
);

const seedAuthenticatedCustomer = (user = baseCustomer) => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('authToken', 'customer-token');
  localStorage.setItem('userData', JSON.stringify(user));
};

const installApiMock = ({
  eligibilityResult,
  createdOrder = {
    id: 901,
    status: 'PLACED',
    createdAt: '2026-04-04T18:30:00.000Z',
    deliveryAddress: '123 Main St, Houston, TX 77083',
    deliverySource: 'ZIP_FALLBACK',
    deliveryDistanceMiles: null,
  },
  initialProfile = baseCustomer,
  refreshedProfile = baseCustomer,
} = {}) => {
  let profileCalls = 0;
  let createdOrders = [];
  const createOrderBodies = [];
  const eligibilityBodies = [];

  const fetchMock = vi.fn(async (input, init = {}) => {
    const requestUrl = typeof input === 'string' ? input : input.url;
    const url = new URL(requestUrl, 'http://localhost');
    const method = init.method ?? 'GET';

    if (method === 'GET' && url.pathname === '/api/auth/profile') {
      profileCalls += 1;
      return jsonResponse(profileCalls === 1 ? initialProfile : refreshedProfile);
    }

    if (method === 'GET' && url.pathname === '/api/products') {
      return jsonResponse([journeyProduct]);
    }

    if (method === 'GET' && url.pathname === '/api/categories') {
      return jsonResponse([]);
    }

    if (method === 'GET' && url.pathname === '/api/orders') {
      return jsonResponse(createdOrders);
    }

    if (method === 'GET' && url.pathname === '/api/config') {
      return jsonResponse({
        taxRate: 0.0825,
        minimumDeliveryOrder: 35,
        minimumDeliveryOrderEnabled: true,
        deliveryRadiusMiles: 5,
        pickupLocation: '101 Example Ave',
        storeCashappUsername: '$SmokeStationHQ',
        paymentSettings: {
          cashapp: { enabled: true, handle: '$SmokeStationHQ' },
          zelle: { enabled: false, handle: '' },
          venmo: { enabled: false, handle: '' },
        },
        storeSettings: {
          name: 'Smoke Station',
          address: '101 Example Ave',
          phoneNumber: '555-0100',
        },
      });
    }

    if (method === 'GET' && url.pathname === '/api/storecredit/1') {
      return jsonResponse({ balance: 0 });
    }

    if (method === 'GET' && url.pathname === '/api/notifications') {
      return jsonResponse([]);
    }

    if (method === 'GET' && url.pathname === '/api/notifications/unread-count') {
      return jsonResponse({ count: 0 });
    }

    if (method === 'POST' && url.pathname === '/api/orders/delivery-eligibility') {
      const body = JSON.parse(init.body);
      eligibilityBodies.push(body);
      return jsonResponse(eligibilityResult);
    }

    if (method === 'POST' && url.pathname === '/api/orders') {
      const body = JSON.parse(init.body);
      createOrderBodies.push(body);
      createdOrders = [createdOrder];
      return jsonResponse(
        { message: 'Order created successfully', order: createdOrder },
        { status: 201 }
      );
    }

    throw new Error(`Unhandled fetch request: ${method} ${url.pathname}`);
  });

  vi.stubGlobal('fetch', fetchMock);

  return {
    createOrderBodies,
    eligibilityBodies,
    getProfileCalls: () => profileCalls,
  };
};

describe('delivery eligibility end-to-end journey', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedAuthenticatedCustomer();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('keeps checkout blocked when the saved delivery address is outside the delivery radius', async () => {
    const api = installApiMock({
      eligibilityResult: {
        deliverable: false,
        deliveryStatus: 'OUT_OF_ZONE',
        deliverySource: 'GOOGLE_GEOCODING',
        distanceMiles: 7.1,
        thresholdMiles: 5,
        message: 'This address is 7.10 miles away, outside the 5.00 mile delivery radius.',
      },
    });

    renderWithProviders(
      <AppProvider>
        <App />
      </AppProvider>,
      { route: '/products' }
    );

    fireEvent.click(await screen.findByRole('button', { name: /start delivery checkout/i }));

    expect(
      await screen.findByText(/outside the 5\.00 mile delivery radius/i)
    ).toBeInTheDocument();

    expect(api.eligibilityBodies).toEqual([
      {
        deliveryAddress: {
          street: '123 Main St',
          apartment: '',
          city: 'Houston',
          state: 'TX',
          zipCode: '77083',
        },
      },
    ]);
    expect(screen.getByRole('button', { name: /place order/i })).toBeDisabled();
    expect(api.createOrderBodies).toHaveLength(0);
  });

  it('places a delivery order through ZIP fallback and shows the server snapshot on the success page', async () => {
    const api = installApiMock({
      eligibilityResult: {
        deliverable: true,
        deliveryStatus: 'IN_ZONE',
        deliverySource: 'ZIP_FALLBACK',
        distanceMiles: null,
        thresholdMiles: 5,
        message: 'Delivery verified by ZIP fallback while Google address verification is temporarily unavailable.',
      },
      refreshedProfile: {
        ...baseCustomer,
        deliveryStatus: 'IN_ZONE',
        deliverySource: 'ZIP_FALLBACK',
        deliveryDistanceMiles: null,
        deliveryCheckedAt: '2026-04-04T18:30:00.000Z',
      },
    });

    renderWithProviders(
      <AppProvider>
        <App />
      </AppProvider>,
      { route: '/products' }
    );

    fireEvent.click(await screen.findByRole('button', { name: /start delivery checkout/i }));

    expect(
      await screen.findByText(/delivery verified by zip fallback/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /place order/i }));

    expect(await screen.findByText(/your order has been created/i)).toBeInTheDocument();

    expect(api.createOrderBodies).toEqual([
      {
        items: [{ variantId: 1001, quantity: 1 }],
        cashAppUsername: '$customer-one',
        deliveryMethod: 'DELIVERY',
        paymentMethod: 'EXTERNAL',
        deliveryAddress: {
          street: '123 Main St',
          apartment: '',
          city: 'Houston',
          state: 'TX',
          zipCode: '77083',
        },
      },
    ]);

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: /complete order/i }));

    expect(await screen.findByText(/thank you for your order/i)).toBeInTheDocument();
    expect(screen.getAllByText('123 Main St, Houston, TX 77083').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('#000901')).toBeInTheDocument();

    await waitFor(() => expect(api.getProfileCalls()).toBeGreaterThanOrEqual(2));
  });
});
