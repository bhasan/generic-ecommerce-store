import React, { useEffect, useRef } from 'react';
import './HelpPage.css';
import { useSearchParams } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { 
  HelpCircle, 
  Phone, 
  MapPin, 
  MessageSquare, 
  Mail,
  ExternalLink,
  MessageCircle
} from 'lucide-react';
import ContactForm from './ContactForm';

function HelpPage() {
  const { currentUser } = useApp();
  const [searchParams] = useSearchParams();
  const contactFormRef = useRef(null);
  
  // Get order ID from URL params (for order-specific help)
  const orderIdFromUrl = searchParams.get('orderId');

  // Scroll to contact form if coming from order help
  useEffect(() => {
    if (orderIdFromUrl && contactFormRef.current) {
      setTimeout(() => {
        contactFormRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [orderIdFromUrl]);

  const openTawkChat = () => {
    if (window.Tawk_API && window.Tawk_API.maximize) {
      window.Tawk_API.maximize();
    }
  };

  return (
    <div className="help-page">
      <div className="help-header">
        <div className="help-header-icon">
          <HelpCircle size={48} />
        </div>
        <h1 className="help-title">How Can We Help?</h1>
        <p className="help-subtitle">
          We're here to assist you. Choose the best way to reach us below.
        </p>
      </div>

      {/* Contact Info Cards */}
      <div className="help-contact-grid">
        {/* Phone / WhatsApp Card */}
        <div className="help-contact-card">
          <div className="help-contact-icon phone-icon">
            <Phone size={28} />
          </div>
          <h3 className="help-contact-title">Call or WhatsApp</h3>
          <p className="help-contact-description">
            Reach us directly for immediate assistance
          </p>
          <a 
            href="tel:+12814541418" 
            className="help-contact-value"
          >
            (281) 454-1418
          </a>
          <div className="help-contact-actions">
            <a 
              href="tel:+12814541418" 
              className="btn-help-action btn-primary"
            >
              <Phone size={16} />
              <span>Call Now</span>
            </a>
            <a 
              href="https://wa.me/12814541418" 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn-help-action btn-secondary"
            >
              <MessageSquare size={16} />
              <span>WhatsApp</span>
              <ExternalLink size={14} />
            </a>
          </div>
        </div>

        {/* Store Location Card */}
        <div className="help-contact-card">
          <div className="help-contact-icon location-icon">
            <MapPin size={28} />
          </div>
          <h3 className="help-contact-title">Visit Our Store</h3>
          <p className="help-contact-description">
            Walk in during business hours
          </p>
          <address className="help-contact-address">
            9400 S Texas 6 Suite C<br />
            Houston, TX 77083
          </address>
          <div className="help-contact-actions">
            <a 
              href="https://maps.google.com/?q=9400+S+Texas+6+Suite+C,+Houston,+TX+77083" 
              target="_blank" 
              rel="noopener noreferrer"
              className="btn-help-action btn-primary"
            >
              <MapPin size={16} />
              <span>Get Directions</span>
              <ExternalLink size={14} />
            </a>
          </div>
        </div>

        {/* Quick Actions Card */}
        <div className="help-contact-card">
          <div className="help-contact-icon chat-icon">
            <MessageCircle size={28} />
          </div>
          <h3 className="help-contact-title">Online Support</h3>
          <p className="help-contact-description">
            Get help through our online channels
          </p>
          <div className="help-contact-actions stacked">
            <button 
              onClick={openTawkChat}
              className="btn-help-action btn-primary full-width"
            >
              <MessageCircle size={16} />
              <span>Start Live Chat</span>
            </button>
            <a 
              href="#contact-form"
              onClick={(e) => {
                e.preventDefault();
                contactFormRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
              className="btn-help-action btn-secondary full-width"
            >
              <Mail size={16} />
              <span>Send Us a Message</span>
            </a>
          </div>
        </div>
      </div>

      {/* Contact Form Section */}
      <div ref={contactFormRef} id="contact-form" className="help-form-section">
        <div className="help-form-header">
          <Mail size={32} />
          <div>
            <h2 className="help-form-title">Send Us a Message</h2>
            <p className="help-form-subtitle">
              Fill out the form below and we'll get back to you as soon as possible.
            </p>
          </div>
        </div>
        
        <ContactForm 
          prefilledOrderId={orderIdFromUrl}
          prefilledSubject={orderIdFromUrl ? 'Order Issue' : ''}
        />
      </div>
    </div>
  );
}

export default HelpPage;
