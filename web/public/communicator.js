// Authorize.Net Accept Hosted IFrame communicator.
// Loaded by the hosted payment page inside its iframe; relays each event
// (resizeWindow / cancel / transactResponse) up to the merchant checkout window.
// External (not inline) because Authorize.Net applies a CSP to this iframe that
// blocks inline script execution.
(function () {
  function relay(params) {
    if (!params || params.length === 0) return;
    // checkout (our origin) -> Authorize.Net payment iframe -> this communicator iframe
    var target = (window.parent && window.parent.parent) ? window.parent.parent : window.parent;
    if (target) {
      target.postMessage(params, window.location.origin);
    }
  }
  function current() {
    // Authorize.Net passes the payload in the URL fragment (hash); fall back to the
    // query string for safety.
    var hash = window.location.hash ? window.location.hash.substring(1) : '';
    return hash || (window.location.search ? window.location.search.substring(1) : '');
  }
  relay(current());
  // The same iframe is reused for subsequent events via hash updates.
  window.addEventListener('hashchange', function () { relay(current()); });
})();
