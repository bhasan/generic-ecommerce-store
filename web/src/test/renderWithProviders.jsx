import React from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { AppProvider } from '../context/AppContext';

export const renderWithProviders = (ui, { route = '/' } = {}) => {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppProvider>
        {ui}
      </AppProvider>
    </MemoryRouter>
  );
};
