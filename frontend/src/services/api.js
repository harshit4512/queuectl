import axios from "axios";

// Create Axios instance pointing at the Express backend
const api = axios.create({
  baseURL: "/api",
  withCredentials: true, // Send cookies on every request
  headers: {
    "Content-Type": "application/json",
  },
});

// Access token stored in memory (not localStorage for XSS protection)
let _accessToken = null;

export const setAccessToken = (token) => {
  _accessToken = token;
};

export const getAccessToken = () => _accessToken;

// Request interceptor — attach access token if present
api.interceptors.request.use((config) => {
  if (_accessToken) {
    config.headers["Authorization"] = `Bearer ${_accessToken}`;
  }
  return config;
});

// Response interceptor — on 401 TOKEN_EXPIRED, try refresh once
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;

    if (
      error.response?.status === 401 &&
      error.response?.data?.code === "TOKEN_EXPIRED" &&
      !original._retry
    ) {
      original._retry = true;
      try {
        const { data } = await api.post("/auth/refresh");
        setAccessToken(data.accessToken);
        original.headers["Authorization"] = `Bearer ${data.accessToken}`;
        return api(original);
      } catch {
        setAccessToken(null);
        window.location.href = "/login";
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  }
);

// ---- Auth API ----
export const authApi = {
  register: (username, password) =>
    api.post("/auth/register", { username, password }),
  login: (username, password) =>
    api.post("/auth/login", { username, password }),
  logout: () => api.post("/auth/logout"),
  me: () => api.get("/auth/me"),
  refresh: () => api.post("/auth/refresh"),
};

// ---- Jobs API ----
export const jobsApi = {
  list: (params = {}) => api.get("/jobs", { params }),
  create: (payload) => api.post("/jobs", payload),
  get: (id) => api.get(`/jobs/${id}`),
  counts: () => api.get("/jobs/stats/counts"),
};

// ---- DLQ API ----
export const dlqApi = {
  list: () => api.get("/dlq"),
  retry: (id) => api.post(`/dlq/${id}/retry`),
  purge: () => api.delete("/dlq"),
};

// ---- Config API ----
export const configApi = {
  list: () => api.get("/config"),
  get: (key) => api.get(`/config/${key}`),
  set: (key, value) => api.put(`/config/${key}`, { value }),
  reset: () => api.post("/config/reset"),
};

// ---- Workers API ----
export const workersApi = {
  list: () => api.get("/workers"),
  supervisorStatus: () => api.get("/workers/supervisor"),
  startSupervisor: (count) => api.post("/workers/supervisor/start", { count }),
  stopSupervisor: (force = false) => api.post("/workers/supervisor/stop", { force }),
};

export default api;
