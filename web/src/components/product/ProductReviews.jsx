import React, { useState } from 'react';
import './ProductReviews.css';
import { useApp } from '../../context/AppContext';
import { isGuest as checkIsGuest, ROLES } from '../../utils/roles';
import ConfirmationModal from '../common/ConfirmationModal';
import { Star, ThumbsUp, ThumbsDown, Flag, MessageCircle, Trash2, Send } from 'lucide-react';

function ProductReviews({ productId }) {
  const { currentUser, products, addReview, updateReview, deleteReview, addReviewReply, voteReview, flagReview } = useApp();
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [rating, setRating] = useState(0); // Default to 0, not 5
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState('');
  const [replyText, setReplyText] = useState({});
  const [showReplyForm, setShowReplyForm] = useState({});
  const [deleteReviewModalOpen, setDeleteReviewModalOpen] = useState(false);
  const [reviewToDelete, setReviewToDelete] = useState(null);
  
  const product = products.find(p => p.id === productId);
  const reviews = product?.reviews || [];
  const isGuest = checkIsGuest(currentUser);
  const canModerate = currentUser.role === ROLES.MANAGEMENT || currentUser.role === ROLES.ADMIN;
  
  const averageRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : 0;

  const handleSubmitReview = (e) => {
    e.preventDefault();
    if (isGuest) {
      alert('Please login to leave a review');
      return;
    }
    if (rating === 0) {
      alert('Please select a rating');
      return;
    }
    addReview(productId, { rating, comment });
    setRating(0);
    setComment('');
    setShowReviewForm(false);
  };

  const handleReply = (reviewId) => {
    if (replyText[reviewId]?.trim()) {
      addReviewReply(productId, reviewId, replyText[reviewId]);
      setReplyText({ ...replyText, [reviewId]: '' });
      setShowReplyForm({ ...showReplyForm, [reviewId]: false });
    }
  };

  return (
    <div className="product-reviews-section">
      <div className="reviews-header">
        <div className="reviews-summary">
          <h3 className="reviews-title">Customer Reviews</h3>
          <div className="reviews-stats">
            <div className="rating-display">
              <span className="rating-number">{averageRating}</span>
              <div className="stars-display">
                {[1, 2, 3, 4, 5].map(i => (
                  <Star
                    key={i}
                    size={20}
                    fill={i <= Math.round(averageRating) ? '#fbbf24' : 'none'}
                    color={i <= Math.round(averageRating) ? '#fbbf24' : '#9ca3af'}
                  />
                ))}
              </div>
              <span className="review-count">({reviews.length} reviews)</span>
            </div>
          </div>
        </div>
        
        {!isGuest && (
          <button
            onClick={() => setShowReviewForm(!showReviewForm)}
            className="btn-write-review"
          >
            Write a Review
          </button>
        )}
      </div>

      {showReviewForm && (
        <form onSubmit={handleSubmitReview} className="review-form">
          <div className="rating-input">
            <label>Your Rating</label>
            <div className="stars-input">
              {[1, 2, 3, 4, 5].map(i => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRating(i)}
                  onMouseEnter={() => setHoverRating(i)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="star-button"
                >
                  <Star
                    size={28}
                    fill={i <= (hoverRating || rating) ? '#fbbf24' : 'none'}
                    color={i <= (hoverRating || rating) ? '#fbbf24' : '#9ca3af'}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="review-comment">Your Review</label>
            <textarea
              id="review-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience with this product..."
              className="form-textarea"
              rows={4}
              required
            />
          </div>
          <div className="form-actions">
            <button type="submit" className="btn-submit-review">
              Submit Review
            </button>
            <button
              type="button"
              onClick={() => {
                setShowReviewForm(false);
                setComment('');
                setRating(0);
              }}
              className="btn-cancel"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="reviews-list">
        {reviews.length === 0 ? (
          <div className="empty-reviews">
            <p>No reviews yet. Be the first to review this product!</p>
          </div>
        ) : (
          reviews.map(review => (
            <div key={review.id} className={`review-card ${review.flagged ? 'review-flagged' : ''}`}>
              <div className="review-header">
                <div className="reviewer-info">
                  <span className="reviewer-name">{review.user?.username}</span>
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
                {review.flagged && (
                  <span className="flagged-badge">Flagged</span>
                )}
              </div>

              <p className="review-comment">{review.comment}</p>

              <div className="review-actions">
                <div className="review-votes">
                  <button
                    onClick={() => voteReview(productId, review.id, 'helpful')}
                    className={`vote-button ${(review.votedByHelpful || []).includes(currentUser.id) ? 'vote-button-active vote-button-helpful' : ''}`}
                    disabled={isGuest}
                  >
                    <ThumbsUp size={16} />
                    <span>{review.helpful}</span>
                  </button>
                  <button
                    onClick={() => voteReview(productId, review.id, 'notHelpful')}
                    className={`vote-button ${(review.votedByNotHelpful || []).includes(currentUser.id) ? 'vote-button-active vote-button-not-helpful' : ''}`}
                    disabled={isGuest}
                  >
                    <ThumbsDown size={16} />
                    <span>{review.notHelpful}</span>
                  </button>
                </div>

                <div className="review-buttons">
                  {canModerate && (
                    <>
                      <button
                        onClick={() => setShowReplyForm({ ...showReplyForm, [review.id]: !showReplyForm[review.id] })}
                        className="btn-reply"
                      >
                        <MessageCircle size={16} />
                        Reply
                      </button>
                      <button
                        onClick={() => {
                          setReviewToDelete({ productId, reviewId: review.id, userName: review.user?.username });
                          setDeleteReviewModalOpen(true);
                        }}
                        className="btn-delete-review"
                      >
                        <Trash2 size={16} />
                        Delete
                      </button>
                    </>
                  )}
                  {!isGuest && (
                    <button
                      onClick={() => flagReview(productId, review.id)}
                      className={`btn-flag ${review.flagged ? 'btn-flag-active' : ''}`}
                      title={review.flagged ? "Unflag review" : "Flag review"}
                    >
                      <Flag size={16} />
                      {review.flagged ? 'Unflag' : 'Flag'}
                    </button>
                  )}
                </div>
              </div>

              {showReplyForm[review.id] && canModerate && (
                <div className="reply-form">
                  <textarea
                    value={replyText[review.id] || ''}
                    onChange={(e) => setReplyText({ ...replyText, [review.id]: e.target.value })}
                    placeholder="Write a reply..."
                    className="reply-textarea"
                    rows={2}
                  />
                  <div className="reply-actions">
                    <button
                      onClick={() => handleReply(review.id)}
                      className="btn-send-reply"
                    >
                      <Send size={16} />
                      Send
                    </button>
                    <button
                      onClick={() => setShowReplyForm({ ...showReplyForm, [review.id]: false })}
                      className="btn-cancel-reply"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {review.replies && review.replies.length > 0 && (
                <div className="replies-section">
                  {review.replies.map(reply => (
                    <div key={reply.id} className="reply-card">
                      <div className="reply-header">
                        <span className="reply-author">{reply.userName}</span>
                        {reply.userRole !== ROLES.CUSTOMER && (
                          <span className="store-badge">Store Team</span>
                        )}
                        <span className="reply-date">{reply.date}</span>
                      </div>
                      <p className="reply-text">{reply.comment}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Delete Review Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteReviewModalOpen}
        onClose={() => {
          setDeleteReviewModalOpen(false);
          setReviewToDelete(null);
        }}
        onConfirm={() => {
          if (reviewToDelete) {
            deleteReview(reviewToDelete.productId, reviewToDelete.reviewId);
            setDeleteReviewModalOpen(false);
            setReviewToDelete(null);
          }
        }}
        title="Delete Review"
        message={
          <>
            Are you sure you want to delete this review by <strong>{reviewToDelete?.userName || ''}</strong>?
            <br />
            <br />
            This action cannot be undone.
          </>
        }
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
      />
    </div>
  );
}

export default ProductReviews;