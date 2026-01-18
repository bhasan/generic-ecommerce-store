import React from 'react';
import HeaderDivider from './HeaderDivider';

function PageHeader({ title, subtitle, icon: Icon, actions, className = '' }) {
  return (
    <>
      <div className={`${className} section-header-surface`.trim()}>
        <div>
          <h2 className="page-title">
            {Icon && <Icon size={28} aria-hidden="true" />}
            {title}
          </h2>
          {subtitle && <p className="page-subtitle">{subtitle}</p>}
        </div>
        {actions}
      </div>
      <HeaderDivider />
    </>
  );
}

export default PageHeader;
