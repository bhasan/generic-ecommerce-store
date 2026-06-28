import { renderHook, act } from '@testing-library/react';
import useFormValidation from './useFormValidation';

describe('useFormValidation', () => {
  it('initializes with provided initialErrors', () => {
    const { result } = renderHook(() =>
      useFormValidation({ username: '', password: '' })
    );

    expect(result.current.errors).toEqual({ username: '', password: '' });
  });

  it('initializes with empty object when no initialErrors provided', () => {
    const { result } = renderHook(() => useFormValidation());

    expect(result.current.errors).toEqual({});
  });

  it('clearFieldError clears a specific field error', () => {
    const { result } = renderHook(() =>
      useFormValidation({ username: 'Required', password: 'Required' })
    );

    act(() => {
      result.current.clearFieldError('username');
    });

    expect(result.current.errors).toEqual({ username: '', password: 'Required' });
  });

  it('clearFieldError does not call setErrors when field error is already empty', () => {
    const { result } = renderHook(() =>
      useFormValidation({ username: '', password: 'Required' })
    );

    act(() => {
      result.current.clearFieldError('username');
    });

    expect(result.current.errors).toEqual({ username: '', password: 'Required' });
  });

  it('setFieldErrors updates all errors', () => {
    const { result } = renderHook(() =>
      useFormValidation({ username: '', password: '' })
    );

    act(() => {
      result.current.setFieldErrors({ username: 'Required', password: '' });
    });

    expect(result.current.errors).toEqual({ username: 'Required', password: '' });
  });

  it('clearErrors resets to initialErrors', () => {
    const { result } = renderHook(() =>
      useFormValidation({ username: '', password: '' })
    );

    act(() => {
      result.current.setFieldErrors({ username: 'Required', password: 'Required' });
    });

    expect(result.current.errors).toEqual({ username: 'Required', password: 'Required' });

    act(() => {
      result.current.clearErrors();
    });

    expect(result.current.errors).toEqual({ username: '', password: '' });
  });

  it('hasErrors returns true when any error is non-empty', () => {
    const { result } = renderHook(() =>
      useFormValidation({ username: '', password: '' })
    );

    expect(result.current.hasErrors).toBe(false);

    act(() => {
      result.current.setFieldErrors({ username: 'Required', password: '' });
    });

    expect(result.current.hasErrors).toBe(true);
  });

  it('hasErrors returns false when all errors are empty', () => {
    const { result } = renderHook(() =>
      useFormValidation({ username: '', password: '' })
    );

    expect(result.current.hasErrors).toBe(false);

    act(() => {
      result.current.setFieldErrors({ username: 'Required', password: 'Required' });
    });

    expect(result.current.hasErrors).toBe(true);

    act(() => {
      result.current.clearErrors();
    });

    expect(result.current.hasErrors).toBe(false);
  });
});
