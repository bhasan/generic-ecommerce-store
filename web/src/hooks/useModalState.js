import { useState } from 'react';

function useModalState(initialData = null) {
  const [isOpen, setIsOpen] = useState(false);
  const [data, setDataState] = useState(initialData);

  const openModal = (payload = null) => {
    setDataState(payload);
    setIsOpen(true);
  };

  const closeModal = () => {
    setIsOpen(false);
    setDataState(null);
  };

  const setData = (payload) => {
    setDataState(payload);
  };

  return { isOpen, data, openModal, closeModal, setData };
}

export default useModalState;
