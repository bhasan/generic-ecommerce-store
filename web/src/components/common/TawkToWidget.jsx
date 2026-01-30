import { useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';

/**
 * Tawk.to Live Chat Widget
 * 
 * This component integrates Tawk.to live chat for authenticated users.
 * It automatically sets user attributes for better support context.
 * 
 * Configuration:
 * - Set VITE_TAWK_PROPERTY_ID and VITE_TAWK_WIDGET_ID in your .env file
 * - Or replace the default values below with your Tawk.to credentials
 * 
 * To get your credentials:
 * 1. Sign up at https://www.tawk.to
 * 2. Go to Administration > Channels > Chat Widget
 * 3. Copy the Property ID and Widget ID from the embed code
 */

// Tawk.to configuration - replace with your actual credentials
const TAWK_PROPERTY_ID = import.meta.env.VITE_TAWK_PROPERTY_ID || 'YOUR_PROPERTY_ID';
const TAWK_WIDGET_ID = import.meta.env.VITE_TAWK_WIDGET_ID || 'YOUR_WIDGET_ID';

function TawkToWidget() {
  const { currentUser, isAuthenticated } = useApp();
  const isScriptLoaded = useRef(false);
  const hasSetAttributes = useRef(false);

  // Check if user is a guest
  const isGuest = currentUser?.email === 'guest@smokestation.com';

  useEffect(() => {
    // Don't load for guests or unauthenticated users
    if (!isAuthenticated || isGuest) {
      return;
    }

    // Don't load if property ID is not configured
    if (TAWK_PROPERTY_ID === 'YOUR_PROPERTY_ID') {
      console.warn('Tawk.to: Property ID not configured. Set VITE_TAWK_PROPERTY_ID in your .env file.');
      return;
    }

    // Initialize Tawk_API object
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = new Date();

    // Only load the script once
    if (!isScriptLoaded.current) {
      const script = document.createElement('script');
      script.async = true;
      script.src = `https://embed.tawk.to/${TAWK_PROPERTY_ID}/${TAWK_WIDGET_ID}`;
      script.charset = 'UTF-8';
      script.setAttribute('crossorigin', '*');
      
      // Add script to document
      const firstScript = document.getElementsByTagName('script')[0];
      firstScript.parentNode.insertBefore(script, firstScript);
      
      isScriptLoaded.current = true;
    }

    // Set user attributes when Tawk.to loads
    window.Tawk_API.onLoad = function() {
      if (!hasSetAttributes.current && currentUser && !isGuest) {
        setUserAttributes();
        hasSetAttributes.current = true;
      }
    };

    // Also try to set attributes if already loaded
    if (window.Tawk_API.setAttributes && !hasSetAttributes.current) {
      setUserAttributes();
      hasSetAttributes.current = true;
    }

  }, [isAuthenticated, isGuest]);

  // Update user attributes when user changes
  useEffect(() => {
    if (isAuthenticated && !isGuest && currentUser && window.Tawk_API?.setAttributes) {
      setUserAttributes();
    }
  }, [currentUser, isAuthenticated, isGuest]);

  const setUserAttributes = () => {
    if (!currentUser || isGuest) return;

    try {
      window.Tawk_API.setAttributes({
        name: currentUser.name || 'Customer',
        email: currentUser.email || '',
        phone: currentUser.phoneNumber || '',
        // Custom attributes
        userId: currentUser.id?.toString() || '',
        role: (currentUser.roles?.[0] || currentUser.role || 'CUSTOMER')
      }, function(error) {
        if (error) {
          console.warn('Tawk.to: Error setting attributes', error);
        }
      });
    } catch (error) {
      console.warn('Tawk.to: Failed to set user attributes', error);
    }
  };

  // Cleanup on unmount (hide widget when user logs out)
  useEffect(() => {
    return () => {
      if (window.Tawk_API?.hideWidget) {
        window.Tawk_API.hideWidget();
      }
    };
  }, []);

  // Show widget when authenticated, hide when not
  useEffect(() => {
    if (!window.Tawk_API) return;

    if (isAuthenticated && !isGuest) {
      if (window.Tawk_API.showWidget) {
        window.Tawk_API.showWidget();
      }
    } else {
      if (window.Tawk_API.hideWidget) {
        window.Tawk_API.hideWidget();
      }
    }
  }, [isAuthenticated, isGuest]);

  // This component doesn't render anything visible
  // The Tawk.to widget is injected by the script
  return null;
}

export default TawkToWidget;
