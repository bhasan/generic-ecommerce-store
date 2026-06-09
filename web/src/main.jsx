import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom';
import { AppProvider } from './context/AppContext';
import { injectBrandingTokens } from './hooks/useBrandingSSR';
import './index.css'
import App from './App.jsx'

const BRANDING_TIMEOUT_MS = 200;

Promise.race([
  injectBrandingTokens(),
  new Promise(resolve => setTimeout(resolve, BRANDING_TIMEOUT_MS)),
]).finally(() => {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <BrowserRouter>
        <AppProvider>
          <App />
        </AppProvider>
      </BrowserRouter>
    </StrictMode>,
  );
});
