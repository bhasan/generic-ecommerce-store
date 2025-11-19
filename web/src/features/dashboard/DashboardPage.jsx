import React from 'react';
import './DashboardPage.css';
import { useApp } from '../../context/AppContext';
import { Flag, Star, Trash2, Check } from 'lucide-react';

function DashboardPage() {
  const { products, updateReview, deleteReview } = useApp();
  
  // Collect all flagged reviews from all products
  const flaggedReviews = [];
  products.forEach(product => {
    if (product.reviews) {
      product.reviews
        .filter(review => review.flagged)
        .forEach(review => {
          flaggedReviews.push({
            ...review,
            productId: product.id,
            productName: product.name
          });
        });
    }
  });

  const handleUnflag = (productId, reviewId) => {
    updateReview(productId, reviewId, { flagged: false });
  };

  const handleDeleteReview = (productId, reviewId, productName) => {
    if (window.confirm(`Delete this review from "${productName}"?`)) {
      deleteReview(productId, reviewId);
    }
  };

  return (
    <div className="dashboard-page-container">
      <div className="dashboard-header">
        <div>
          <h2 className="page-title">Store Dashboard</h2>
          <p className="page-subtitle">Store management and analytics</p>
        </div>
      </div>

      {/* HIDDEN: Flagged Reviews Stats - may re-enable later */}
      {/* <div className="dashboard-stats">
        <div className="stat-card">
          <div className="stat-icon stat-icon-warning">
            <Flag size={24} />
          </div>
          <div className="stat-content">
            <span className="stat-value">{flaggedReviews.length}</span>
            <span className="stat-label">Flagged Reviews</span>
          </div>
        </div>
      </div> */}

      {/* HIDDEN: Flagged Reviews Section - may re-enable later */}
      {/* <div className="flagged-reviews-section">
        <h3 className="section-title">Flagged Reviews</h3>
        
        {flaggedReviews.length === 0 ? (
          <div className="empty-state">
            <Flag size={64} className="empty-icon" />
            <p>No flagged reviews. All reviews are in good standing!</p>
          </div>
        ) : (
          <div className="flagged-reviews-list">
            {flaggedReviews.map(review => (
              <div key={`${review.productId}-${review.id}`} className="flagged-review-card">
                <div className="flagged-review-header">
                  <div>
                    <h4 className="product-link">{review.productName}</h4>
                    <div className="reviewer-info">
                      <span className="reviewer-name">{review.userName}</span>
                      <div className="review-rating">
                        {[1, 2, 3, 4, 5].map(i => (
                          <Star
                            key={i}
                            size={14}
                            fill={i <= review.rating ? '#fbbf24' : 'none'}
                            color={i <= review.rating ? '#fbbf24' : '#9ca3af'}
                          />
                        ))}
                      </div>
                      <span className="review-date">{review.date}</span>
                    </div>
                  </div>
                  <span className="flagged-badge-large">
                    <Flag size={16} />
                    Flagged
                  </span>
                </div>

                <div className="flagged-review-content">
                  <p className="review-comment">{review.comment}</p>
                </div>

                <div className="flagged-review-stats">
                  <div className="review-votes-display">
                    <span className="vote-stat vote-helpful">
                      👍 {review.helpful} helpful
                    </span>
                    <span className="vote-stat vote-not-helpful">
                      👎 {review.notHelpful} not helpful
                    </span>
                  </div>
                </div>

                <div className="flagged-review-actions">
                  <button
                    onClick={() => handleUnflag(review.productId, review.id)}
                    className="btn-action btn-approve"
                  >
                    <Check size={16} />
                    <span>Approve Review</span>
                  </button>
                  <button
                    onClick={() => handleDeleteReview(review.productId, review.id, review.productName)}
                    className="btn-action btn-delete-flagged"
                  >
                    <Trash2 size={16} />
                    <span>Delete Review</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div> */}
    </div>
  );
}

export default DashboardPage;