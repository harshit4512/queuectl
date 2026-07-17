import { create } from "zustand";
import { authApi, jobsApi, dlqApi, configApi, workersApi, setAccessToken } from "../services/api.js";

const useStore = create((set, get) => ({
  // ---- Auth State ----
  user: null,
  isAuthLoading: true,

  login: async (username, password) => {
    const { data } = await authApi.login(username, password);
    setAccessToken(data.accessToken);
    set({ user: data.user });
    return data.user;
  },

  register: async (username, password) => {
    const { data } = await authApi.register(username, password);
    return data;
  },

  logout: async () => {
    try {
      await authApi.logout();
    } catch {
      // ignore
    }
    setAccessToken(null);
    set({ user: null });
  },

  checkAuth: async () => {
    try {
      // First try to refresh token (uses httpOnly cookie)
      const { data: refreshData } = await authApi.refresh();
      setAccessToken(refreshData.accessToken);
      // Then fetch user profile
      const { data: meData } = await authApi.me();
      set({ user: meData, isAuthLoading: false });
    } catch {
      setAccessToken(null);
      set({ user: null, isAuthLoading: false });
    }
  },

  // ---- Jobs State ----
  jobs: [],
  jobsLoading: false,
  jobFilters: { state: "", sort: "newest", limit: "" },

  setJobFilters: (filters) => {
    set((s) => ({ jobFilters: { ...s.jobFilters, ...filters } }));
  },

  fetchJobs: async () => {
    set({ jobsLoading: true });
    try {
      const { jobFilters } = get();
      const params = {};
      if (jobFilters.state) params.state = jobFilters.state;
      if (jobFilters.sort) params.sort = jobFilters.sort;
      if (jobFilters.limit) params.limit = parseInt(jobFilters.limit);
      const { data } = await jobsApi.list(params);
      set({ jobs: data, jobsLoading: false });
    } catch (err) {
      set({ jobsLoading: false });
      throw err;
    }
  },

  // ---- Stats State ----
  stats: null,
  statsLoading: false,

  fetchStats: async () => {
    set({ statsLoading: true });
    try {
      const { data } = await jobsApi.counts();
      set({ stats: data, statsLoading: false });
    } catch {
      set({ statsLoading: false });
    }
  },

  // ---- DLQ State ----
  dlqJobs: [],
  dlqLoading: false,

  fetchDlq: async () => {
    set({ dlqLoading: true });
    try {
      const { data } = await dlqApi.list();
      set({ dlqJobs: data, dlqLoading: false });
    } catch {
      set({ dlqLoading: false });
    }
  },

  dlqRetry: async (id) => {
    await dlqApi.retry(id);
    await get().fetchDlq();
    await get().fetchStats();
  },

  dlqPurge: async () => {
    const { data } = await dlqApi.purge();
    await get().fetchDlq();
    await get().fetchStats();
    return data.purgedCount;
  },

  // ---- Config State ----
  config: {},
  configLoading: false,

  fetchConfig: async () => {
    set({ configLoading: true });
    try {
      const { data } = await configApi.list();
      set({ config: data, configLoading: false });
    } catch {
      set({ configLoading: false });
    }
  },

  setConfigValue: async (key, value) => {
    const { data } = await configApi.set(key, value);
    set((s) => ({ config: { ...s.config, [key]: data.value } }));
  },

  resetConfig: async () => {
    await configApi.reset();
    await get().fetchConfig();
  },

  // ---- Workers State ----
  workers: [],
  supervisorActive: false,
  workersLoading: false,

  fetchWorkers: async () => {
    set({ workersLoading: true });
    try {
      const { data } = await workersApi.list();
      set({ workers: data.workers, supervisorActive: data.supervisorActive, workersLoading: false });
    } catch {
      set({ workersLoading: false });
    }
  },

  startSupervisor: async (count) => {
    const { data } = await workersApi.startSupervisor(count);
    await get().fetchWorkers();
    return data;
  },

  stopSupervisor: async (force = false) => {
    const { data } = await workersApi.stopSupervisor(force);
    await get().fetchWorkers();
    return data;
  },

  // ---- UI State ----
  toasts: [],

  addToast: (message, type = "success") => {
    const id = Date.now();
    set((s) => ({ toasts: [...s.toasts, { id, message, type }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4000);
  },

  removeToast: (id) => {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

export default useStore;
