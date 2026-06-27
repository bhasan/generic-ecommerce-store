import { useState } from 'react';

function useFormValidation(initialErrors = {}) {
  const [errors, setErrors] = useState(initialErrors);

  const clearFieldError = (field) => {
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const setFieldErrors = (newErrors) => setErrors(newErrors);

  const clearErrors = () => setErrors(initialErrors);

  const hasErrors = Object.values(errors).some(Boolean);

  return { errors, clearFieldError, setFieldErrors, clearErrors, hasErrors };
}

export default useFormValidation;
