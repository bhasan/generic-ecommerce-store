import { renderHook, act } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import useModalState from './useModalState';

describe('useModalState', () => {
  it('initializes with isOpen=false and data=null', () => {
    const { result } = renderHook(() => useModalState());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.data).toBe(null);
  });

  it('openModal() sets isOpen=true and data stays null', () => {
    const { result } = renderHook(() => useModalState());
    act(() => result.current.openModal());
    expect(result.current.isOpen).toBe(true);
    expect(result.current.data).toBe(null);
  });

  it('openModal(payload) sets isOpen=true and data to payload', () => {
    const { result } = renderHook(() => useModalState());
    const payload = { id: 1 };
    act(() => result.current.openModal(payload));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.data).toEqual(payload);
  });

  it('closeModal() sets isOpen=false and resets data to null', () => {
    const { result } = renderHook(() => useModalState());
    act(() => result.current.openModal({ id: 1 }));
    act(() => result.current.closeModal());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.data).toBe(null);
  });

  it('setData(payload) updates data without toggling isOpen', () => {
    const { result } = renderHook(() => useModalState());
    act(() => result.current.openModal({ id: 1 }));
    act(() => result.current.setData({ id: 2 }));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.data).toEqual({ id: 2 });
  });

  it('initialData parameter sets initial data value', () => {
    const { result } = renderHook(() => useModalState({ default: true }));
    expect(result.current.isOpen).toBe(false);
    expect(result.current.data).toEqual({ default: true });
  });
});
