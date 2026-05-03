export function getAppRoutePath(location: Location = window.location): string {
  const hashRoute = getHashRoute(location.hash);

  if (hashRoute) {
    return normalizeRoutePath(hashRoute);
  }

  const path = normalizeRoutePath(location.pathname);
  const basePath = getBasePath();

  if (basePath !== "/" && (path === basePath || path.startsWith(`${basePath}/`))) {
    return normalizeRoutePath(path.slice(basePath.length) || "/");
  }

  return path;
}

export function createBrowserPath(appPath: string): string {
  const normalizedPath = normalizeRoutePath(appPath);
  const basePath = getBasePath();

  if (basePath === "/") {
    return normalizedPath;
  }

  return normalizedPath === "/" ? `${basePath}/` : `${basePath}${normalizedPath}`;
}

export function createAbsoluteAppUrl(appPath: string): string {
  return new URL(createBrowserPath(appPath), window.location.origin).toString();
}

function getHashRoute(hash: string): string | null {
  if (hash.startsWith("#!/")) {
    return hash.slice(2);
  }

  if (hash.startsWith("#/")) {
    return hash.slice(1);
  }

  return null;
}

function getBasePath(): string {
  const baseUrl = import.meta.env.BASE_URL || "/";
  const basePath = new URL(baseUrl, window.location.origin).pathname;

  return normalizeRoutePath(basePath);
}

function normalizeRoutePath(path: string): string {
  const trimmedPath = path.trim();
  const prefixedPath = trimmedPath.startsWith("/") ? trimmedPath : `/${trimmedPath}`;
  const withoutTrailingSlash = prefixedPath.replace(/\/+$/, "");

  return withoutTrailingSlash || "/";
}
