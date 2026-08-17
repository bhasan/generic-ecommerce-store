import React, { useState, useCallback, useEffect } from 'react';
import { useApp } from '../../../context/AppContext';
import * as usersApi from '../../../services/usersApi';
import { formatDate } from '../../../utils/dateUtils';
import PendingRegistrationsSection from '../components/PendingRegistrationsSection';

function PendingRegistrationsPage() {
  const { showNotification } = useApp();
  const [pendingRegistrations, setPendingRegistrations] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      setIsLoading(true);
      setPendingRegistrations(await usersApi.getPendingRegistrations());
    } catch (error) {
      showNotification(error.message || 'Failed to load pending registrations', 'error');
    } finally {
      setIsLoading(false);
    }
  }, [showNotification]);

  useEffect(() => { load(); }, [load]);

  const handleApprove = async (userId) => {
    try {
      await usersApi.approveUser(userId);
      showNotification('User approved successfully', 'success');
      load();
    } catch (error) {
      showNotification(error.message || 'Failed to approve user', 'error');
      throw error;
    }
  };

  const handleReject = async (userId, rejectionNote) => {
    try {
      await usersApi.rejectUser(userId, rejectionNote);
      showNotification('User registration rejected', 'success');
      load();
    } catch (error) {
      showNotification(error.message || 'Failed to reject user', 'error');
      throw error;
    }
  };

  return (
    <PendingRegistrationsSection
      isLoading={isLoading}
      pendingRegistrations={pendingRegistrations}
      formatDate={formatDate}
      onApprove={handleApprove}
      onReject={handleReject}
    />
  );
}

export default PendingRegistrationsPage;
