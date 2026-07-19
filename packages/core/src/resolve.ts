import {
  hasErrors,
  validateDeviceModel,
  validatePackageManifest,
  type ArtifactRef,
  type DeviceModel,
  type Diagnostic,
  type PackageManifest,
  type ValidationMode,
} from "@open-device/spec";

import { computeIntegrity } from "./integrity.ts";

export class PackageError extends Error {
  readonly diagnostics: Diagnostic[];

  constructor(message: string, diagnostics: Diagnostic[] = []) {
    super(message);
    this.name = "PackageError";
    this.diagnostics = diagnostics;
  }
}

async function readBytes(url: URL): Promise<Uint8Array> {
  if (url.protocol === "file:") {
    if (typeof Bun === "undefined") {
      throw new PackageError(`file: URLs require a Bun host: ${url.href}`);
    }
    return await Bun.file(url).bytes();
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new PackageError(`${url.href} responded with ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function toManifestUrl(location: string): URL {
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(location)) {
    return new URL(location);
  }
  if (typeof Bun === "undefined") {
    throw new PackageError(`plain paths require a Bun host: ${location}`);
  }
  return Bun.pathToFileURL(location);
}

export class ResolvedPackage {
  readonly manifest: PackageManifest;
  readonly manifestBytes: Uint8Array;
  readonly manifestUrl: URL;
  readonly diagnostics: Diagnostic[];
  /** Directory URL every package-relative href is resolved against. */
  readonly baseUrl: URL;

  constructor(
    manifest: PackageManifest,
    manifestBytes: Uint8Array,
    manifestUrl: URL,
    diagnostics: Diagnostic[],
  ) {
    this.manifest = manifest;
    this.manifestBytes = manifestBytes;
    this.manifestUrl = manifestUrl;
    this.diagnostics = diagnostics;
    this.baseUrl = new URL(".", manifestUrl);
  }

  resolveHref(href: string): URL {
    const resolved = new URL(href, this.baseUrl);
    const isAbsolute = /^[A-Za-z][A-Za-z0-9+.-]*:/.test(href);
    if (!isAbsolute && !resolved.href.startsWith(this.baseUrl.href)) {
      throw new PackageError(`"${href}" escapes the package root ${this.baseUrl.href}`);
    }
    return resolved;
  }

  /** Load an artifact and verify declared integrity and size before returning bytes. */
  async loadArtifact(ref: ArtifactRef): Promise<Uint8Array> {
    const bytes = await readBytes(this.resolveHref(ref.href));
    if (ref.size !== undefined && bytes.length !== ref.size) {
      throw new PackageError(
        `${ref.href}: expected ${ref.size} bytes, received ${bytes.length}`,
      );
    }
    if (ref.integrity !== undefined) {
      const actual = await computeIntegrity(bytes);
      if (actual !== ref.integrity) {
        throw new PackageError(
          `${ref.href}: integrity mismatch (expected ${ref.integrity}, computed ${actual})`,
        );
      }
    }
    return bytes;
  }

  async loadJsonArtifact(ref: ArtifactRef): Promise<unknown> {
    const bytes = await this.loadArtifact(ref);
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch (error) {
      throw new PackageError(`${ref.href} is not valid JSON: ${String(error)}`);
    }
  }

  async loadModel(): Promise<DeviceModel> {
    const data = await this.loadJsonArtifact(this.manifest.model);
    const diagnostics = validateDeviceModel(data);
    if (hasErrors(diagnostics)) {
      throw new PackageError(`invalid device model`, diagnostics);
    }
    return data as DeviceModel;
  }
}

/**
 * Load and validate an `open-device.json` manifest from an HTTPS URL, a
 * `file:` URL, a filesystem path, or a package directory containing the
 * manifest. Validation diagnostics are returned on the resolved package;
 * schema errors throw.
 */
export async function resolvePackage(
  location: string,
  options: { mode?: ValidationMode } = {},
): Promise<ResolvedPackage> {
  let manifestUrl = toManifestUrl(location);
  if (!manifestUrl.pathname.endsWith(".json")) {
    manifestUrl = new URL(
      `${manifestUrl.pathname.replace(/\/$/, "")}/open-device.json${manifestUrl.search}`,
      manifestUrl,
    );
  }

  const bytes = await readBytes(manifestUrl);
  let data: unknown;
  try {
    data = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new PackageError(`${manifestUrl.href} is not valid JSON: ${String(error)}`);
  }

  const diagnostics = validatePackageManifest(data, options.mode ?? "source");
  if (hasErrors(diagnostics)) {
    throw new PackageError(`invalid package manifest ${manifestUrl.href}`, diagnostics);
  }
  return new ResolvedPackage(data as PackageManifest, bytes, manifestUrl, diagnostics);
}
