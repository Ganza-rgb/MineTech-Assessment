// CommonJS Dynamic Bridge Wrapper for Phusion Passenger
async function loadApp() {
    await import('./src/server.js');
}
loadApp();
