import { isAgentflowRelativePath } from "../../shared/agentflowPaths";

export class AgentflowWriteConfirmationRequiredError extends Error {
  constructor(message = "agentflow_write_requires_confirmation") {
    super(message);
    this.name = "AgentflowWriteConfirmationRequiredError";
  }
}

export function requireAgentflowWriteConfirmation(
  relPath: string,
  confirmed?: boolean,
): void {
  if (isAgentflowRelativePath(relPath) && !confirmed) {
    throw new AgentflowWriteConfirmationRequiredError();
  }
}

export function requireAgentflowMutation(confirmed?: boolean): void {
  if (!confirmed) {
    throw new AgentflowWriteConfirmationRequiredError();
  }
}
