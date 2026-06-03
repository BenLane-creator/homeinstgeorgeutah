import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
  index("routes/dashboard.tsx"),
  route("leads", "routes/leads.tsx"),
] satisfies RouteConfig;
