import React, { useState, useEffect } from 'react';
import './ContactForm.css';
import { useApp } from '../../context/AppContext';
import { Send, User, Mail, Phone, Package, AlertCircle, CheckCircle } from 'lucide-react';
import { submitContactForm } from '../../services/contactApi';

const SUBJECT_OPTIONS = [
  { value: '', label: 'Select a topic...' },
  { value: 'General Inquiry', label: 'General Inquiry' },
  { value: 'Order Issue', label: 'Order Issue' },
  { value: 'Product Question', label: 'Product Question' },
  { value: 'Delivery Problem', label: 'Delivery Problem' },
  { value: 'Feedback', label: 'Feedback' },
  { value: 'Other', label: 'Other' }
];

function ContactForm({ prefilledOrderId = '', prefilledSubject = '' }) {
  const { currentUser, showNotification } = useApp();
  
  const [formData, setFormData] = useState({
    subject: prefilledSubject || '',
    orderId: prefilledOrderId || '',
    message: ''
  });
  
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  // Update form when prefilled values change (e.g., from URL params)
  useEffect(() => {
    if (prefilledOrderId || prefilledSubject) {
      setFormData(prev => ({
        ...prev,
        orderId: prefilledOrderId || prev.orderId,
        subject: prefilledSubject || prev.subject
      }));
    }
  }, [prefilledOrderId, prefilledSubject]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = () => {
    const newErrors = {};

    if (!formData.subject) {
      newErrors.subject = 'Please select a topic';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Please enter your message';
    } else if (formData.message.trim().length < 10) {
      newErrors.message = 'Message must be at least 10 characters';
    }

    // Validate order ID format if provided
    if (formData.orderId && !/^\d+$/.test(formData.orderId)) {
      newErrors.orderId = 'Order ID must be a number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      await submitContactForm({
        subject: formData.subject,
        orderId: formData.orderId || null,
        message: formData.message.trim()
      });

      setIsSuccess(true);
      showNotification('Your message has been sent successfully!', 'success');
      
      // Reset form after success
      setFormData({
        subject: '',
        orderId: '',
        message: ''
      });

      // Reset success state after a delay
      setTimeout(() => {
        setIsSuccess(false);
      }, 5000);

    } catch (error) {
      console.error('Contact form error:', error);
      showNotification(
        error.message || 'Failed to send message. Please try again.',
        'error'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSuccess) {
    return (
      <div className="contact-form-success">
        <div className="success-icon">
          <CheckCircle size={48} />
        </div>
        <h3>Message Sent!</h3>
        <p>Thank you for reaching out. We'll get back to you as soon as possible.</p>
        <button 
          onClick={() => setIsSuccess(false)}
          className="btn-send-another"
        >
          Send Another Message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="contact-form">
      {/* User Info Display (read-only) */}
      <div className="contact-form-user-info">
        <div className="user-info-item">
          <User size={16} />
          <span>{currentUser.name}</span>
        </div>
        <div className="user-info-item">
          <Mail size={16} />
          <span>{currentUser.email}</span>
        </div>
        {currentUser.phoneNumber && (
          <div className="user-info-item">
            <Phone size={16} />
            <span>{currentUser.phoneNumber}</span>
          </div>
        )}
      </div>

      {/* Subject Dropdown */}
      <div className="form-group">
        <label htmlFor="subject" className="form-label">
          Topic <span className="required">*</span>
        </label>
        <select
          id="subject"
          name="subject"
          value={formData.subject}
          onChange={handleChange}
          className={`form-select ${errors.subject ? 'has-error' : ''}`}
          disabled={isSubmitting}
        >
          {SUBJECT_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        {errors.subject && (
          <span className="error-message">
            <AlertCircle size={14} />
            {errors.subject}
          </span>
        )}
      </div>

      {/* Order ID (optional) */}
      <div className="form-group">
        <label htmlFor="orderId" className="form-label">
          <Package size={16} />
          <span>Order ID</span>
          <span className="optional">(optional)</span>
        </label>
        <input
          id="orderId"
          name="orderId"
          type="text"
          value={formData.orderId}
          onChange={handleChange}
          className={`form-input ${errors.orderId ? 'has-error' : ''}`}
          placeholder="Enter your order number if applicable"
          disabled={isSubmitting}
        />
        {errors.orderId && (
          <span className="error-message">
            <AlertCircle size={14} />
            {errors.orderId}
          </span>
        )}
      </div>

      {/* Message Textarea */}
      <div className="form-group">
        <label htmlFor="message" className="form-label">
          Message <span className="required">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          value={formData.message}
          onChange={handleChange}
          className={`form-textarea ${errors.message ? 'has-error' : ''}`}
          placeholder="Please describe how we can help you..."
          rows={6}
          disabled={isSubmitting}
        />
        {errors.message && (
          <span className="error-message">
            <AlertCircle size={14} />
            {errors.message}
          </span>
        )}
        <span className="form-hint">
          {formData.message.length}/1000 characters
        </span>
      </div>

      {/* Submit Button */}
      <button 
        type="submit" 
        className="btn-submit-contact"
        disabled={isSubmitting}
      >
        <Send size={18} />
        <span>{isSubmitting ? 'Sending...' : 'Send Message'}</span>
      </button>
    </form>
  );
}

export default ContactForm;
