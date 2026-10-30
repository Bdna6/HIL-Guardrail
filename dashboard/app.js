import { mountAccess } from './access.js';
const root = document.querySelector('#app');
if (location.pathname.startsWith('/local/')) {
  const { mountLocal } = await import('./local.js');
  try {
    await mountLocal(root);
  } catch (error) {
    root.textContent = error.message;
  }
} else if (location.pathname.startsWith('/demo/')) {
  const { mountDemo } = await import('./demo.js');
  mountDemo(root);
} else {
  mountAccess(root);
}
