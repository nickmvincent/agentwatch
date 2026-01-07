import type { RouteDoc } from "./types";

export type ServiceRegistry = {
  service: string;
  routes: RouteDoc[];
};

export function createRegistry(
  service: string,
  routes: RouteDoc[]
): ServiceRegistry {
  return { service, routes };
}
