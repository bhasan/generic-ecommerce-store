import React from 'react';
import { Store } from 'lucide-react';
import PageHeader from '../../components/common/PageHeader';

function ManageStoreHeader() {
  return (
    <PageHeader
      className="manage-store-header"
      title="Manage Store"
      subtitle="Products, categories, media, and bulk operations"
      icon={Store}
    />
  );
}

export default ManageStoreHeader;
