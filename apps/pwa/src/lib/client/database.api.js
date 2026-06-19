import { sendJson } from './http.js';

export const reset = () => sendJson('POST', '/api/reset');
