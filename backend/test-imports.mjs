import('./src/services/aiService.js').then(() => console.log('aiService OK')).catch(e => console.error('aiService FAIL:', e.message));
import('./src/services/ragService.js').then(() => console.log('ragService OK')).catch(e => console.error('ragService FAIL:', e.message));
import('./src/services/triageService.js').then(() => console.log('triageService OK')).catch(e => console.error('triageService FAIL:', e.message));
