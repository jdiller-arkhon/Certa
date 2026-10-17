/**
 * Runs before hydration: keeps the install prompt for the Install button and stops the
 * mini-infobar. The root layout inlines it, so it lives outside the client module ./install.
 */
export const INSTALL_CAPTURE_SCRIPT = `window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__certaInstallPrompt=e;window.dispatchEvent(new Event('certa:installable'));});window.addEventListener('appinstalled',function(){window.__certaInstallPrompt=null;window.dispatchEvent(new Event('certa:installed'));});`;
