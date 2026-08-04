import axios from "axios";
import { useAuthStore } from "../stores/authStore";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:3000/api",
});

api.interceptors.request.use((config) => {
  // TODO: adjuntar Authorization cuando el flujo de auth esté implementado
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
