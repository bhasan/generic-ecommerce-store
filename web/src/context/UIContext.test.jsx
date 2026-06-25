import { renderHook, act } from '@testing-library/react';
import { UIProvider, useUIContext } from './UIContext';
import { describe, it, expect } from 'vitest';

const wrapper = ({ children }) => <UIProvider>{children}</UIProvider>;

describe('UIContext', () => {
  it('showNotification sets notification state', () => {
    const { result } = renderHook(() => useUIContext(), { wrapper });
    act(() => result.current.showNotification('hello', 'success'));
    expect(result.current.notification).toEqual({ message: 'hello', type: 'success', action: null });
  });

  it('closeNotification clears notification state', () => {
    const { result } = renderHook(() => useUIContext(), { wrapper });
    act(() => result.current.showNotification('hello', 'success'));
    act(() => result.current.closeNotification());
    expect(result.current.notification).toBeNull();
  });

  it('setReturnPath updates returnPath', () => {
    const { result } = renderHook(() => useUIContext(), { wrapper });
    act(() => result.current.setReturnPath('/products'));
    expect(result.current.returnPath).toBe('/products');
  });

  it('throws when used outside UIProvider', () => {
    expect(() => renderHook(() => useUIContext())).toThrow('useUIContext must be used within UIProvider');
  });
});
