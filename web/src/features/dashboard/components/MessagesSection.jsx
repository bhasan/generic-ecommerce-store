import React, { useState } from 'react';
import { 
  MessageSquare, 
  Clock, 
  Mail, 
  Phone, 
  Package, 
  User,
  Check,
  CheckCheck,
  Trash2,
  Eye,
  ChevronDown,
  ChevronUp,
  Filter,
  Send,
  Reply
} from 'lucide-react';

const STATUS_OPTIONS = [
  { value: '', label: 'All Messages' },
  { value: 'NEW', label: 'New' },
  { value: 'READ', label: 'Read' },
  { value: 'RESOLVED', label: 'Resolved' }
];

function MessagesSection({
  isLoading,
  messages,
  formatDate,
  statusFilter,
  onStatusFilterChange,
  onMarkAsRead,
  onMarkAsResolved,
  onDelete,
  onReply,
  isReplying,
  currentUserId,
  isAdmin
}) {
  const [expandedMessageId, setExpandedMessageId] = useState(null);
  const [replyingToId, setReplyingToId] = useState(null);
  const [replyText, setReplyText] = useState('');

  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'NEW':
        return 'message-status-badge message-status-new';
      case 'READ':
        return 'message-status-badge message-status-read';
      case 'RESOLVED':
        return 'message-status-badge message-status-resolved';
      default:
        return 'message-status-badge';
    }
  };

  const getSubjectIcon = (subject) => {
    switch (subject) {
      case 'Order Issue':
      case 'Delivery Problem':
        return <Package size={16} />;
      default:
        return <MessageSquare size={16} />;
    }
  };

  const toggleExpanded = (messageId) => {
    setExpandedMessageId(expandedMessageId === messageId ? null : messageId);
  };

  const handleStartReply = (messageId) => {
    setReplyingToId(messageId);
    setReplyText('');
  };

  const handleCancelReply = () => {
    setReplyingToId(null);
    setReplyText('');
  };

  const handleSubmitReply = async (messageId) => {
    if (!replyText.trim() || replyText.length < 10) return;
    
    const success = await onReply(messageId, replyText);
    if (success) {
      setReplyingToId(null);
      setReplyText('');
    }
  };

  const newCount = messages.filter(m => m.status === 'NEW').length;

  return (
    <div className="dashboard-content-section surface-card">
      <div className="section-header-with-action">
        <h3 className="section-title">
          <MessageSquare size={24} />
          Contact Messages
          {newCount > 0 && (
            <span className="message-count-badge">{newCount} new</span>
          )}
        </h3>
        <div className="messages-filter">
          <Filter size={16} />
          <select
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="filter-select"
          >
            {STATUS_OPTIONS.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <div className="empty-state">
          <Clock size={64} className="empty-icon" />
          <p>Loading messages...</p>
        </div>
      ) : messages.length === 0 ? (
        <div className="empty-state">
          <MessageSquare size={64} className="empty-icon" />
          <p>
            {statusFilter 
              ? `No ${statusFilter.toLowerCase()} messages found.` 
              : 'No contact messages yet.'}
          </p>
        </div>
      ) : (
        <div className="messages-list">
          {messages.map(message => {
            const isExpanded = expandedMessageId === message.id;
            
            return (
              <div 
                key={message.id} 
                className={`message-card ${message.status === 'NEW' ? 'message-card-new' : ''} ${message.status === 'RESOLVED' ? 'message-card-resolved' : ''}`}
              >
                <div 
                  className="message-card-header"
                  onClick={() => toggleExpanded(message.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="message-card-info">
                    <div className="message-subject">
                      {getSubjectIcon(message.subject)}
                      <span>{message.subject}</span>
                    </div>
                    <span className={getStatusBadgeClass(message.status)}>
                      {message.status}
                    </span>
                    {message.orderId && (
                      <span className="message-order-badge">
                        <Package size={14} />
                        Order #{message.orderId}
                      </span>
                    )}
                  </div>
                  <div className="message-card-meta">
                    <span className="message-date">
                      <Clock size={14} />
                      {formatDate(message.createdAt)}
                    </span>
                    {isExpanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </div>
                </div>

                <div className="message-card-user">
                  <User size={14} />
                  <span className="message-user-name">{message.userName}</span>
                  <Mail size={14} />
                  <a href={`mailto:${message.userEmail}`} className="message-user-email">
                    {message.userEmail}
                  </a>
                  {message.userPhone && (
                    <>
                      <Phone size={14} />
                      <a href={`tel:${message.userPhone}`} className="message-user-phone">
                        {message.userPhone}
                      </a>
                    </>
                  )}
                </div>

                {isExpanded && (
                  <div className="message-card-body">
                    <div className="message-content">
                      <p>{message.message}</p>
                    </div>

                    {message.adminNotes && (
                      <div className="message-admin-notes">
                        <strong>Admin Notes:</strong>
                        <p>{message.adminNotes}</p>
                      </div>
                    )}

                    {/* Reply sent indicator */}
                    {message.repliedAt && (
                      <div className="message-reply-sent">
                        <div className="message-reply-sent-header">
                          <Mail size={16} />
                          <span>Email Reply Sent</span>
                          <span className="message-reply-sent-date">
                            {formatDate(message.repliedAt)} by {message.repliedByName || 'Support Team'}
                          </span>
                        </div>
                        {message.replyMessage && (
                          <div className="message-reply-sent-content">
                            <p>{message.replyMessage}</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Reply form */}
                    {replyingToId === message.id && (
                      <div className="message-reply-form">
                        <label htmlFor={`reply-${message.id}`}>Reply to {message.userName}:</label>
                        <textarea
                          id={`reply-${message.id}`}
                          value={replyText}
                          onChange={(e) => setReplyText(e.target.value)}
                          placeholder="Type your reply here... (min 10 characters)"
                          rows={4}
                          disabled={isReplying}
                        />
                        <div className="message-reply-form-actions">
                          <button
                            onClick={() => handleCancelReply()}
                            className="btn-action btn-cancel"
                            disabled={isReplying}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSubmitReply(message.id)}
                            className="btn-action btn-send-reply"
                            disabled={isReplying || replyText.length < 10}
                          >
                            {isReplying ? (
                              <>
                                <Clock size={16} />
                                <span>Sending...</span>
                              </>
                            ) : (
                              <>
                                <Send size={16} />
                                <span>Send Email Reply</span>
                              </>
                            )}
                          </button>
                        </div>
                        {replyText.length > 0 && replyText.length < 10 && (
                          <p className="reply-char-hint">Reply must be at least 10 characters ({10 - replyText.length} more needed)</p>
                        )}
                      </div>
                    )}

                    <div className="message-card-actions">
                      {message.status === 'NEW' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkAsRead(message.id);
                          }}
                          className="btn-action btn-mark-read"
                        >
                          <Eye size={16} />
                          <span>Mark as Read</span>
                        </button>
                      )}
                      {/* Reply button - only show if not already replied */}
                      {!message.repliedAt && replyingToId !== message.id && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleStartReply(message.id);
                          }}
                          className="btn-action btn-reply"
                        >
                          <Reply size={16} />
                          <span>Reply via Email</span>
                        </button>
                      )}
                      {message.status !== 'RESOLVED' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onMarkAsResolved(message.id);
                          }}
                          className="btn-action btn-resolve"
                        >
                          <CheckCheck size={16} />
                          <span>Mark Resolved</span>
                        </button>
                      )}
                      {isAdmin && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete(message.id, message.subject);
                          }}
                          className="btn-action btn-delete"
                        >
                          <Trash2 size={16} />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MessagesSection;
