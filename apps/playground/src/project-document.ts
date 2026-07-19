export type ProjectAdapter = "controller" | "sensor" | "pump1" | "pump2" | "reservoir" | "suctionHeader" | "dischargeHeader" | "estop" | "registry";

export interface ProjectEndpoint {
  instanceId: string;
  portId: string;
}

export interface ProjectConnection {
  id: string;
  from: ProjectEndpoint;
  to: ProjectEndpoint;
}

export interface ProjectInstance {
  id: string;
  adapter: ProjectAdapter;
  definition: {
    id: string;
    version: string;
    alias: string;
    renderer: string;
  };
  title: string;
  subtitle: string;
  position: { x: number; y: number };
}

export interface ProjectProgram {
  instanceId: string;
  profile: string;
  source: unknown;
}

export interface EngineeringProjectDocument {
  projectVersion: "0.1";
  id: string;
  title: string;
  instances: ProjectInstance[];
  connections: ProjectConnection[];
  programs: ProjectProgram[];
}

const ADAPTERS = new Set<ProjectAdapter>(["controller", "sensor", "pump1", "pump2", "reservoir", "suctionHeader", "dischargeHeader", "estop", "registry"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isEndpoint(value: unknown): value is ProjectEndpoint {
  return isObject(value) && isNonEmptyString(value["instanceId"]) && isNonEmptyString(value["portId"]);
}

function isInstance(value: unknown): value is ProjectInstance {
  if (!isObject(value) || !isObject(value["definition"]) || !isObject(value["position"])) return false;
  const definition = value["definition"];
  const position = value["position"];
  return isNonEmptyString(value["id"])
    && typeof value["adapter"] === "string"
    && ADAPTERS.has(value["adapter"] as ProjectAdapter)
    && isNonEmptyString(definition["id"])
    && isNonEmptyString(definition["version"])
    && isNonEmptyString(definition["alias"])
    && isNonEmptyString(definition["renderer"])
    && isNonEmptyString(value["title"])
    && typeof value["subtitle"] === "string"
    && typeof position["x"] === "number"
    && Number.isFinite(position["x"])
    && typeof position["y"] === "number"
    && Number.isFinite(position["y"]);
}

function isConnection(value: unknown): value is ProjectConnection {
  return isObject(value) && isNonEmptyString(value["id"]) && isEndpoint(value["from"]) && isEndpoint(value["to"]);
}

function isProgram(value: unknown): value is ProjectProgram {
  return isObject(value) && isNonEmptyString(value["instanceId"]) && isNonEmptyString(value["profile"]) && "source" in value;
}

function assertUnique(values: readonly string[], label: string): void {
  if (new Set(values).size !== values.length) throw new Error(`Engineering project contains duplicate ${label}`);
}

export function parseEngineeringProject(value: unknown): EngineeringProjectDocument {
  if (!isObject(value)
    || value["projectVersion"] !== "0.1"
    || !isNonEmptyString(value["id"])
    || !isNonEmptyString(value["title"])
    || !Array.isArray(value["instances"])
    || !value["instances"].every(isInstance)
    || !Array.isArray(value["connections"])
    || !value["connections"].every(isConnection)
    || !Array.isArray(value["programs"])
    || !value["programs"].every(isProgram)) {
    throw new Error("Invalid engineering project document");
  }

  const project = value as unknown as EngineeringProjectDocument;
  assertUnique(project.instances.map((instance) => instance.id), "instance IDs");
  assertUnique(project.connections.map((connection) => connection.id), "connection IDs");
  const instanceIds = new Set(project.instances.map((instance) => instance.id));
  if (project.connections.some((connection) => !instanceIds.has(connection.from.instanceId) || !instanceIds.has(connection.to.instanceId))) {
    throw new Error("Engineering project connection references an unknown instance");
  }
  if (project.programs.some((program) => !instanceIds.has(program.instanceId))) {
    throw new Error("Engineering project program references an unknown instance");
  }
  return project;
}
