import React, { useState } from 'react';
import './SpaceTravelerGraphic.css';

export default function SpaceTravelerGraphic() {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <div className={`space-traveler-graphic-wrap ${isLoaded ? 'is-loaded' : 'is-loading'}`}>
      {!isLoaded && <div className="space-traveler-shimmer" />}
      <div className={`space-traveler-container ${isLoaded ? 'visible' : 'hidden'}`}>
        <img
          src="/images/space_traveler_3d.png"
          alt="Space Traveler 3D CGI"
          className="space-traveler-graphic"
          onLoad={() => setIsLoaded(true)}
          fetchPriority="high"
        />
      </div>
    </div>
  );
}
