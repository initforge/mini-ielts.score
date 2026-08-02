import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  timeout: 10000,
  // INJ-003: session travels in the httpOnly cookie; send it on every request.
  withCredentials: true,
});

export default api;
