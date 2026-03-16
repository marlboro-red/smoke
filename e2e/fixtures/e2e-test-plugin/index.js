// E2E test fixture plugin
// Uses the Smoke plugin bootstrap API to render a simple greeting
window.__smokePlugin.onReady(function(ctx) {
  var root = document.getElementById('plugin-root');
  root.innerHTML = '<div id="e2e-plugin-content">' +
    '<h2 class="e2e-greeting">Hello from e2e-test-plugin!</h2>' +
    '<p class="e2e-version">v' + ctx.manifest.version + '</p>' +
    '<p class="e2e-session">Session: ' + ctx.sessionId + '</p>' +
    '</div>';

  // Listen for messages from the host
  ctx.onMessage('ping', function(payload) {
    ctx.sendMessage('pong', { received: payload });
  });
});
