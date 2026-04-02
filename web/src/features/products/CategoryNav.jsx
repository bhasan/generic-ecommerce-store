import React, { useState } from 'react';
import './CategoryNav.css';

function CategoryNav({ categories }) {
  const [activeId, setActiveId] = useState(null);

  const scrollTo = (id) => {
    const el = document.getElementById(`category-${id}`);
    if (!el) return;
    const navbar = document.querySelector('.navbar');
    const banner = document.querySelector('.announcement-banner');
    const offset = (navbar?.offsetHeight || 0) + (banner?.offsetHeight || 0) + 16;
    const top = el.getBoundingClientRect().top + window.scrollY - offset;
    window.scrollTo({ top, behavior: 'smooth' });
    setActiveId(id);
  };

  return (
    <div className="category-nav">
      {categories.map(cat => (
        <button
          key={cat.id}
          className={`category-nav-btn${activeId === cat.id ? ' active' : ''}`}
          onClick={() => scrollTo(cat.id)}
        >
          {cat.name}
        </button>
      ))}
    </div>
  );
}

export default CategoryNav;
