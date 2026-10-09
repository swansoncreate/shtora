import { getRequest, setResponseStatus } from "@tanstack/react-start/server";
import { assertAppOrRpc } from "./remote.ts";

export class RpcDenied extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "RpcDenied";
    this.status = status;
  }
}

/** VPS server functions are ordinary POSTs. Reject them before local disk work. */
export function assertVpsServerFn(): void {
  let request: Request | undefined;
  try {
    request = getRequest();
  } catch {
    request = undefined;
  }
  const denied = request ? assertAppOrRpc(request) : Response.json({ error: "no rpc key" }, { status: 401 });
  if (!denied) return;
  try {
    setResponseStatus(denied.status);
  } catch {
    /* no response context in a unit test */
  }
  throw new RpcDenied(denied.status, denied.status === 503 ? "rpc key not configured" : "no rpc key or valid Shtora session");
}
